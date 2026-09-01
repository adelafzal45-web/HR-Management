import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../users/user.entity';
import {
  Anniversary,
  Celebrant,
  TodaysCelebrations,
} from './celebrations.types';

/**
 * Reads today's celebrants from the `users` table. Shared by the dashboard
 * widget (`GET /celebrations/today`) and the daily announcer, so the card and
 * the Slack/bell message can never disagree about who is celebrating.
 *
 * Matching is by month-and-day only via `EXTRACT`, never by the full date: a
 * birthday recurs every year, and the joining anniversary likewise. The birth
 * year is used solely in the WHERE clause and is never returned — the response
 * would otherwise leak every employee's age.
 */
@Injectable()
export class CelebrationsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async getTodaysCelebrations(
    reference: Date = new Date(),
  ): Promise<TodaysCelebrations> {
    const month = reference.getMonth() + 1;
    const day = reference.getDate();
    const year = reference.getFullYear();

    const [birthdayRows, anniversaryRows] = await Promise.all([
      this.userRepository
        .createQueryBuilder('user')
        .leftJoinAndSelect('user.designation', 'designation')
        .where('user.status = true')
        .andWhere('user.date_of_birth IS NOT NULL')
        .andWhere('EXTRACT(MONTH FROM user.date_of_birth) = :month', { month })
        .andWhere('EXTRACT(DAY FROM user.date_of_birth) = :day', { day })
        .getMany(),
      this.userRepository
        .createQueryBuilder('user')
        .leftJoinAndSelect('user.designation', 'designation')
        .where('user.status = true')
        .andWhere('EXTRACT(MONTH FROM user.joining_date) = :month', { month })
        .andWhere('EXTRACT(DAY FROM user.joining_date) = :day', { day })
        .getMany(),
    ]);

    const birthdays: Celebrant[] = birthdayRows.map((u) => this.toCelebrant(u));

    const anniversaries: Anniversary[] = anniversaryRows
      .map((u) => {
        // `joining_date` is a `date` column, so pg hands it back as a
        // 'YYYY-MM-DD' string; slicing the year off is exact and sidesteps the
        // UTC-parse shift a `new Date(...)` would introduce.
        const joinYear = Number(String(u.joining_date).slice(0, 4));
        return { ...this.toCelebrant(u), years: year - joinYear };
      })
      // Someone who joined today has 0 years — that is their start date, not an
      // anniversary.
      .filter((a) => Number.isFinite(a.years) && a.years >= 1);

    return { as_of: this.dateKey(reference), birthdays, anniversaries };
  }

  /** Every active employee's id — the "everyone" audience for the daily bell. */
  async getActiveUserIds(): Promise<string[]> {
    const rows = await this.userRepository.find({
      where: { status: true },
      select: { user_id: true },
    });
    return rows.map((r) => r.user_id);
  }

  private toCelebrant(user: User): Celebrant {
    return {
      user_id: user.user_id,
      name: [user.first_name, user.last_name].filter(Boolean).join(' ').trim(),
      designation: user.designation?.title ?? null,
      avatar_url: user.profile_image_thumb ?? user.profile_image ?? null,
    };
  }

  /** Local calendar date as 'YYYY-MM-DD', avoiding toISOString's UTC shift. */
  private dateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
