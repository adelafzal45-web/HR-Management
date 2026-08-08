import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FindOperator } from 'typeorm';

import { MeetingsService } from './meetings.service';
import { Meeting, MeetingAudienceType, MeetingStatus } from './meetings.entity';
import { MeetingParticipant } from './meeting-participant.entity';
import { User } from '../users/user.entity';

/**
 * In-memory fakes, in the style of holidays.service.spec.ts: plain classes wired
 * straight into the constructor rather than a Nest testing module, since none of
 * this logic needs the DI container.
 *
 * Only what the service actually calls is modelled. The two behaviours worth
 * covering here are audience resolution (which decides who gets invited, and is
 * the one place a mistake silently emails the wrong people) and the guards
 * around dates and cancelled meetings.
 */
class FakeMeetingRepo {
  rows: Meeting[] = [];
  private sequence = 0;

  create(partial: Partial<Meeting>): Meeting {
    return { ...partial } as Meeting;
  }

  async save(entity: Meeting): Promise<Meeting> {
    if (!entity.meeting_id) {
      this.sequence += 1;
      entity.meeting_id = `m-${this.sequence}`;
    }
    const idx = this.rows.findIndex((r) => r.meeting_id === entity.meeting_id);
    if (idx >= 0) this.rows[idx] = entity;
    else this.rows.push(entity);
    return entity;
  }

  async findOne({
    where,
  }: {
    where: Record<string, any>;
  }): Promise<Meeting | null> {
    return this.rows.find((r) => r.meeting_id === where.meeting_id) ?? null;
  }

  async remove(entity: Meeting): Promise<Meeting> {
    this.rows = this.rows.filter((r) => r.meeting_id !== entity.meeting_id);
    return entity;
  }
}

class FakeParticipantRepo {
  rows: MeetingParticipant[] = [];
  private sequence = 0;

  create(partial: Partial<MeetingParticipant>): MeetingParticipant {
    return { ...partial } as MeetingParticipant;
  }

  // The service saves an array inside the transaction and single rows elsewhere.
  async save(
    input: MeetingParticipant | MeetingParticipant[],
  ): Promise<MeetingParticipant | MeetingParticipant[]> {
    const many = Array.isArray(input) ? input : [input];
    for (const row of many) {
      if (!row.meeting_participant_id) {
        this.sequence += 1;
        row.meeting_participant_id = `mp-${this.sequence}`;
      }
      this.rows.push(row);
    }
    return input;
  }

  async find({
    where,
  }: {
    where: Record<string, any>;
  }): Promise<MeetingParticipant[]> {
    return this.rows.filter((r) => r.meeting_id === where.meeting_id);
  }

  async delete(where: Record<string, any>): Promise<void> {
    this.rows = this.rows.filter((r) => r.meeting_id !== where.meeting_id);
  }
}

class FakeUserRepo {
  constructor(public rows: User[] = []) {}

  async find(
    { where }: { where: Record<string, any> } = { where: {} },
  ): Promise<User[]> {
    return this.rows.filter((r) => {
      if (where.status !== undefined && r.status !== where.status) return false;
      // `In([...])` arrives as a FindOperator carrying the array in `.value`.
      if (where.user_id instanceof FindOperator) {
        return (where.user_id.value as string[]).includes(r.user_id);
      }
      if (typeof where.user_id === 'string') return r.user_id === where.user_id;
      return true;
    });
  }

  async findOne({
    where,
  }: {
    where: Record<string, any>;
  }): Promise<User | null> {
    return this.rows.find((r) => r.user_id === where.user_id) ?? null;
  }

  /**
   * The DEPARTMENT branch joins `user.department` (User has no scalar
   * department_id), so the chain is faked rather than the where-object.
   */
  createQueryBuilder() {
    let departmentId: string | undefined;
    const chain = {
      leftJoin: () => chain,
      where: (_sql: string, params: Record<string, any>) => {
        departmentId = params.departmentId;
        return chain;
      },
      andWhere: () => chain,
      getMany: async () =>
        this.rows.filter(
          (r) =>
            r.status === true && r.department?.department_id === departmentId,
        ),
    };
    return chain;
  }
}

