import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

import { User } from '../users/user.entity';
import { ReimbursementStatus } from './enums/reimbursement-status.enum';

@Entity('reimbursements')
@Index(['user_id', 'status'])
export class Reimbursement {
  // ==========================================
  // PRIMARY KEY
  // ==========================================

  @ApiProperty({
    example: 'f6a7b8c9-0d1e-2f3a-4b5c-6d7e8f9a0b1c',
  })
  @PrimaryGeneratedColumn('uuid')
  reimbursement_id!: string;

  // ==========================================
  // EMPLOYEE
  // ==========================================

  @ApiProperty({
    description:
      'Employee requesting reimbursement.',
  })
  @ManyToOne(() => User, {
    nullable: false,
    eager: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'user_id',
  })
  user!: User;

  @ApiProperty({
    example:
      'a3f1c2d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
  })
  @Column({
    type: 'uuid',
  })
  user_id!: string;

  // ==========================================
  // AMOUNT
  // ==========================================

  @ApiProperty({
    example: 5000,
    description:
      'Amount requested by employee.',
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  amount!: number;

  // ==========================================
  // TYPE
  // ==========================================

  @ApiProperty({
    example: 'TRAVEL',
    description:
      'Reimbursement category.',
  })
  @Column({
    type: 'varchar',
    length: 50,
  })
  reimbursement_type!: string;

  // ==========================================
  // DESCRIPTION
  // ==========================================

  @ApiProperty({
    example:
      'Travel expenses for client meeting.',
  })
  @Column({
    type: 'text',
  })
  description!: string;

  // ==========================================
  // EXPENSE DATE
  // ==========================================

  @ApiProperty({
    example: '2026-08-20',
  })
  @Column({
    type: 'date',
  })
  expense_date!: Date;

  // ==========================================
  // ATTACHMENT
  // ==========================================

  @ApiPropertyOptional({
    example:
      'uploads/reimbursements/receipt-123.pdf',
  })
  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  attachment_path?: string | null;

  @ApiPropertyOptional({
    example: 'receipt.pdf',
  })
  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  attachment_name?: string | null;

  // ==========================================
  // STATUS
  // ==========================================

  @ApiProperty({
    enum: ReimbursementStatus,
    example:
      ReimbursementStatus.PENDING,
  })
  @Column({
    type: 'enum',
    enum: ReimbursementStatus,
    default: ReimbursementStatus.PENDING,
  })
  status!: ReimbursementStatus;

  // ==========================================
  // APPROVAL
  // ==========================================

  @ApiPropertyOptional({
    example:
      'Approved as business travel expense.',
  })
  @Column({
    type: 'text',
    nullable: true,
  })
  approval_reason?: string | null;

  @ApiPropertyOptional({
    example:
      'Receipt does not match the submitted amount.',
  })
  @Column({
    type: 'text',
    nullable: true,
  })
  rejection_reason?: string | null;

  @ApiPropertyOptional({
    description:
      'User who approved the reimbursement.',
  })
  @ManyToOne(() => User, {
    nullable: true,
    eager: false,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'approved_by',
  })
  approved_by?: User | null;

  @ApiPropertyOptional({
    example:
      'd4e5f6a7-8b9c-0d1e-2f3a-4b5c6d7e8f9a',
  })
  @Column({
    type: 'uuid',
    nullable: true,
  })
  approved_by_id?: string | null;

  @ApiPropertyOptional({
    example:
      '2026-08-25T10:00:00.000Z',
  })
  @Column({
    type: 'timestamp',
    nullable: true,
  })
  approved_at?: Date | null;

  // ==========================================
  // PAYROLL
  // ==========================================

  /**
   * Once an approved reimbursement is included
   * in payroll, this stores the payroll UUID.
   */

  @ApiPropertyOptional({
    example:
      'a3f1c2d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
    description:
      'Payroll UUID where this reimbursement was paid.',
  })
  @Column({
    type: 'uuid',
    nullable: true,
  })
  payroll_id?: string | null;

  // ==========================================
  // TIMESTAMPS
  // ==========================================

  @ApiProperty({
    example:
      '2026-08-20T10:00:00.000Z',
  })
  @CreateDateColumn({
    type: 'timestamp',
  })
  created_at!: Date;

  @ApiProperty({
    example:
      '2026-08-25T10:00:00.000Z',
  })
  @UpdateDateColumn({
    type: 'timestamp',
  })
  updated_at!: Date;
}