import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Notification } from './notifications.entity';
import { User } from '../users/user.entity';

import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';

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

  async findAll() {
    return await this.notificationRepository.find({
      relations: ['createdBy'],
    });
  }

  async findOne(id: string) {
    const notification =
      await this.notificationRepository.findOne({
        where: {
          notification_id: id,
        },
        relations: ['createdBy'],
      });

    if (!notification) {
      throw new NotFoundException(
        'Notification not found',
      );
    }

    return notification;
  }

  async update(
    id: string,
    dto: UpdateNotificationDto,
  ) {
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

    return await this.notificationRepository.save(
      notification,
    );
  }

  async remove(id: string) {
    const notification = await this.findOne(id);

    return await this.notificationRepository.remove(
      notification,
    );
  }
}