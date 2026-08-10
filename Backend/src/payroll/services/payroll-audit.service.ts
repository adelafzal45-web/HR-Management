import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PayrollAuditLog } from '../payroll-audit-log.entity';

export interface CreatePayrollAuditInput {
  payroll_id: string;
  actor_id: string;
  action: string;

  field_name?: string | null;

  old_value?: Record<string, any> | null;

  new_value?: Record<string, any> | null;

  reason?: string | null;

  ip_address?: string | null;

  user_agent?: string | null;
}

@Injectable()
export class PayrollAuditService {
  constructor(
    @InjectRepository(PayrollAuditLog)
    private readonly auditRepository: Repository<PayrollAuditLog>,
  ) {}

  async create(
    input: CreatePayrollAuditInput,
  ): Promise<PayrollAuditLog> {
    const audit =
      this.auditRepository.create({
        payroll_id: input.payroll_id,
        actor_id: input.actor_id,
        action: input.action,

        field_name:
          input.field_name ?? null,

        old_value:
          input.old_value ?? null,

        new_value:
          input.new_value ?? null,

        reason:
          input.reason ?? null,

        ip_address:
          input.ip_address ?? null,

        user_agent:
          input.user_agent ?? null,
      });

    return this.auditRepository.save(audit);
  }

  async findByPayroll(
    payrollId: string,
  ): Promise<PayrollAuditLog[]> {
    return this.auditRepository.find({
      where: {
        payroll_id: payrollId,
      },
      order: {
        created_at: 'DESC',
      },
    });
  }

  async findOne(
    auditId: string,
  ): Promise<PayrollAuditLog> {
    const audit =
      await this.auditRepository.findOne({
        where: {
          payroll_audit_log_id: auditId,
        },
      });

    if (!audit) {
      throw new NotFoundException(
        'Payroll audit log not found.',
      );
    }

    return audit;
  }
}