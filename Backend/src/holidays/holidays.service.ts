import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, IsNull, Repository } from 'typeorm';

import { Holiday, HolidayEventType } from './holiday.entity';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { UpdateHolidayDto } from './dto/update-holiday.dto';
import { HolidayQueryDto } from './dto/holiday-query.dto';
import {
  NotificationsService,
} from '../notifications/notifications.service';
import {
  NotificationAudienceType,
  NotificationCategory,
} from '../notifications/notifications.entity';

@Injectable()
export class HolidaysService {
  private readonly logger = new Logger(HolidaysService.name);

  constructor(
    @InjectRepository(Holiday)
    private readonly holidayRepository: Repository<Holiday>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(dto: CreateHolidayDto, createdById?: string): Promise<Holiday> {
    const holidayDate = new Date(dto.holiday_date);
    const eventType = dto.event_type ?? HolidayEventType.HOLIDAY;

    if (
      await this.hasDuplicate(
        holidayDate,
        dto.department_id ?? null,
        dto.is_recurring ?? false,
        eventType,
      )
    ) {
      throw new ConflictException(
        eventType === HolidayEventType.EVENT
          ? 'An event already exists for this date and department scope'
          : 'A holiday already exists for this date and department scope',
      );
    }

    const holiday = this.holidayRepository.create({
      name: dto.name,
      event_type: eventType,
      holiday_date: holidayDate,
      description: dto.description,
      department_id: dto.department_id ?? null,
      is_recurring: dto.is_recurring ?? false,
      notify: dto.notify ?? false,
    });

    const saved = await this.holidayRepository.save(holiday);

    if (saved.notify) {
      await this.announce(saved, createdById);
    }

    return saved;
  }

  /**
   * Best-effort in-app announcement to every active employee. Failures (no
   * active employees, no resolvable author) are logged and swallowed rather
   * than rolled back into the create/update call — the calendar entry itself
   * already saved successfully and must not disappear because the broadcast
   * could not be sent.
   */
  private async announce(holiday: Holiday, createdById?: string): Promise<void> {
    if (!createdById) {
      this.logger.warn(
        `Skipped announcement for holiday ${holiday.holiday_id}: no author on the request.`,
      );
      return;
    }

    const dateLabel = new Date(holiday.holiday_date).toLocaleDateString(
      'en-US',
      { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
    );
    const isEvent = holiday.event_type === HolidayEventType.EVENT;

    try {
      await this.notificationsService.create(
        {
          title: `${isEvent ? 'New event' : 'Upcoming holiday'}: ${holiday.name}`,
          message:
            `${holiday.name} is scheduled on ${dateLabel}.` +
            (holiday.description ? ` ${holiday.description}` : ''),
          category: NotificationCategory.ANNOUNCEMENT,
          audience_type: NotificationAudienceType.ALL,
        },
        createdById,
      );
      await this.holidayRepository.update(holiday.holiday_id, {
        notified_at: new Date(),
      });
    } catch (err) {
      this.logger.warn(
        `Announcement for holiday ${holiday.holiday_id} failed: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  async findAll(query: HolidayQueryDto): Promise<Holiday[]> {
    const qb = this.holidayRepository
      .createQueryBuilder('holiday')
      .leftJoinAndSelect('holiday.department', 'department')
      .orderBy('holiday.holiday_date', 'ASC');

    if (query.event_type) {
      qb.andWhere('holiday.event_type = :eventType', {
        eventType: query.event_type,
      });
    }

    if (query.year) {
      qb.andWhere(
        `(EXTRACT(YEAR FROM holiday.holiday_date) = :year OR holiday.is_recurring = true)`,
        { year: query.year },
      );
    }

    if (query.department_id) {
      qb.andWhere(
        '(holiday.department_id = :departmentId OR holiday.department_id IS NULL)',
        { departmentId: query.department_id },
      );
    }

    return qb.getMany();
  }

  async findOne(id: string): Promise<Holiday> {
    const holiday = await this.holidayRepository.findOne({
      where: { holiday_id: id },
      relations: { department: true },
    });

    if (!holiday) {
      throw new NotFoundException('Holiday not found');
    }

    return holiday;
  }

  async update(
    id: string,
    dto: UpdateHolidayDto,
    updatedById?: string,
  ): Promise<Holiday> {
    const holiday = await this.findOne(id);

    const nextDate = dto.holiday_date
      ? new Date(dto.holiday_date)
      : new Date(holiday.holiday_date);
    const nextDepartmentId =
      dto.department_id !== undefined
        ? dto.department_id
        : holiday.department_id ?? null;
    const nextIsRecurring = dto.is_recurring ?? holiday.is_recurring;
    const nextEventType = dto.event_type ?? holiday.event_type;

    if (
      await this.hasDuplicate(
        nextDate,
        nextDepartmentId ?? null,
        nextIsRecurring,
        nextEventType,
        holiday.holiday_id,
      )
    ) {
      throw new ConflictException(
        nextEventType === HolidayEventType.EVENT
          ? 'An event already exists for this date and department scope'
          : 'A holiday already exists for this date and department scope',
      );
    }

    // A fresh notify request re-announces even if the row was already
    // announced once — HR asking again after editing the date/description is
    // a deliberate re-send, not a no-op.
    const shouldAnnounce = dto.notify === true;

    Object.assign(holiday, {
      name: dto.name ?? holiday.name,
      event_type: nextEventType,
      holiday_date: nextDate,
      description: dto.description ?? holiday.description,
      department_id: nextDepartmentId,
      is_recurring: nextIsRecurring,
      notify: dto.notify ?? holiday.notify,
    });

    const saved = await this.holidayRepository.save(holiday);

    if (shouldAnnounce) {
      await this.announce(saved, updatedById);
    }

    return saved;
  }

  async remove(id: string): Promise<{ message: string }> {
    const holiday = await this.findOne(id);
    await this.holidayRepository.delete(holiday.holiday_id);
    return { message: 'Holiday deleted successfully' };
  }

  /**
   * Set of ISO date strings (`YYYY-MM-DD`) that are holidays for the given
   * department (company-wide + department-specific), across the date range.
   * Recurring holidays are expanded to every year the range touches.
   *
   * Used by `LeaveCalculationService` and `AttendanceService` so both count
   * days off the same source of truth.
   */
  async getHolidayDateSet(
    startDate: Date | string,
    endDate: Date | string,
    departmentId?: string | null,
  ): Promise<Set<string>> {
    const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
    const end = typeof endDate === 'string' ? new Date(endDate) : endDate;

    const qb = this.holidayRepository
      .createQueryBuilder('holiday')
      .where('holiday.event_type = :type', { type: HolidayEventType.HOLIDAY })
      .andWhere(
        new Brackets((sub) => {
          sub.where('holiday.department_id IS NULL');
          if (departmentId) {
            sub.orWhere('holiday.department_id = :departmentId', {
              departmentId,
            });
          }
        }),
      );

    const holidays = await qb.getMany();

    const dates = new Set<string>();
    const startYear = start.getUTCFullYear();
    const endYear = end.getUTCFullYear();

    for (const holiday of holidays) {
      const hDate = new Date(holiday.holiday_date);

      if (holiday.is_recurring) {
        const month = hDate.getUTCMonth();
        const day = hDate.getUTCDate();
        for (let year = startYear; year <= endYear; year += 1) {
          const occurrence = new Date(Date.UTC(year, month, day));
          if (occurrence >= this.stripTime(start) && occurrence <= this.stripTime(end)) {
            dates.add(this.toIso(occurrence));
          }
        }
      } else if (hDate >= this.stripTime(start) && hDate <= this.stripTime(end)) {
        dates.add(this.toIso(hDate));
      }
    }

    return dates;
  }

  /**
   * True when a holiday already occupies this calendar slot for the same
   * department scope. A recurring holiday (on either side) collides on
   * month+day across every year, matching how `getHolidayDateSet` expands
   * them; two fixed holidays collide only on the exact same date. Scope is
   * matched exactly — a company-wide holiday and a department-specific one on
   * the same day are allowed to coexist, since the department entry may carry
   * a locally-relevant name.
   */
  private async hasDuplicate(
    holidayDate: Date,
    departmentId: string | null,
    isRecurring: boolean,
    eventType: HolidayEventType,
    excludeId?: string,
  ): Promise<boolean> {
    const candidates = await this.holidayRepository.find({
      where: {
        department_id: departmentId ?? IsNull(),
        event_type: eventType,
      },
    });

    const month = holidayDate.getUTCMonth();
    const day = holidayDate.getUTCDate();
    const year = holidayDate.getUTCFullYear();

    return candidates.some((existing) => {
      if (excludeId && existing.holiday_id === excludeId) return false;

      const eDate = new Date(existing.holiday_date);
      const sameMonthDay =
        eDate.getUTCMonth() === month && eDate.getUTCDate() === day;

      return isRecurring || existing.is_recurring
        ? sameMonthDay
        : sameMonthDay && eDate.getUTCFullYear() === year;
    });
  }

  private stripTime(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private toIso(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
