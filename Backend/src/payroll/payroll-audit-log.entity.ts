import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
} from 'typeorm';

import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

import { User } from '../users/user.entity';

import { Payroll } from './payroll.entity';

@Entity('payroll_audit_logs')
@Index(['payroll_id', 'created_at'])
@Index(['actor_id', 'created_at'])
export class PayrollAuditLog {
  // ==========================================
  // PRIMARY KEY
  // ==========================================

  @ApiProperty({
    example: 'd6e4f5a7-8b9c-0d1e-2f3a-4b5c6d7e8f9a',
  })
  @PrimaryGeneratedColumn('uuid')
  payroll_audit_log_id!: string;

  // ==========================================
  // PAYROLL
  // ==========================================

  @ApiProperty({
    description: 'Payroll affected by the audited action.',
  })
  @ManyToOne(
    () => Payroll,
    {
      nullable: false,
      onDelete: 'RESTRICT',
    },
  )
  @JoinColumn({
    name: 'payroll_id',
  })
  payroll!: Payroll;

  @ApiProperty({
    example: 'a3f1c2d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
  })
  @Column({
    type: 'uuid',
  })
  payroll_id!: string;

  // ==========================================
  // ACTOR
  // ==========================================

  @ApiProperty({
    description:
      'User who performed the action. Normally HR/Admin or another authorized payroll user.',
  })
  @ManyToOne(() => User, {
    nullable: false,
    eager: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'actor_id',
  })
  actor!: User;

  @ApiProperty({
    example: 'a3f1c2d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
    description: 'UUID of the user who performed the action.',
  })
  @Column({
    type: 'uuid',
  })
  actor_id!: string;

  // ==========================================
  // ACTION
  // ==========================================

  /**
   * These values will later be backed by PayrollAuditAction enum.
   */
  @ApiProperty({
    example: 'ADJUSTMENT_ADDED',
    description: 'Action performed on the payroll.',
    enum: [
      'PAYROLL_CREATED',
      'PAYROLL_PROCESSED',
      'PAYROLL_APPROVED',
      'PAYROLL_LOCKED',
      'PAYROLL_CANCELLED',
      'ADJUSTMENT_ADDED',
      'ADJUSTMENT_UPDATED',
      'ADJUSTMENT_REMOVED',
      'LOAN_INSTALLMENT_SKIPPED',
      'PAYROLL_MODIFIED',
      'PAYROLL_RECALCULATED',
    ],
  })
  @Column({
    type: 'varchar',
    length: 50,
  })
  action!: string;

  // ==========================================
  // FIELD CHANGED
  // ==========================================

  @ApiPropertyOptional({
    example: 'bonus',
    description: 'Name of the payroll field that was changed.',
  })
  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  field_name?: string | null;

  // ==========================================
  // OLD VALUE
  // ==========================================

  @ApiPropertyOptional({
    example: {
      bonus: 5000,
    },
    description:
      'Previous value before the manual change. Stored as JSON.',
  })
  @Column({
    type: 'jsonb',
    nullable: true,
  })
  old_value?: Record<string, any> | null;

  // ==========================================
  // NEW VALUE
  // ==========================================

  @ApiPropertyOptional({
    example: {
      bonus: 10000,
    },
    description:
      'New value after the manual change. Stored as JSON.',
  })
  @Column({
    type: 'jsonb',
    nullable: true,
  })
  new_value?: Record<string, any> | null;

  // ==========================================
  // REASON
  // ==========================================

  @ApiPropertyOptional({
    example: 'Additional performance bonus approved by management.',
    description: 'Reason supplied for the manual action.',
  })
  @Column({
    type: 'text',
    nullable: true,
  })
  reason?: string | null;

  // ==========================================
  // IP ADDRESS
  // ==========================================

  @ApiPropertyOptional({
    example: '192.168.1.10',
    description:
      'IP address from which the audited action was performed.',
  })
  @Column({
    type: 'varchar',
    length: 45,
    nullable: true,
  })
  ip_address?: string | null;

  // ==========================================
  // USER AGENT
  // ==========================================

  @ApiPropertyOptional({
    example:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    description:
      'Browser/client user agent associated with the action.',
  })
  @Column({
    type: 'text',
    nullable: true,
  })
  user_agent?: string | null;

  // ==========================================
  // CREATED AT
  // ==========================================

  @ApiProperty({
    example: '2026-08-25T11:30:00.000Z',
  })
  @CreateDateColumn({
    type: 'timestamp',
  })
  created_at!: Date;
}