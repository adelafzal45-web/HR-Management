import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { Meeting, MeetingAudienceType, MeetingStatus } from './meetings.entity';
import { MeetingParticipant } from './meeting-participant.entity';
import { User } from '../users/user.entity';
import { MeetingNotifierService } from './meeting-notifier.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';

export type MeetingListFilters = {
  search?: string;
  status?: MeetingStatus;
  departmentId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export type MeetingListResult = { data: Meeting[]; total: number };

@Injectable()
export class MeetingsService {
  constructor(
    @InjectRepository(Meeting)
    private readonly meetingRepo: Repository<Meeting>,

    @InjectRepository(MeetingParticipant)
    private readonly participantRepo: Repository<MeetingParticipant>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    private readonly notifier: MeetingNotifierService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Schedule a meeting.
   *
   * The meeting row and its participant rows are written in one transaction so
   * a meeting can never exist with a half-resolved invitee list. Notification
   * happens *after* the transaction commits: a queued email for a meeting that
   * was then rolled back is unrecallable, whereas a commit followed by a failed
   * enqueue only costs a log line (MailService.enqueue never throws).
   */
  async create(dto: CreateMeetingDto, organizerId: string): Promise<Meeting> {
    const scheduledAt = this.parseFutureDate(dto.scheduled_at);
    const recipients = await this.resolveAudience(dto, organizerId);

    const meetingId = await this.dataSource.transaction(async (manager) => {
      const meeting = manager.getRepository(Meeting).create({
        title: dto.title.trim(),
        scheduled_at: scheduledAt,
        location: dto.location?.trim() || null,
        agenda: dto.agenda?.trim() || null,
        audience_type: dto.audience_type,
        audience_department_id:
          dto.audience_type === MeetingAudienceType.DEPARTMENT
            ? dto.audience_department_id
            : null,
        notify_email: dto.notify_email ?? true,
        notify_in_app: dto.notify_in_app ?? true,
        status: MeetingStatus.SCHEDULED,
        organizer_id: organizerId,
      });

      const saved = await manager.getRepository(Meeting).save(meeting);

      await manager.getRepository(MeetingParticipant).save(
        recipients.map((user) =>
          manager.getRepository(MeetingParticipant).create({
            meeting_id: saved.meeting_id,
            user_id: user.user_id,
          }),
        ),
      );

      return saved.meeting_id;
    });

    const meeting = await this.findOne(meetingId);
    await this.notifier.notifyInvited(meeting, recipients);
    return meeting;
  }

  /** Management view: every meeting, filtered and paginated. */
  async findAll(filters: MeetingListFilters = {}): Promise<MeetingListResult> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.max(1, filters.pageSize ?? 10);

    const qb = this.meetingRepo
      .createQueryBuilder('meeting')
      .leftJoinAndSelect('meeting.organizer', 'organizer')
      .leftJoinAndSelect('meeting.audienceDepartment', 'audienceDepartment')
      .loadRelationCountAndMap(
        'meeting.participantCount',
        'meeting.participants',
      )
      .orderBy('meeting.scheduled_at', 'DESC');

    if (filters.search?.trim()) {
      const needle = `%${filters.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(meeting.title) LIKE :needle OR LOWER(meeting.location) LIKE :needle OR LOWER(meeting.agenda) LIKE :needle)',
        { needle },
      );
    }

    if (filters.status) {
      qb.andWhere('meeting.status = :status', { status: filters.status });
    }

    if (filters.departmentId) {
      qb.andWhere('meeting.audience_department_id = :departmentId', {
        departmentId: filters.departmentId,
      });
    }

    if (filters.from) {
      qb.andWhere('meeting.scheduled_at >= :from', { from: filters.from });
    }

    if (filters.to) {
      qb.andWhere('meeting.scheduled_at <= :to', { to: filters.to });
    }

    const [data, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { data, total };
  }

  /**
   * Self-service view: meetings the user organizes or is invited to.
   *
   * Backs the permission-free `/meetings/me` route, so it must scope by the
   * caller's own id and nothing else — an employee holds no `meeting.view`.
   */
  async findMine(userId: string): Promise<Meeting[]> {
    return this.meetingRepo
      .createQueryBuilder('meeting')
      .leftJoinAndSelect('meeting.organizer', 'organizer')
      .leftJoinAndSelect('meeting.audienceDepartment', 'audienceDepartment')
      .loadRelationCountAndMap(
        'meeting.participantCount',
        'meeting.participants',
      )
      .where(
        `(meeting.organizer_id = :userId
          OR EXISTS (
            SELECT 1 FROM meeting_participants mp
            WHERE mp.meeting_id = meeting.meeting_id AND mp.user_id = :userId
          ))`,
        { userId },
      )
      .orderBy('meeting.scheduled_at', 'DESC')
      .getMany();
  }

  async findOne(id: string): Promise<Meeting> {
    const meeting = await this.meetingRepo.findOne({
      where: { meeting_id: id },
      relations: { participants: true },
    });

    if (!meeting) {
      throw new NotFoundException(`Meeting ${id} not found.`);
    }

    return meeting;
  }

  /**
   * Edit a scheduled meeting.
   *
   * Participants are only re-resolved when the audience actually changed, so an
   * agenda typo fix does not churn the invitee rows. Re-notification is limited
   * to changes participants must act on — time, location or who is invited; an
   * agenda-only edit is saved silently rather than mailing everyone again.
   */
  async update(id: string, dto: UpdateMeetingDto): Promise<Meeting> {
    const existing = await this.findOne(id);

    if (existing.status === MeetingStatus.CANCELLED) {
      throw new BadRequestException(
        'This meeting was cancelled and can no longer be edited.',
      );
    }

    const scheduledAt = dto.scheduled_at
      ? this.parseFutureDate(dto.scheduled_at)
      : existing.scheduled_at;

    const audienceChanged =
      dto.audience_type !== undefined &&
      (dto.audience_type !== existing.audience_type ||
        dto.audience_department_id !== existing.audience_department_id ||
        dto.participant_ids !== undefined);

    const timeChanged =
      dto.scheduled_at !== undefined &&
      new Date(scheduledAt).getTime() !==
        new Date(existing.scheduled_at).getTime();

    const locationChanged =
      dto.location !== undefined &&
      (dto.location?.trim() || null) !== existing.location;

    if (dto.title !== undefined) existing.title = dto.title.trim();
    if (dto.location !== undefined)
      existing.location = dto.location?.trim() || null;
    if (dto.agenda !== undefined) existing.agenda = dto.agenda?.trim() || null;
    if (dto.notify_email !== undefined)
      existing.notify_email = dto.notify_email;
    if (dto.notify_in_app !== undefined)
      existing.notify_in_app = dto.notify_in_app;
    if (dto.status !== undefined) existing.status = dto.status;
    existing.scheduled_at = scheduledAt;
    existing.updated_at = new Date();

    if (audienceChanged && dto.audience_type) {
      existing.audience_type = dto.audience_type;
      existing.audience_department_id =
        dto.audience_type === MeetingAudienceType.DEPARTMENT
          ? (dto.audience_department_id ?? null)
          : null;
    }

    await this.meetingRepo.save(existing);

    let recipients: User[];
    if (audienceChanged && dto.audience_type) {
      recipients = await this.resolveAudience(
        {
          audience_type: dto.audience_type,
          audience_department_id: dto.audience_department_id,
          participant_ids: dto.participant_ids,
        },
        existing.organizer_id,
      );

      await this.participantRepo.delete({ meeting_id: id });
      await this.participantRepo.save(
        recipients.map((user) =>
          this.participantRepo.create({
            meeting_id: id,
            user_id: user.user_id,
          }),
        ),
      );
    } else {
      recipients = await this.loadParticipants(id);
    }

    const meeting = await this.findOne(id);

    if (timeChanged || locationChanged || audienceChanged) {
      await this.notifier.notifyUpdated(meeting, recipients);
    }

    return meeting;
  }

  /** Cancel with a reason, and tell everyone who was invited. */
  async cancel(id: string, reason: string): Promise<Meeting> {
    const existing = await this.findOne(id);

    if (existing.status === MeetingStatus.CANCELLED) {
      throw new BadRequestException('This meeting is already cancelled.');
    }

    existing.status = MeetingStatus.CANCELLED;
    existing.cancellation_reason = reason.trim();
    existing.updated_at = new Date();
    await this.meetingRepo.save(existing);

    const recipients = await this.loadParticipants(id);
    const meeting = await this.findOne(id);
    await this.notifier.notifyCancelled(meeting, recipients);

    return meeting;
  }

  /**
   * Hard delete. Participant rows go with it via `ON DELETE CASCADE`; no
   * notification is sent, because a deleted meeting is an administrative
   * correction (created by mistake), whereas `cancel` is the participant-facing
   * action.
   */
  async remove(id: string): Promise<{ message: string }> {
    const meeting = await this.findOne(id);
    await this.meetingRepo.remove(meeting);
    return { message: 'Meeting deleted.' };
  }

  // ==========================================
  // INTERNAL
  // ==========================================

  /**
   * Turn the organizer's audience choice into concrete users.
   *
   * The result is persisted as `meeting_participants` rows rather than being
   * recomputed on read: "everyone in Engineering" must mean the people who were
   * in Engineering when the invitation went out, otherwise a later transfer
   * would silently rewrite the record of who was invited and emailed.
   *
   * The organizer is always included — they are attending their own meeting,
   * and it keeps `/meetings/me` correct for them without a special case.
   */
  private async resolveAudience(
    dto: Pick<
      CreateMeetingDto,
      'audience_type' | 'audience_department_id' | 'participant_ids'
    >,
    organizerId: string,
  ): Promise<User[]> {
    let users: User[] = [];

    switch (dto.audience_type) {
      case MeetingAudienceType.SPECIFIC: {
        const ids = dto.participant_ids ?? [];
        if (ids.length === 0) {
          throw new BadRequestException(
            'Select at least one participant, or choose a department or everyone.',
          );
        }
        users = await this.userRepo.find({
          where: { user_id: In(ids), status: true },
        });
        if (users.length === 0) {
          throw new BadRequestException(
            'None of the selected participants are active employees.',
          );
        }
        break;
      }

      case MeetingAudienceType.DEPARTMENT: {
        if (!dto.audience_department_id) {
          throw new BadRequestException(
            'Choose a department for a department-wide meeting.',
          );
        }
        users = await this.userRepo
          .createQueryBuilder('user')
          .leftJoin('user.department', 'department')
          .where('department.department_id = :departmentId', {
            departmentId: dto.audience_department_id,
          })
          .andWhere('user.status = :active', { active: true })
          .getMany();
        if (users.length === 0) {
          throw new BadRequestException(
            'That department has no active employees to invite.',
          );
        }
        break;
      }

      case MeetingAudienceType.ALL: {
        users = await this.userRepo.find({ where: { status: true } });
        break;
      }
    }

    if (!users.some((u) => u.user_id === organizerId)) {
      const organizer = await this.userRepo.findOne({
        where: { user_id: organizerId },
      });
      if (organizer) users = [...users, organizer];
    }

    return users;
  }

  /** The persisted invitee list, as `User` rows the notifier can mail. */
  private async loadParticipants(meetingId: string): Promise<User[]> {
    const rows = await this.participantRepo.find({
      where: { meeting_id: meetingId },
    });
    return rows.map((row) => row.user).filter(Boolean);
  }

  /**
   * Rejecting a past date here rather than in the DTO: `@IsDateString` can only
   * check the shape, and "in the future" depends on request time.
   */
  private parseFutureDate(value: string | Date): Date {
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Provide a valid meeting date and time.');
    }

    if (date.getTime() <= Date.now()) {
      throw new BadRequestException(
        'The meeting date and time must be in the future.',
      );
    }

    return date;
  }
}
