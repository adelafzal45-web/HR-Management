import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PayrollBonusOverride } from './payroll-bonus-overrides.entity';
import { UpsertPayrollBonusOverrideDto } from './dto/upsert-payroll-bonus-override.dto';
import type { AuditActor } from '../audit/audit.service';

/** A manual bonus override, safe to return to the Run Payroll grid. */
export interface BonusOverrideView {
  bonus_override_id: string;
  user_id: string;
  period_id: string;
  amount: number;
  note: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Manual bonus overrides for a payroll run.
 *
 * One row per (employee, period), upserted from the Run Payroll grid. This
 * service owns only the CRUD; the precedence over the configured bonus rule
 * lives in the engine (PayrollCalculationService), which reads these rows
 * through its own repository for the period it is computing. Reuses the existing
 * `payroll.preview` / `payroll.process` permissions (guarded at the controller),
 * so no new grants — and no seed migration — are needed.
 */
@Injectable()
export class PayrollBonusOverridesService {
  constructor(
    @InjectRepository(PayrollBonusOverride)
    private readonly overrideRepository: Repository<PayrollBonusOverride>,
  ) {}

  /** Every manual bonus override for a period, so the grid can pre-fill saved edits. */
  async list(periodId: string): Promise<BonusOverrideView[]> {
    const rows = await this.overrideRepository.find({
      where: { period_id: periodId },
    });
    return rows.map((row) => this.toView(row));
  }

  /**
   * Create or replace the manual bonus for one (employee, period). Keyed on the
   * unique (user_id, period_id), so saving again updates the same row rather
   * than inserting a duplicate. An amount of 0 is stored (it cancels the bonus);
   * to revert to the configured rule the caller deletes the row via `remove`.
   */
  async upsert(
    dto: UpsertPayrollBonusOverrideDto,
    actor?: AuditActor,
  ): Promise<BonusOverrideView> {
    const existing = await this.overrideRepository.findOne({
      where: { user_id: dto.user_id, period_id: dto.period_id },
    });
    if (existing) {
      existing.amount = dto.amount;
      existing.note = dto.note ?? null;
      const saved = await this.overrideRepository.save(existing);
      return this.toView(saved);
    }
    const row = this.overrideRepository.create({
      user_id: dto.user_id,
      period_id: dto.period_id,
      amount: dto.amount,
      note: dto.note ?? null,
      created_by: actor?.user_id ?? null,
    });
    const saved = await this.overrideRepository.save(row);
    return this.toView(saved);
  }

  /** Delete an override, reverting the employee to the configured bonus rule. */
  async remove(id: string): Promise<{ deleted: true }> {
    const existing = await this.overrideRepository.findOne({
      where: { bonus_override_id: id },
    });
    if (!existing) {
      throw new NotFoundException('Bonus override not found.');
    }
    await this.overrideRepository.delete({ bonus_override_id: id });
    return { deleted: true };
  }

  private toView(row: PayrollBonusOverride): BonusOverrideView {
    return {
      bonus_override_id: row.bonus_override_id,
      user_id: row.user_id,
      period_id: row.period_id,
      amount: row.amount,
      note: row.note ?? null,
      created_by: row.created_by ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
