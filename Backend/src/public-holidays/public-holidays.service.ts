import { Injectable, NotFoundException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository, DataSource } from 'typeorm';

import { PublicHoliday } from './public-holidays.entity';

import { CreatePublicHolidayDto } from './dto/create-public-holidays.dto';
import { UpdatePublicHolidayDto } from './dto/update-public-holidays.dto';

import { User } from '../users/user.entity';

import { Notification } from '../notifications/notifications.entity';

@Injectable()
export class PublicHolidaysService {
  constructor(
    @InjectRepository(PublicHoliday)
    private readonly publicHolidayRepository: Repository<PublicHoliday>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,

    private readonly dataSource: DataSource,
  ) {}

  /**
   * Create Public Holiday
   *
   * Flow:
   *
   * 1. HR/Admin creates holiday
   * 2. Holiday saved in database
   * 3. All active employees fetched
   * 4. Notification created for every employee
   */
  async create(createPublicHolidayDto: CreatePublicHolidayDto) {
    return this.dataSource.transaction(async (manager) => {
      const holidayRepository = manager.getRepository(PublicHoliday);

      const notificationRepository = manager.getRepository(Notification);

      const userRepository = manager.getRepository(User);

      /**
       * Save Public Holiday
       */
      const holiday = holidayRepository.create(createPublicHolidayDto);

      const savedHoliday = await holidayRepository.save(holiday);

      /**
       * Fetch all active employees
       */
      const employees = await userRepository.find({
        where: {
          status: true,
        },
      });

      /**
       * Create company-wide notifications
       */
      const notifications = employees.map((employee) => {
        return notificationRepository.create({
          user: employee,

          title: 'Public Holiday Announced',

          message: `${savedHoliday.name} is on ${savedHoliday.holiday_date}`,
        });
      });

      /**
       * Save notifications
       */
      if (notifications.length > 0) {
        await notificationRepository.save(notifications);
      }

      return savedHoliday;
    });
  }

  /**
   * Get all holidays
   */
  async findAll(): Promise<PublicHoliday[]> {
    return this.publicHolidayRepository.find({
      order: {
        holiday_date: 'ASC',
      },
    });
  }

  /**
   * Get holiday by ID
   */
  async findOne(id: string): Promise<PublicHoliday> {
    const holiday = await this.publicHolidayRepository.findOne({
      where: {
        holiday_id: id,
      },
    });

    if (!holiday) {
      throw new NotFoundException('Public holiday not found');
    }

    return holiday;
  }

  /**
   * Update holiday
   */
  async update(
    id: string,

    updatePublicHolidayDto: UpdatePublicHolidayDto,
  ): Promise<PublicHoliday> {
    const holiday = await this.findOne(id);

    Object.assign(holiday, updatePublicHolidayDto);

    return this.publicHolidayRepository.save(holiday);
  }

  /**
   * Delete holiday
   */
  async remove(id: string) {
    const holiday = await this.findOne(id);

    await this.publicHolidayRepository.remove(holiday);

    return {
      message: 'Public holiday deleted successfully',
    };
  }
}
