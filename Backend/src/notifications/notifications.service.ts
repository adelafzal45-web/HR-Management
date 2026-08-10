import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { randomUUID } from 'crypto';

import {
  Notification,
  NotificationAudienceType,
  NotificationCategory,
} from './notifications.entity';
import { User } from '../users/user.entity';

import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import {
  ATTACHMENT_UPLOAD,
  deleteUpload,
  saveUpload,
  validateUpload,
  type UploadedFile,
} from '../common/upload/image-upload';

/** One addressed, system-generated notice. */
export interface PushNotificationInput {
  recipientId: string;
  title: string;
  message: string;
  category: NotificationCategory;
  link?: string | null;
  referenceId?: string | null;
  referenceType?: string | null;
}

/**
 * One composed notification as the Sent view sees it: the batch, not its rows.
 */
export interface SentNotificationSummary {
  notification_id: string;
  batch_id: string | null;
  title: string;
  message: string;
  category: NotificationCategory;
  audience_type: NotificationAudienceType;
  audience_department_id: string | null;
  audience_department_name: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  attachment_size: number | null;
  recipient_count: number;
  read_count: number;
  created_at: Date;
  created_by_id: string | null;
  created_by_name: string | null;
}

/** What the compose form gets back after staging a file. */
export interface AttachmentMetadata {
  url: string;
  name: string;
  mime: string;
  size: number;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly dataSource: DataSource,
  ) {}

  /**
   * Compose and deliver a notification to a chosen audience.
   *
   * One row is written per resolved recipient rather than a single shared row.
   * That is the whole fix: a shared row has one `read_at` for the entire
   * company, so it cannot be addressed *or* marked read by an individual — the
   * previous implementation saved exactly that and every notification reached
   * everybody regardless of intent.
   *
   * The rows are written in one transaction so a notification can never be
   * half-delivered, and the audience is resolved *before* the transaction
   * opens so a bad audience costs nothing (same ordering as
   * `MeetingsService.create`).
   */
  async create(
    dto: CreateNotificationDto,
    createdById: string,
  ): Promise<SentNotificationSummary> {
    const author = await this.userRepository.findOne({
      where: { user_id: createdById },
    });

    if (!author) {
      throw new NotFoundException('User not found');
    }

    const recipients = await this.resolveAudience(dto);
    const batchId = randomUUID();
    const attachment = this.resolveAttachment(dto);

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Notification);

      await repo.save(
        recipients.map((recipient) =>
          repo.create({
            title: dto.title.trim(),
            message: dto.message.trim(),
            category: dto.category ?? NotificationCategory.GENERAL,
            batch_id: batchId,
            audience_type: dto.audience_type,
            audience_department_id:
              dto.audience_type === NotificationAudienceType.DEPARTMENT
                ? dto.audience_department_id
                : null,
            // Spread onto every row, not just the first: each recipient reads
            // their own row and would otherwise see the announcement without
            // the document it is about.
            ...attachment,
            recipient,
            createdBy: author,
          }),
        ),
      );
    });

    const summary = await this.findBatch(batchId);

    if (!summary) {
      throw new NotFoundException('Notification could not be read back.');
    }

    return summary;
  }

  /**
   * Turn the author's audience choice into concrete users.
   *
   * Ported from `MeetingsService.resolveAudience` with one difference: the
   * sender is not *added* to the list. A meeting organizer attends their own
   * meeting, so that method appends them unconditionally; an author does not
   * need their own announcement in their bell, and appending them would fire
   * the unread badge on every send.
   *
   * The sender is not *excluded* either — the audience is taken literally. If
   * they send to Everyone, or to a department they belong to, they receive it
   * like anybody else in that group, because they are in fact in it. Only the
   * unconditional append is gone.
   *
   * Inactive employees are excluded everywhere. An audience that resolves to
   * nobody is rejected rather than silently saved as a notification that
   * reached no one.
   */
  private async resolveAudience(dto: CreateNotificationDto): Promise<User[]> {
    switch (dto.audience_type) {
      case NotificationAudienceType.SPECIFIC: {
        const ids = dto.recipient_ids ?? [];
        if (ids.length === 0) {
          throw new BadRequestException(
            'Select at least one employee, or choose a department or everyone.',
          );
        }
        const users = await this.userRepository.find({
          where: { user_id: In(ids), status: true },
        });
        if (users.length === 0) {
          throw new BadRequestException(
            'None of the selected employees are active.',
          );
        }
        return users;
      }

      case NotificationAudienceType.DEPARTMENT: {
        if (!dto.audience_department_id) {
          throw new BadRequestException(
            'Choose a department for a department-wide notification.',
          );
        }
        const users = await this.userRepository
          .createQueryBuilder('user')
          .leftJoin('user.department', 'department')
          .where('department.department_id = :departmentId', {
            departmentId: dto.audience_department_id,
          })
          .andWhere('user.status = :active', { active: true })
          .getMany();
        if (users.length === 0) {
          throw new BadRequestException(
            'That department has no active employees to notify.',
          );
        }
        return users;
      }

      case NotificationAudienceType.ALL: {
        const users = await this.userRepository.find({
          where: { status: true },
        });
        if (users.length === 0) {
          throw new BadRequestException('There are no active employees to notify.');
        }
        return users;
      }

      default:
        throw new BadRequestException('Choose who should receive this notification.');
    }
  }

  /**
   * Validates and stores a composed notification's attachment.
   *
   * The original filename is returned so the send can record it — the stored
   * name is a UUID, so without it the recipient's download would be called
   * `9f3c1e08-….pdf`. It is never used to build the path.
   */
  async saveAttachment(file?: UploadedFile): Promise<AttachmentMetadata> {
    const validated = validateUpload(file, ATTACHMENT_UPLOAD);
    const url = await saveUpload(validated, ATTACHMENT_UPLOAD);

    return {
      url,
      // Trimmed to the column width rather than rejected: an over-long name is
      // a cosmetic problem with the download prompt, not a reason to throw
      // away a file that has already passed every real check.
      name: validated.originalname.slice(0, 255),
      mime: validated.mimetype,
      size: validated.size,
    };
  }

  /**
   * The attachment columns for a send, or nulls when there is none.
   *
   * `attachment_url` is checked against the upload prefix rather than taken as
   * given. The field is echoed back by the client from `saveAttachment`, so a
   * caller could otherwise put any URL there and have every recipient shown a
   * download link to a site of their choosing, under this company's name.
   */
  private resolveAttachment(dto: CreateNotificationDto) {
    const empty = {
      attachment_url: null,
      attachment_name: null,
      attachment_mime: null,
      attachment_size: null,
    };

    if (!dto.attachment_url) return empty;

    if (!dto.attachment_url.startsWith(`${ATTACHMENT_UPLOAD.urlPrefix}/`)) {
      throw new BadRequestException(
        'Attach the file through the upload endpoint — a link to somewhere else cannot be sent as an attachment.',
      );
    }

    return {
      attachment_url: dto.attachment_url,
      attachment_name: dto.attachment_name?.trim() || 'attachment',
      attachment_mime: dto.attachment_mime ?? null,
      attachment_size: dto.attachment_size ?? null,
    };
  }

  /**
   * System-generated in-app notification with a recipient. Used for leave
   * events, balance changes, and appraisal decisions so the user's bell
   * reflects activity they care about rather than being purely broadcast.
   */
  async push(input: PushNotificationInput, manager?: EntityManager) {
    const repo = manager
      ? manager.getRepository(Notification)
      : this.notificationRepository;

    const userRepo = manager
      ? manager.getRepository(User)
      : this.userRepository;

    const recipient = await userRepo.findOne({
      where: { user_id: input.recipientId },
    });

    if (!recipient) {
      throw new NotFoundException(
        `Cannot send notification to ${input.recipientId} — user not found.`,
      );
    }

    const notification = repo.create({
      title: input.title,
      message: input.message,
      category: input.category,
      link: input.link ?? null,
      reference_id: input.referenceId ?? null,
      reference_type: input.referenceType ?? null,
      recipient,
      createdBy: null,
    });

    return repo.save(notification);
  }

  /**
   * Send the same notification to multiple users at once. Returns the count
   * saved, not the full rows (which would load every eager recipient).
   */
  async pushMany(
    recipients: string[],
    input: Omit<PushNotificationInput, 'recipientId'>,
    manager?: EntityManager,
  ): Promise<number> {
    if (recipients.length === 0) return 0;

    const repo = manager
      ? manager.getRepository(Notification)
      : this.notificationRepository;

    const userRepo = manager
      ? manager.getRepository(User)
      : this.userRepository;

    const users = await userRepo.find({
      where: recipients.map((id) => ({ user_id: id })),
      select: { user_id: true },
    });

    if (users.length === 0) return 0;

    const rows = users.map((u) =>
      repo.create({
        title: input.title,
        message: input.message,
        category: input.category,
        link: input.link ?? null,
        reference_id: input.referenceId ?? null,
        reference_type: input.referenceType ?? null,
        recipient: u,
        createdBy: null,
      }),
    );

    await repo.save(rows);
    return rows.length;
  }

  /**
   * The Sent view: one entry per composed notification, not per delivered row.
   *
   * Fan-out means a notification to forty people is forty rows; listing them
   * raw would show the same announcement forty times. Grouping by `batch_id`
   * collapses them and yields the two numbers the sender actually wants — how
   * many received it and how many have read it.
   *
   * `COALESCE(batch_id, notification_id)` puts legacy rows (written before
   * batching, so `batch_id IS NULL`) in a group of their own rather than
   * lumping every one of them into a single null bucket.
   */
  async findAll(): Promise<SentNotificationSummary[]> {
    return this.sentQuery().getRawMany<SentNotificationSummary>().then(rows =>
      rows.map((row) => this.normalizeSummary(row)),
    );
  }

  /** One batch, read back after a send. */
  private async findBatch(
    batchId: string,
  ): Promise<SentNotificationSummary | null> {
    const row = await this.sentQuery()
      .andWhere('n.batch_id = :batchId', { batchId })
      .getRawOne<SentNotificationSummary>();

    return row ? this.normalizeSummary(row) : null;
  }

  /**
   * Shared shape for the Sent view. `MIN(...)` on the non-grouped columns is
   * safe because every row in a batch carries identical values for them — they
   * were written from one DTO in one transaction.
   *
   * The uuid columns are cast to text *inside* the aggregate: Postgres has no
   * `min(uuid)`, so aggregating first and casting after fails to resolve.
   */
  private sentQuery() {
    return this.notificationRepository
      .createQueryBuilder('n')
      .leftJoin('n.createdBy', 'author')
      .leftJoin('n.audienceDepartment', 'department')
      .select('MIN(n.notification_id::text)', 'notification_id')
      .addSelect('n.batch_id', 'batch_id')
      .addSelect('MIN(n.title)', 'title')
      .addSelect('MIN(n.message)', 'message')
      .addSelect('MIN(n.category)', 'category')
      .addSelect('MIN(n.audience_type)', 'audience_type')
      .addSelect('MIN(n.audience_department_id::text)', 'audience_department_id')
      .addSelect('MIN(department.department_name)', 'audience_department_name')
      .addSelect('MIN(n.attachment_url)', 'attachment_url')
      .addSelect('MIN(n.attachment_name)', 'attachment_name')
      .addSelect('MIN(n.attachment_mime)', 'attachment_mime')
      .addSelect('MIN(n.attachment_size)', 'attachment_size')
      .addSelect('COUNT(*)', 'recipient_count')
      .addSelect('COUNT(n.read_at)', 'read_count')
      .addSelect('MIN(n.created_at)', 'created_at')
      .addSelect('MIN(author.user_id::text)', 'created_by_id')
      .addSelect(
        "MIN(TRIM(CONCAT(author.first_name, ' ', author.last_name)))",
        'created_by_name',
      )
      .groupBy('COALESCE(n.batch_id::text, n.notification_id::text)')
      .addGroupBy('n.batch_id')
      .orderBy('MIN(n.created_at)', 'DESC');
  }

  /** pg returns COUNT as a string; the API contract says number. */
  private normalizeSummary(
    row: SentNotificationSummary,
  ): SentNotificationSummary {
    return {
      ...row,
      recipient_count: Number(row.recipient_count),
      read_count: Number(row.read_count),
      // Null stays null — a notification with no attachment must not report a
      // size of 0, which reads as an empty file rather than no file.
      attachment_size:
        row.attachment_size === null ? null : Number(row.attachment_size),
      created_at: new Date(row.created_at),
    };
  }

  /**
   * A user's bell: notices addressed to them, plus legacy company-wide rows
   * (`recipient_id IS NULL`), newest first.
   */
  async findForUser(
    userId: string,
    options: { unreadOnly?: boolean; limit?: number } = {},
  ) {
    const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);

    const qb = this.notificationRepository
      .createQueryBuilder('n')
      .where('(n.recipient_id = :userId OR n.recipient_id IS NULL)', { userId })
      .orderBy('n.created_at', 'DESC')
      .take(limit);

    if (options.unreadOnly) {
      qb.andWhere('n.read_at IS NULL');
    }

    const [data, unread] = await Promise.all([
      qb.getMany(),
      // Addressed rows only. A legacy null-recipient row has one `read_at`
      // shared by everyone, so marking it read is a documented no-op in
      // `markRead` — counting it would leave the badge permanently lit with a
      // number the user has no way to clear.
      this.notificationRepository.count({
        where: { recipient_id: userId, read_at: IsNull() },
      }),
    ]);

    return { data, unread };
  }

  /** Marks one notice read. Only the addressee may do so. */
  async markRead(id: string, userId: string) {
    const notification = await this.notificationRepository.findOne({
      where: { notification_id: id },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.recipient_id && notification.recipient_id !== userId) {
      throw new NotFoundException('Notification not found');
    }

    // A legacy broadcast has a single `read_at` shared by the whole company, so
    // writing it here would mark the notice read for everyone at once. Return
    // it untouched instead: no per-user read state exists to update, and it is
    // excluded from the unread count for the same reason.
    if (!notification.recipient_id) {
      return notification;
    }

    if (!notification.read_at) {
      notification.read_at = new Date();
      await this.notificationRepository.save(notification);
    }

    return notification;
  }

  async markAllRead(userId: string) {
    const result = await this.notificationRepository
      .createQueryBuilder()
      .update(Notification)
      .set({ read_at: () => 'CURRENT_TIMESTAMP' })
      .where('recipient_id = :userId AND read_at IS NULL', { userId })
      .execute();

    return { updated: result.affected ?? 0 };
  }

  async findOne(id: string) {
    const notification = await this.notificationRepository.findOne({
      where: {
        notification_id: id,
      },
      relations: ['createdBy'],
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return notification;
  }

  /**
   * Edit a sent notification across its whole batch.
   *
   * The id names one delivered row, but the sender is editing the notification
   * they composed — correcting a typo for one of forty recipients and leaving
   * the other thirty-nine wrong is never what was meant.
   */
  async update(id: string, dto: UpdateNotificationDto) {
    const notification = await this.findOne(id);

    const changes: Partial<Notification> = {};

    if (dto.title !== undefined) changes.title = dto.title.trim();
    if (dto.message !== undefined) changes.message = dto.message.trim();
    if (dto.category !== undefined) changes.category = dto.category;

    if (Object.keys(changes).length > 0) {
      await this.notificationRepository.update(
        this.batchScope(notification),
        changes,
      );
    }

    return this.findOne(id);
  }

  /** Deletes the whole batch — the notification, not one person's copy. */
  async remove(id: string) {
    const notification = await this.findOne(id);

    const { affected } = await this.notificationRepository.delete(
      this.batchScope(notification),
    );

    // The batch owned its attachment, so nothing else references the file once
    // the rows are gone. Best-effort and after the delete: a file that cannot
    // be removed must not fail a deletion the database has already committed.
    await deleteUpload(notification.attachment_url, ATTACHMENT_UPLOAD);

    return {
      notification_id: id,
      batch_id: notification.batch_id ?? null,
      deleted: affected ?? 0,
    };
  }

  /**
   * Every row of the notification this one belongs to. Legacy rows have no
   * batch, so they scope to themselves.
   */
  private batchScope(notification: Notification) {
    return notification.batch_id
      ? { batch_id: notification.batch_id }
      : { notification_id: notification.notification_id };
  }
}
