import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { Holiday } from './holiday.entity';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { UpdateHolidayDto } from './dto/update-holiday.dto';
import { HolidayQueryDto } from './dto/holiday-query.dto';

@Injectable()
export class HolidaysService {
  constructor(
    @InjectRepository(Holiday)
    private readonly holidayRepository: Repository<Holiday>,
  ) {}

  create(dto: CreateHolidayDto): Promise<Holiday> {
    const holiday = this.holidayRepository.create({
      name: dto.name,
      holiday_date: new Date(dto.holiday_date),
      description: dto.description,
      department_id: dto.department_id ?? null,
      is_recurring: dto.is_recurring ?? false,
    });

    return this.holidayRepository.save(holiday);
  }

  async findAll(query: HolidayQueryDto): Promise<Holiday[]> {
    const qb = this.holidayRepository
      .createQueryBuilder('holiday')
      .leftJoinAndSelect('holiday.department', 'department')
      .orderBy('holiday.holiday_date', 'ASC');

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

  async update(id: string, dto: UpdateHolidayDto): Promise<Holiday> {
    const holiday = await this.findOne(id);

    Object.assign(holiday, {
      name: dto.name ?? holiday.name,
      holiday_date: dto.holiday_date
        ? new Date(dto.holiday_date)
        : holiday.holiday_date,
      description: dto.description ?? holiday.description,
      department_id:
        dto.department_id !== undefined
          ? dto.department_id
          : holiday.department_id,
      is_recurring: dto.is_recurring ?? holiday.is_recurring,
    });

    return this.holidayRepository.save(holiday);
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
      .where('holiday.department_id IS NULL');

    if (departmentId) {
      qb.orWhere('holiday.department_id = :departmentId', { departmentId });
    }

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

  private stripTime(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private toIso(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