function user(id: string, overrides: Partial<User> = {}): User {
  return {
    user_id: id,
    first_name: 'Test',
    last_name: id,
    email: `${id}@example.com`,
    status: true,
    ...overrides,
  } as User;
}

/** A future instant, so parseFutureDate accepts it regardless of run time. */
function futureIso(daysAhead = 3): string {
  return new Date(Date.now() + daysAhead * 86400000).toISOString();
}

describe('MeetingsService', () => {
  function make(users: User[] = [], seedMeetings: Meeting[] = []) {
    const meetingRepo = new FakeMeetingRepo();
    meetingRepo.rows = seedMeetings;
    const participantRepo = new FakeParticipantRepo();
    const userRepo = new FakeUserRepo(users);

    const notifier = {
      notifyInvited: jest.fn().mockResolvedValue(undefined),
      notifyUpdated: jest.fn().mockResolvedValue(undefined),
      notifyCancelled: jest.fn().mockResolvedValue(undefined),
    };

    // The service resolves repositories off the transaction's manager, so the
    // fake hands back the same instances the assertions inspect.
    const dataSource = {
      transaction: async (cb: (manager: any) => Promise<any>) =>
        cb({
          getRepository: (entity: unknown) =>
            entity === Meeting ? meetingRepo : participantRepo,
        }),
    };

    const service = new MeetingsService(
      meetingRepo as any,
      participantRepo as any,
      userRepo as any,
      notifier as any,
      dataSource as any,
    );

    return { service, meetingRepo, participantRepo, userRepo, notifier };
  }

  const baseDto = {
    title: 'Quarterly Review',
    scheduled_at: futureIso(),
    audience_type: MeetingAudienceType.SPECIFIC,
    participant_ids: ['u-2'],
  };

  describe('audience resolution', () => {
    it('invites exactly the selected people for a Specific audience', async () => {
      const { service, participantRepo } = make([
        user('u-1'),
        user('u-2'),
        user('u-3'),
      ]);

      const meeting = await service.create(baseDto as any, 'u-1');

      const invited = participantRepo.rows
        .filter((r) => r.meeting_id === meeting.meeting_id)
        .map((r) => r.user_id)
        .sort();
      expect(invited).toEqual(['u-1', 'u-2']);
    });

    it('always includes the organizer, even when they were not selected', async () => {
      const { service, participantRepo } = make([user('u-1'), user('u-2')]);

      await service.create(
        { ...baseDto, participant_ids: ['u-2'] } as any,
        'u-1',
      );

      expect(participantRepo.rows.map((r) => r.user_id)).toContain('u-1');
    });

    it('does not duplicate the organizer when they are also selected', async () => {
      const { service, participantRepo } = make([user('u-1'), user('u-2')]);

      await service.create(
        { ...baseDto, participant_ids: ['u-1', 'u-2'] } as any,
        'u-1',
      );

      const organizerRows = participantRepo.rows.filter(
        (r) => r.user_id === 'u-1',
      );
      expect(organizerRows).toHaveLength(1);
    });

    it('resolves a Department audience to that department’s active employees only', async () => {
      const engineering = { department_id: 'd-1' } as any;
      const sales = { department_id: 'd-2' } as any;
      const { service, participantRepo } = make([
        user('u-1', { department: sales }),
        user('u-2', { department: engineering }),
        user('u-3', { department: engineering }),
        user('u-4', { department: engineering, status: false }),
      ]);

      await service.create(
        {
          ...baseDto,
          audience_type: MeetingAudienceType.DEPARTMENT,
          audience_department_id: 'd-1',
          participant_ids: undefined,
        } as any,
        'u-1',
      );

      // u-2 and u-3 from the department, plus the organizer. u-4 is inactive.
      expect(participantRepo.rows.map((r) => r.user_id).sort()).toEqual([
        'u-1',
        'u-2',
        'u-3',
      ]);
    });

    it('resolves an All audience to every active employee', async () => {
      const { service, participantRepo } = make([
        user('u-1'),
        user('u-2'),
        user('u-3', { status: false }),
      ]);

      await service.create(
        {
          ...baseDto,
          audience_type: MeetingAudienceType.ALL,
          participant_ids: undefined,
        } as any,
        'u-1',
      );

      expect(participantRepo.rows.map((r) => r.user_id).sort()).toEqual([
        'u-1',
        'u-2',
      ]);
    });

    it('stores the audience scope so the UI can render it without the chip list', async () => {
      const { service } = make([
        user('u-1', { department: { department_id: 'd-1' } as any }),
      ]);

      const meeting = await service.create(
        {
          ...baseDto,
          audience_type: MeetingAudienceType.DEPARTMENT,
          audience_department_id: 'd-1',
          participant_ids: undefined,
        } as any,
        'u-1',
      );

      expect(meeting.audience_type).toBe(MeetingAudienceType.DEPARTMENT);
      expect(meeting.audience_department_id).toBe('d-1');
    });

    it('clears audience_department_id when the audience is not Department', async () => {
      const { service } = make([user('u-1'), user('u-2')]);

      const meeting = await service.create(
        { ...baseDto, audience_department_id: 'd-1' } as any,
        'u-1',
      );

      expect(meeting.audience_department_id).toBeNull();
    });
  });

  describe('rejected input', () => {
    it('rejects a meeting scheduled in the past', async () => {
      const { service } = make([user('u-1'), user('u-2')]);

      await expect(
        service.create(
          { ...baseDto, scheduled_at: '2020-01-01T09:00:00.000Z' } as any,
          'u-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an unparseable date', async () => {
      const { service } = make([user('u-1'), user('u-2')]);

      await expect(
        service.create(
          { ...baseDto, scheduled_at: 'not-a-date' } as any,
          'u-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a Specific audience with no participants', async () => {
      const { service } = make([user('u-1')]);

      await expect(
        service.create({ ...baseDto, participant_ids: [] } as any, 'u-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a Specific audience where nobody selected is active', async () => {
      const { service } = make([user('u-1'), user('u-2', { status: false })]);

      await expect(
        service.create({ ...baseDto, participant_ids: ['u-2'] } as any, 'u-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a Department audience with no department chosen', async () => {
      const { service } = make([user('u-1')]);

      await expect(
        service.create(
          {
            ...baseDto,
            audience_type: MeetingAudienceType.DEPARTMENT,
            participant_ids: undefined,
          } as any,
          'u-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a Department audience with no active employees in it', async () => {
      const { service } = make([
        user('u-1', { department: { department_id: 'd-9' } as any }),
        user('u-2', {
          department: { department_id: 'd-1' } as any,
          status: false,
        }),
      ]);

      await expect(
        service.create(
          {
            ...baseDto,
            audience_type: MeetingAudienceType.DEPARTMENT,
            audience_department_id: 'd-1',
            participant_ids: undefined,
          } as any,
          'u-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('nothing is written when the audience fails to resolve', async () => {
      const { service, meetingRepo, participantRepo } = make([user('u-1')]);

      await expect(
        service.create({ ...baseDto, participant_ids: [] } as any, 'u-1'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(meetingRepo.rows).toHaveLength(0);
      expect(participantRepo.rows).toHaveLength(0);
    });
  });

  describe('notification', () => {
    it('notifies the resolved recipients once the meeting is committed', async () => {
      const { service, notifier } = make([user('u-1'), user('u-2')]);

      const meeting = await service.create(baseDto as any, 'u-1');

      expect(notifier.notifyInvited).toHaveBeenCalledTimes(1);
      const [notifiedMeeting, recipients] =
        notifier.notifyInvited.mock.calls[0];
      expect(notifiedMeeting.meeting_id).toBe(meeting.meeting_id);
      expect(recipients.map((r: User) => r.user_id).sort()).toEqual([
        'u-1',
        'u-2',
      ]);
    });

    it('carries the organizer’s per-meeting channel flags through to the notifier', async () => {
      const { service, notifier } = make([user('u-1'), user('u-2')]);

      await service.create(
        { ...baseDto, notify_email: false, notify_in_app: true } as any,
        'u-1',
      );

      // The notifier is the single gate that reads these; the service must not
      // silently normalise them away before it gets there.
      const [notifiedMeeting] = notifier.notifyInvited.mock.calls[0];
      expect(notifiedMeeting.notify_email).toBe(false);
      expect(notifiedMeeting.notify_in_app).toBe(true);
    });

    it('defaults both channels on when the organizer sends neither flag', async () => {
      const { service } = make([user('u-1'), user('u-2')]);

      const meeting = await service.create(baseDto as any, 'u-1');

      expect(meeting.notify_email).toBe(true);
      expect(meeting.notify_in_app).toBe(true);
    });
  });

  describe('update', () => {
    async function seeded() {
      const ctx = make([user('u-1'), user('u-2'), user('u-3')]);
      const meeting = await ctx.service.create(baseDto as any, 'u-1');
      ctx.notifier.notifyInvited.mockClear();
      return { ...ctx, meeting };
    }

    it('saves an agenda-only edit without re-notifying anyone', async () => {
      const { service, notifier, meeting } = await seeded();

      const updated = await service.update(meeting.meeting_id, {
        agenda: 'Updated agenda',
      } as any);

      expect(updated.agenda).toBe('Updated agenda');
      expect(notifier.notifyUpdated).not.toHaveBeenCalled();
    });

    it('re-notifies when the time moves', async () => {
      const { service, notifier, meeting } = await seeded();

      await service.update(meeting.meeting_id, {
        scheduled_at: futureIso(10),
      } as any);

      expect(notifier.notifyUpdated).toHaveBeenCalledTimes(1);
    });

    it('re-notifies when the location changes', async () => {
      const { service, notifier, meeting } = await seeded();

      await service.update(meeting.meeting_id, {
        location: 'https://meet.example.com/new',
      } as any);

      expect(notifier.notifyUpdated).toHaveBeenCalledTimes(1);
    });

    it('replaces the invitee rows when the audience changes', async () => {
      const { service, participantRepo, meeting } = await seeded();

      await service.update(meeting.meeting_id, {
        audience_type: MeetingAudienceType.SPECIFIC,
        participant_ids: ['u-3'],
      } as any);

      expect(participantRepo.rows.map((r) => r.user_id).sort()).toEqual([
        'u-1',
        'u-3',
      ]);
    });

    it('rejects moving a meeting into the past', async () => {
      const { service, meeting } = await seeded();

      await expect(
        service.update(meeting.meeting_id, {
          scheduled_at: '2020-01-01T09:00:00.000Z',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects editing a cancelled meeting', async () => {
      const { service, meeting } = await seeded();
      await service.cancel(meeting.meeting_id, 'Postponed');

      await expect(
        service.update(meeting.meeting_id, { title: 'Revived' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException for an unknown id', async () => {
      const { service } = make([user('u-1')]);

      await expect(
        service.update('missing', { title: 'x' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('cancel and remove', () => {
    async function seeded() {
      const ctx = make([user('u-1'), user('u-2')]);
      const meeting = await ctx.service.create(baseDto as any, 'u-1');
      return { ...ctx, meeting };
    }

    it('stores the trimmed reason and notifies participants', async () => {
      const { service, notifier, meeting } = await seeded();

      const cancelled = await service.cancel(
        meeting.meeting_id,
        '  Client rescheduled  ',
      );

      expect(cancelled.status).toBe(MeetingStatus.CANCELLED);
      expect(cancelled.cancellation_reason).toBe('Client rescheduled');
      expect(notifier.notifyCancelled).toHaveBeenCalledTimes(1);
    });

    it('rejects cancelling twice', async () => {
      const { service, meeting } = await seeded();
      await service.cancel(meeting.meeting_id, 'Postponed');

      await expect(
        service.cancel(meeting.meeting_id, 'Again'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('deletes without notifying — deletion is an administrative correction', async () => {
      const { service, meetingRepo, notifier, meeting } = await seeded();

      await service.remove(meeting.meeting_id);

      expect(meetingRepo.rows).toHaveLength(0);
      expect(notifier.notifyCancelled).not.toHaveBeenCalled();
    });

    it('throws NotFoundException deleting an unknown id', async () => {
      const { service } = make([user('u-1')]);

      await expect(service.remove('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
