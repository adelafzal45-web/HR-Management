import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { Meeting } from './meetings.entity';
import { User } from '../users/user.entity';
import { MailService } from '../mail/mail.service';
import { APP_BASE_URL } from '../mail/template-renderer.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationCategory } from '../notifications/notifications.entity';

/** Where the bell and the email button both send participants. */
const MEETINGS_LINK = '/meetings';

/**
 * Dual-channel push (in-app notification + email) for the three meeting events.
 *
 * Modelled on `LeaveNotifierService`, with one deliberate difference: leave
 * always notifies, whereas every send here is gated on the meeting's own
 * `notify_in_app` / `notify_email` flags. The organizer sets those per meeting,
 * so an unchecked box must mean *nothing queued* — not a suppressed-but-sent
 * notification — which is why the check sits here, at the single point every
 * meeting notification passes through, rather than at each call site.
 *
 * Recipient resolution is simpler than leave's, too: the participant rows were
 * already resolved and persisted by `MeetingsService`, so there is no
 * role-based fan-out to reconstruct. The organizer is among them.
 */
@Injectable()
export class MeetingNotifierService {
  private readonly logger = new Logger(MeetingNotifierService.name);

  constructor(
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
  ) {}

  /** A new meeting was scheduled — invite everyone on the participant list. */
  async notifyInvited(
    meeting: Meeting,
    recipients: User[],
    manager?: EntityManager,
  ): Promise<void> {
    const organizerName = this.nameOf(meeting.organizer);
    const when = this.formatWhen(meeting.scheduled_at);

    await this.dispatch(
      meeting,
      recipients,
      {
        category: NotificationCategory.MEETING_INVITED,
        title: `Meeting invitation: ${meeting.title}`,
        message: `${organizerName} invited you to "${meeting.title}" on ${when}${
          meeting.location ? ` (${meeting.location})` : ''
        }.`,
        templateKey: 'meeting_invitation',
      },
      manager,
    );
  }

  /** Time, location, agenda or the invitee list changed on a live meeting. */
  async notifyUpdated(
    meeting: Meeting,
    recipients: User[],
    manager?: EntityManager,
  ): Promise<void> {
    const when = this.formatWhen(meeting.scheduled_at);

    await this.dispatch(
      meeting,
      recipients,
      {
        category: NotificationCategory.MEETING_UPDATED,
        title: `Meeting updated: ${meeting.title}`,
        message: `"${meeting.title}" has been updated. It is now on ${when}${
          meeting.location ? ` (${meeting.location})` : ''
        }.`,
        templateKey: 'meeting_updated',
      },
      manager,
    );
  }

  /** Cancelled, with the organizer's reason carried into both channels. */
  async notifyCancelled(
    meeting: Meeting,
    recipients: User[],
    manager?: EntityManager,
  ): Promise<void> {
    const when = this.formatWhen(meeting.scheduled_at);
    const reason = meeting.cancellation_reason?.trim();

    await this.dispatch(
      meeting,
      recipients,
      {
        category: NotificationCategory.MEETING_CANCELLED,
        title: `Meeting cancelled: ${meeting.title}`,
        message: [
          `"${meeting.title}" scheduled for ${when} was cancelled.`,
          reason ? `Reason: ${reason}` : null,
        ]
          .filter(Boolean)
          .join(' '),
        templateKey: 'meeting_cancelled',
      },
      manager,
    );
  }

  // ==========================================
  // INTERNAL
  // ==========================================

  /**
   * The single gate. Both channels are opt-out per meeting, and each is checked
   * before any work is done for it — no rows created, no mail queued.
   */
  private async dispatch(
    meeting: Meeting,
    recipients: User[],
    event: {
      category: NotificationCategory;
      title: string;
      message: string;
      templateKey: string;
    },
    manager?: EntityManager,
  ): Promise<void> {
    if (recipients.length === 0) return;

    if (meeting.notify_in_app) {
      await this.notifications.pushMany(
        recipients.map((r) => r.user_id),
        {
          title: event.title,
          message: event.message,
          category: event.category,
          link: MEETINGS_LINK,
          referenceId: meeting.meeting_id,
          referenceType: 'Meeting',
        },
        manager,
      );
    }

    if (meeting.notify_email) {
      const context = this.mailContext(meeting);
      for (const recipient of recipients) {
        await this.enqueueTo(recipient, event.templateKey, context);
      }
    }

    if (!meeting.notify_in_app && !meeting.notify_email) {
      this.logger.log(
        `Meeting ${meeting.meeting_id}: both channels off, nothing dispatched.`,
      );
    }
  }

  /**
   * The per-meeting half of the mail context. `employee_name` is added per
   * recipient in `enqueueTo`, since it is the only value that varies.
   *
   * Nothing is left empty: the renderer's sanitiser skips blank values, which
   * would leave a literal `{{meeting_location}}` visible in the email — the same
   * trap `LeaveNotifierService` documents for `decision_reason`.
   */
  private mailContext(meeting: Meeting): Record<string, string> {
    return {
      meeting_title: meeting.title,
      meeting_datetime: this.formatWhen(meeting.scheduled_at),
      meeting_location: meeting.location?.trim() || 'To be confirmed',
      meeting_agenda: meeting.agenda?.trim() || 'No agenda was provided.',
      organizer_name: this.nameOf(meeting.organizer),
      cancellation_reason:
        meeting.cancellation_reason?.trim() || 'No reason provided.',
      meeting_url: `${APP_BASE_URL}${MEETINGS_LINK}`,
    };
  }

  private async enqueueTo(
    user: User,
    templateKey: string,
    context: Record<string, string>,
  ): Promise<void> {
    if (!user.email) return;
    await this.mail.enqueue({
      templateKey,
      to: user.email,
      toName: this.nameOf(user),
      relatedUserId: user.user_id,
      context: { ...context, employee_name: this.nameOf(user) },
    });
  }

  private nameOf(user?: User | null): string {
    if (!user) return 'A colleague';
    return (
      `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'A colleague'
    );
  }

  /**
   * Rendered in the organization's locale-independent form (`02 Sep 2026,
   * 14:30`) rather than the recipient's, because the queue is processed
   * server-side and there is no per-user timezone on `User` to render against.
   */
  private formatWhen(scheduledAt: Date): string {
    const date =
      scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
    if (Number.isNaN(date.getTime())) return String(scheduledAt);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
}
