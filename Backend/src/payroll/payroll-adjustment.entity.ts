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

@Entity('payroll_adjustments')
@Index(['payroll', 'adjustment_type'])
export class PayrollAdjustment {
  // ==========================================
  // PRIMARY KEY
  // ==========================================

  @ApiProperty({
    example: 'c5d3e4f6-7a8b-9c0d-1e2f-3a4b5c6d7e8f',
  })
  @PrimaryGeneratedColumn('uuid')
  payroll_adjustment_id!: string;

  // ==========================================
  // PAYROLL
  // ==========================================

  @ApiProperty({
    description: 'Payroll to which this adjustment belongs.',
  })
  @ManyToOne(
    () => Payroll,
    (payroll) => payroll.adjustments,
    {
      nullable: false,
      onDelete: 'CASCADE',
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
  // ADJUSTMENT TYPE
  // ==========================================

  /**
   * Will be replaced with PayrollAdjustmentType enum.
   *
   * Expected values:
   *
   * COMMISSION
   * BONUS
   * OTHER_EARNING
   * OTHER_DEDUCTION
   */
  @ApiProperty({
    example: 'COMMISSION',
    description: 'Type of manual payroll adjustment.',
    enum: [
      'COMMISSION',
      'BONUS',
      'OTHER_EARNING',
      'OTHER_DEDUCTION',
    ],
  })
  @Column({
    type: 'varchar',
    length: 30,
  })
  adjustment_type!: string;

  // ==========================================
  // AMOUNT
  // ==========================================

  @ApiProperty({
    example: 5000,
    description: 'Adjustment amount.',
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
  // TAXABILITY
  // ==========================================

  @ApiProperty({
    example: true,
    description:
      'Whether this adjustment is included in taxable income.',
  })
  @Column({
    type: 'boolean',
    default: true,
  })
  is_taxable!: boolean;

  // ==========================================
  // REASON
  // ==========================================

  @ApiProperty({
    example: 'Performance commission for August.',
    description: 'Reason for the manual payroll adjustment.',
  })
  @Column({
    type: 'text',
  })
  reason!: string;

  // ==========================================
  // ADDED BY
  // ==========================================

  @ApiProperty({
    description: 'HR/Admin user who created the adjustment.',
  })
  @ManyToOne(() => User, {
    nullable: false,
    eager: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'created_by',
  })
  created_by!: User;

  @ApiProperty({
    example: 'a3f1c2d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
    description: 'UUID of the HR/Admin user who created the adjustment.',
  })
  @Column({
    type: 'uuid',
  })
  created_by_id!: string;

  // ==========================================
  // CREATED AT
  // ==========================================

  @ApiProperty({
    example: '2026-08-25T10:30:00.000Z',
  })
  @CreateDateColumn({
    type: 'timestamp',
  })
  created_at!: Date;
}