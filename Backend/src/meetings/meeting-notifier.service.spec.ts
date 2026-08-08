import { MeetingNotifierService } from './meeting-notifier.service';
import { Meeting, MeetingStatus } from './meetings.entity';
import { User } from '../users/user.entity';
import { NotificationCategory } from '../notifications/notifications.entity';

/**
 * The point of these tests is the channel gate.
 *
 * `notify_email` / `notify_in_app` are per-meeting opt-outs the organizer sets in
 * the form, and "unchecked" has to mean *nothing queued* on that channel — not a
 * row written and then suppressed downstream. That gate lives in one private
 * method every meeting notification passes through, so it is worth pinning
 * directly: a regression here would quietly email people who were promised no
 * email.
 */
function meeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    meeting_id: 'm-1',
    title: 'Quarterly Review',
    scheduled_at: new Date('2026-09-02T14:30:00.000Z'),
    location: 'Conference Room A',
    agenda: 'Roadmap and hiring',
    notify_email: true,
    notify_in_app: true,
    status: MeetingStatus.SCHEDULED,
    cancellation_reason: null,
    organizer_id: 'u-1',
    organizer: {
      user_id: 'u-1',
      first_name: 'Sarah',
      last_name: 'Khan',
      email: 'sarah@example.com',
    } as User,
    ...overrides,
  } as Meeting;
}

function recipients(): User[] {
  return [
    {
      user_id: 'u-1',
      first_name: 'Sarah',
      last_name: 'Khan',
      email: 'sarah@example.com',
    },
    {
      user_id: 'u-2',
      first_name: 'Ali',
      last_name: 'Raza',
      email: 'ali@example.com',
    },
  ] as User[];
}

describe('MeetingNotifierService', () => {
  function make() {
    const mail = { enqueue: jest.fn().mockResolvedValue({ queued: true }) };
    const notifications = { pushMany: jest.fn().mockResolvedValue(undefined) };
    const service = new MeetingNotifierService(
      mail as any,
      notifications as any,
    );
    return { service, mail, notifications };
  }

  describe('channel gating', () => {
    it('sends on both channels when both flags are on', async () => {
      const { service, mail, notifications } = make();

      await service.notifyInvited(meeting(), recipients());

      expect(notifications.pushMany).toHaveBeenCalledTimes(1);
      expect(mail.enqueue).toHaveBeenCalledTimes(2);
    });

    it('queues no email when notify_email is off', async () => {
      const { service, mail, notifications } = make();

      await service.notifyInvited(
        meeting({ notify_email: false }),
        recipients(),
      );

      expect(mail.enqueue).not.toHaveBeenCalled();
      expect(notifications.pushMany).toHaveBeenCalledTimes(1);
    });

    it('writes no in-app notification when notify_in_app is off', async () => {
      const { service, mail, notifications } = make();

      await service.notifyInvited(
        meeting({ notify_in_app: false }),
        recipients(),
      );

      expect(notifications.pushMany).not.toHaveBeenCalled();
      expect(mail.enqueue).toHaveBeenCalledTimes(2);
    });

    it('does nothing at all when both flags are off', async () => {
      const { service, mail, notifications } = make();

      await service.notifyInvited(
        meeting({ notify_email: false, notify_in_app: false }),
        recipients(),
      );

      expect(notifications.pushMany).not.toHaveBeenCalled();
      expect(mail.enqueue).not.toHaveBeenCalled();
    });

    it('gates the update and cancel events on the same flags', async () => {
      const { service, mail, notifications } = make();
      const silent = meeting({ notify_email: false, notify_in_app: false });

      await service.notifyUpdated(silent, recipients());
      await service.notifyCancelled(
        { ...silent, cancellation_reason: 'Postponed' } as Meeting,
        recipients(),
      );

      expect(notifications.pushMany).not.toHaveBeenCalled();
      expect(mail.enqueue).not.toHaveBeenCalled();
    });

    it('skips both channels when there are no recipients', async () => {
      const { service, mail, notifications } = make();

      await service.notifyInvited(meeting(), []);

      expect(notifications.pushMany).not.toHaveBeenCalled();
      expect(mail.enqueue).not.toHaveBeenCalled();
    });

    it('skips a recipient with no email address without failing the batch', async () => {
      const { service, mail } = make();
      const withoutEmail = [
        { user_id: 'u-2', first_name: 'Ali', last_name: 'Raza', email: null },
        {
          user_id: 'u-3',
          first_name: 'Zoya',
          last_name: 'Ahmed',
          email: 'zoya@example.com',
        },
      ] as unknown as User[];

      await service.notifyInvited(meeting(), withoutEmail);

      expect(mail.enqueue).toHaveBeenCalledTimes(1);
      expect(mail.enqueue.mock.calls[0][0].to).toBe('zoya@example.com');
    });
  });

  describe('event payloads', () => {
    it('uses the right category, template and deep link per event', async () => {
      const { service, mail, notifications } = make();

      await service.notifyInvited(meeting(), recipients());
      expect(notifications.pushMany.mock.calls[0][1]).toMatchObject({
        category: NotificationCategory.MEETING_INVITED,
        link: '/meetings',
        referenceId: 'm-1',
        referenceType: 'Meeting',
      });
      expect(mail.enqueue.mock.calls[0][0].templateKey).toBe(
        'meeting_invitation',
      );

      await service.notifyUpdated(meeting(), recipients());
      expect(notifications.pushMany.mock.calls[1][1].category).toBe(
        NotificationCategory.MEETING_UPDATED,
      );

      await service.notifyCancelled(
        meeting({
          status: MeetingStatus.CANCELLED,
          cancellation_reason: 'Client rescheduled',
        }),
        recipients(),
      );
      expect(notifications.pushMany.mock.calls[2][1].category).toBe(
        NotificationCategory.MEETING_CANCELLED,
      );
    });

    it('carries the cancellation reason into both channels', async () => {
      const { service, mail, notifications } = make();

      await service.notifyCancelled(
        meeting({
          status: MeetingStatus.CANCELLED,
          cancellation_reason: 'Client rescheduled',
        }),
        recipients(),
      );

      expect(notifications.pushMany.mock.calls[0][1].message).toContain(
        'Client rescheduled',
      );
      expect(mail.enqueue.mock.calls[0][0].context.cancellation_reason).toBe(
        'Client rescheduled',
      );
    });

    it('substitutes placeholder text for empty optional fields', async () => {
      const { service, mail } = make();

      // A blank value would leave a literal {{meeting_location}} in the email —
      // the renderer's sanitiser skips empty context entries.
      await service.notifyInvited(
        meeting({ location: null, agenda: null }),
        recipients(),
      );

      const context = mail.enqueue.mock.calls[0][0].context;
      expect(context.meeting_location).toBe('To be confirmed');
      expect(context.meeting_agenda).toBe('No agenda was provided.');
      expect(context.cancellation_reason).toBe('No reason provided.');
    });

    it('personalises each email while sharing the meeting context', async () => {
      const { service, mail } = make();

      await service.notifyInvited(meeting(), recipients());

      const [first, second] = mail.enqueue.mock.calls.map((c) => c[0]);
      expect(first.context.employee_name).toBe('Sarah Khan');
      expect(second.context.employee_name).toBe('Ali Raza');
      expect(first.context.meeting_title).toBe(second.context.meeting_title);
      expect(first.relatedUserId).toBe('u-1');
    });
  });
});
