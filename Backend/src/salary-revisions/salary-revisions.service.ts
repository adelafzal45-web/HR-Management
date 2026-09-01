import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { SalaryRevision } from './salary-revisions.entity';
import { CreateSalaryRevisionDto } from './dto/create-salary-revision.dto';
import { User } from '../users/user.entity';
import { SalaryStructureAssignment } from '../salary-structures/salary-structures.entity';
import { AuditService, type AuditActor } from '../audit/audit.service';

/** A revision plus the author's display name — safe to return to the client. */
export interface SalaryRevisionView {
  revision_id: string;
  user_id: string;
  previous_salary: number | null;
  new_salary: number;
  delta: number;
  change_type: string;
  input_mode: string;
  input_value: number;
  reason: string | null;
  effective_date: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: Date;
}

export interface ApplyRevisionResult {
  revision: SalaryRevisionView;
  /**
   * Set when the new `users.salary` will NOT change the employee's computed pay
   * because an active salary-structure assignment supplies `base_salary`, which
   * the engine prefers. Advisory only — the revision is still recorded.
   */
  warning: string | null;
}

/**
 * Base-salary increment/decrement with an audited, append-only history.
 *
 * `apply()` mirrors the transaction + audit shape of UsersService.update(): the
 * `users.salary` write, the `salary_revisions` insert, and the audit row all
 * commit or roll back together. History is read newest-first for the employee
 * drawer. Reuses the existing `employees.salary.view/edit` permissions (guarded
 * at the controller), so no new grants — and no seed migration — are needed.
 */
@Injectable()
export class SalaryRevisionsService {
  constructor(
    @InjectRepository(SalaryRevision)
    private readonly revisionRepository: Repository<SalaryRevision>,
    @InjectRepository(SalaryStructureAssignment)
    private readonly assignmentRepository: Repository<SalaryStructureAssignment>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  /** Salary history for one employee, newest first, with author names. */
  async list(userId: string): Promise<SalaryRevisionView[]> {
    const rows = await this.revisionRepository.find({
      where: { user_id: userId },
      relations: { createdBy: true },
      order: { created_at: 'DESC' },
    });
    return rows.map((row) => this.toView(row));
  }

  /**
   * Apply an increment/decrement to the employee's base salary.
   *
   * `input_value` is a positive magnitude; `change_type` gives the direction, so
   * the client never sends a negative number. A `percent` change is that
   * percentage of the current salary. The result below zero is rejected. The
   * returned `warning` is set when a salary-structure assignment's base_salary
   * would mask the change from actual payroll.
   */
  async apply(
    dto: CreateSalaryRevisionDto,
    actor?: AuditActor,
  ): Promise<ApplyRevisionResult> {
    const today = new Date().toISOString().slice(0, 10);
    const effectiveDate = dto.effective_date ?? today;
    if (effectiveDate > today) {
      throw new BadRequestException(
        'effective_date cannot be in the future — scheduled raises are not supported yet.',
      );
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const userRepo = manager.getRepository(User);
      const user = await userRepo.findOne({ where: { user_id: dto.user_id } });
      if (!user) {
        throw new NotFoundException('Employee not found.');
      }

      const previous = user.salary ?? null;
      const base = previous ?? 0;
      const magnitude =
        dto.input_mode === 'percent'
          ? this.round2((base * dto.input_value) / 100)
          : this.round2(dto.input_value);
      const newSalary = this.round2(
        dto.change_type === 'increment' ? base + magnitude : base - magnitude,
      );
      if (newSalary < 0) {
        throw new BadRequestException(
          'This decrement would drop the salary below zero.',
        );
      }

      user.salary = newSalary;
      await userRepo.save(user);

      const revisionRepo = manager.getRepository(SalaryRevision);
      const row = revisionRepo.create({
        user_id: dto.user_id,
        previous_salary: previous,
        new_salary: newSalary,
        delta: this.round2(newSalary - base),
        change_type: dto.change_type,
        input_mode: dto.input_mode,
        input_value: this.round2(dto.input_value),
        reason: dto.reason ?? null,
        effective_date: effectiveDate,
        created_by: actor?.user_id ?? null,
      });
      const persisted = await revisionRepo.save(row);

      // Same shape as UsersService.update() so the salary trail reads uniformly.
      if (actor) {
        await this.auditService.record({
          actor,
          action: 'employee.salary.revision',
          entityType: 'User',
          entityId: dto.user_id,
          before: { salary: previous },
          after: { salary: newSalary },
          manager,
        });
      }

      return persisted;
    });

    const view = await this.revisionRepository.findOne({
      where: { revision_id: saved.revision_id },
      relations: { createdBy: true },
    });
    return {
      revision: this.toView(view ?? saved),
      warning: await this.assignmentWarning(dto.user_id),
    };
  }

  /**
   * A conservative warning: does an active salary-structure assignment supply
   * `base_salary` for this employee, so the engine ignores `users.salary`?
   *
   * Checks the employee's own scope and the company scope — the two that resolve
   * for anyone. Department/designation/job-category assignments are not walked
   * (that would duplicate the engine's full scope resolution); missing one only
   * means we occasionally omit an advisory note, never that the salary write is
   * wrong.
   */
  private async assignmentWarning(userId: string): Promise<string | null> {
    const today = new Date().toISOString().slice(0, 10);
    const assignments = await this.assignmentRepository.find({
      where: [
        { scope_type: 'employee', scope_id: userId, is_active: true },
        { scope_type: 'company', is_active: true },
      ],
    });
    const masking = assignments.filter(
      (a) =>
        a.base_salary !== null &&
        a.base_salary !== undefined &&
        this.effectiveOn(a, today),
    );
    if (masking.length === 0) {
      return null;
    }
    const specific =
      masking.find((a) => a.scope_type === 'employee') ?? masking[0];
    return (
      `Heads up: this employee's payroll base pay comes from the "${specific.structure?.name ?? 'assigned'}" ` +
      `salary structure, which overrides the employee salary field. The revision is recorded, but payroll ` +
      `will keep using the structure's base salary until that assignment changes.`
    );
  }

  private effectiveOn(
    assignment: SalaryStructureAssignment,
    dateKey: string,
  ): boolean {
    const from = this.toDateKey(assignment.effective_from);
    const to = this.toDateKey(assignment.effective_to);
    if (from && dateKey < from) return false;
    if (to && dateKey > to) return false;
    return true;
  }

  private toDateKey(value?: string | Date | null): string | null {
    if (!value) return null;
    return value instanceof Date ? value.toISOString().slice(0, 10) : value;
  }

  private toView(row: SalaryRevision): SalaryRevisionView {
    const author = row.createdBy;
    return {
      revision_id: row.revision_id,
      user_id: row.user_id,
      previous_salary: row.previous_salary ?? null,
      new_salary: row.new_salary,
      delta: row.delta,
      change_type: row.change_type,
      input_mode: row.input_mode,
      input_value: row.input_value,
      reason: row.reason ?? null,
      effective_date: row.effective_date,
      created_by: row.created_by ?? null,
      created_by_name: author
        ? `${author.first_name} ${author.last_name}`.trim()
        : null,
      created_at: row.created_at,
    };
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
