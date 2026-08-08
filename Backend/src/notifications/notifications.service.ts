import { Injectable, NotFoundException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';

import { Notification, NotificationCategory } from './notifications.entity';
import { User } from '../users/user.entity';

import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';

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

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(dto: CreateNotificationDto) {
    const user = await this.userRepository.findOne({
      where: {
        user_id: dto.createdBy,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const notification = this.notificationRepository.create({
      title: dto.title,
      message: dto.message,
      createdBy: user,
    });

    return await this.notificationRepository.save(notification);
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

  async findAll() {
    return await this.notificationRepository.find({
      relations: ['createdBy'],
      order: { created_at: 'DESC' },
    });
  }

  /**
   * A user's bell: notices addressed to them, plus company-wide announcements
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
      this.notificationRepository.count({
        where: [
          { recipient_id: userId, read_at: IsNull() },
          { recipient_id: IsNull(), read_at: IsNull() },
        ],
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

    // A broadcast (null recipient) is readable by anyone, so marking it read
    // is a no-op rather than an error — there is no per-user read state for it.
    if (notification.recipient_id && notification.recipient_id !== userId) {
      throw new NotFoundException('Notification not found');
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

  async update(id: string, dto: UpdateNotificationDto) {
    const notification = await this.findOne(id);

    if (dto.createdBy) {
      const user = await this.userRepository.findOne({
        where: {
          user_id: dto.createdBy,
        },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      notification.createdBy = user;
    }

    if (dto.title !== undefined) {
      notification.title = dto.title;
    }

    if (dto.message !== undefined) {
      notification.message = dto.message;
    }

    return await this.notificationRepository.save(notification);
  }

  async remove(id: string) {
    const notification = await this.findOne(id);

    return await this.notificationRepository.remove(notification);
  }
}
