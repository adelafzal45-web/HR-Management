import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, DataSource } from 'typeorm';

import { WorkingDaySchedule } from './working-day-schedules.entity';
import { SetWorkingDaysDto } from './dto/set-working-days.dto';
import { WorkingDaysQueryDto } from './dto/working-days-query.dto';

/** ISO-8601 day numbers, matching Postgres EXTRACT(ISODOW FROM date). */
export const ISO_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export interface ResolvedWeek {
  /** Which tier supplied the answer. */
  scope: 'designation' | 'department' | 'global';
  /** day_of_week (1-7) -> is working. Always contains all seven days. */
  days: Record<number, boolean>;
}

@Injectable()
export class WorkingDaySchedulesService {
  constructor(
    @InjectRepository(WorkingDaySchedule)
    private scheduleRepository: Repository<WorkingDaySchedule>,
    private dataSource: DataSource,
  ) {}

  /**
   * Rows configured for exactly one scope — no fallback applied.
   * Used by the Settings UI so an administrator can see whether a scope has its
   * own override or is inheriting.
   */
  findScope(query: WorkingDaysQueryDto): Promise<WorkingDaySchedule[]> {
    this.assertScopeValid(query.department_id, query.designation_id);

    return this.scheduleRepository.find({
      where: {
        department_id: query.department_id ?? IsNull(),
        designation_id: query.designation_id ?? IsNull(),
      },
      order: { day_of_week: 'ASC' },
    });
  }

  /** Every configured row across all scopes. */
  findAll(): Promise<WorkingDaySchedule[]> {
    return this.scheduleRepository.find({
      order: { day_of_week: 'ASC' },
    });
  }

  /**
   * Replaces the whole week for one scope atomically.
   *
   * Delete-then-insert inside a transaction, so a half-written week can never
   * be observed: readers either see the old week or the new one.
   */
  async setWeek(dto: SetWorkingDaysDto): Promise<WorkingDaySchedule[]> {
    this.assertScopeValid(dto.department_id, dto.designation_id);

    const seen = new Set<number>();
    for (const entry of dto.days) {
      if (seen.has(entry.day_of_week)) {
        throw new BadRequestException(
          `Duplicate entry for day_of_week ${entry.day_of_week}.`,
        );
      }
      seen.add(entry.day_of_week);
    }

    const departmentId = dto.department_id ?? null;
    const designationId = dto.designation_id ?? null;

    await this.dataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .delete()
        .from(WorkingDaySchedule)
        .where(
          departmentId === null
            ? 'department_id IS NULL'
            : 'department_id = :departmentId',
          { departmentId },
        )
        .andWhere(
          designationId === null
            ? 'designation_id IS NULL'
            : 'designation_id = :designationId',
          { designationId },
        )
        .execute();

      // Only persist working days. A non-working day is represented by the
      // absence of a row, which is exactly what the resolver expects.
      const rows = dto.days
        .filter((entry) => entry.is_working)
        .map((entry) =>
          manager.create(WorkingDaySchedule, {
            department_id: departmentId,
            designation_id: designationId,
            day_of_week: entry.day_of_week,
            is_working: true,
          }),
        );

      if (rows.length > 0) {
        await manager.save(rows);
      }
    });

    return this.findScope({
      department_id: dto.department_id,
      designation_id: dto.designation_id,
    });
  }

  /**
   * Removes a scope's override so it falls back to the next tier up.
   * Clearing the global default is refused — it is the last line of fallback.
   */
  async clearScope(query: WorkingDaysQueryDto): Promise<{ message: string }> {
    this.assertScopeValid(query.department_id, query.designation_id);

    if (!query.department_id && !query.designation_id) {
      throw new BadRequestException(
        'The global default cannot be cleared. Update it instead.',
      );
    }

    await this.scheduleRepository.delete({
      department_id: query.department_id ?? IsNull(),
      designation_id: query.designation_id ?? IsNull(),
    });

    return { message: 'Working day override cleared.' };
  }

  /**
   * Request-facing wrapper around {@link resolveWeek}.
   *
   * `resolveWeek` itself must stay permissive: attendance calls it with whatever
   * a user record happens to carry, and an employee with a designation but no
   * department is a data state to degrade through, not to reject. A client
   * *asking* for that combination is a different matter — it is a malformed
   * query, so it gets the same 400 as every other scope-bearing route.
   */
  resolveWeekForQuery(query: WorkingDaysQueryDto): Promise<ResolvedWeek> {
    this.assertScopeValid(query.department_id, query.designation_id);
    return this.resolveWeek(query.department_id, query.designation_id);
  }

  /**
   * Resolves the effective week for a department/designation pair, applying
   * the specificity ladder: designation -> department -> global.
   *
   * Days absent from the winning tier come back false, which is the
   * "not marked working means weekend/holiday" rule.
   */
  async resolveWeek(
    departmentId?: string | null,
    designationId?: string | null,
  ): Promise<ResolvedWeek> {
    const tiers: Array<{
      scope: ResolvedWeek['scope'];
      department: string | null;
      designation: string | null;
    }> = [];

    if (departmentId && designationId) {
      tiers.push({
        scope: 'designation',
        department: departmentId,
        designation: designationId,
      });
    }
    if (departmentId) {
      tiers.push({
        scope: 'department',
        department: departmentId,
        designation: null,
      });
    }
    tiers.push({ scope: 'global', department: null, designation: null });

    for (const tier of tiers) {
      const rows = await this.scheduleRepository.find({
        where: {
          department_id: tier.department ?? IsNull(),
          designation_id: tier.designation ?? IsNull(),
        },
      });

      if (rows.length === 0) continue;

      const days: Record<number, boolean> = {};
      for (const day of ISO_DAYS) days[day] = false;
      for (const row of rows) days[row.day_of_week] = row.is_working;

      return { scope: tier.scope, days };
    }

    // Nothing configured anywhere — every day is non-working rather than
    // silently assuming Mon-Fri, so a misconfiguration is visible instead of
    // quietly producing plausible-looking attendance.
    const days: Record<number, boolean> = {};
    for (const day of ISO_DAYS) days[day] = false;
    return { scope: 'global', days };
  }

  /** True when the given calendar date is a working day for that scope. */
  async isWorkingDay(
    date: Date | string,
    departmentId?: string | null,
    designationId?: string | null,
  ): Promise<boolean> {
    const week = await this.resolveWeek(departmentId, designationId);
    return week.days[isoDayOfWeek(date)] === true;
  }

  private assertScopeValid(
    departmentId?: string | null,
    designationId?: string | null,
  ): void {
    if (designationId && !departmentId) {
      throw new BadRequestException(
        'designation_id requires department_id to also be provided.',
      );
    }
  }
}

/** ISO-8601 day number (1 = Monday ... 7 = Sunday) for a date. */
export function isoDayOfWeek(date: Date | string): number {
  const d = typeof date === 'string' ? new Date(`${date}T00:00:00Z`) : date;
  const jsDay = typeof date === 'string' ? d.getUTCDay() : d.getDay();
  return jsDay === 0 ? 7 : jsDay;
}
