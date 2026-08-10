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

import { Payroll } from './payroll.entity';

@Entity('payroll_items')
@Index(['payroll', 'item_type'])
export class PayrollItem {
  // ==========================================
  // PRIMARY KEY
  // ==========================================

  @ApiProperty({
    example: 'b4f2c3d5-6e7f-8a9b-0c1d-2e3f4a5b6c7d',
  })
  @PrimaryGeneratedColumn('uuid')
  payroll_item_id!: string;

  // ==========================================
  // PAYROLL
  // ==========================================

  @ApiProperty({
    description: 'Payroll record this item belongs to.',
  })
  @ManyToOne(
    () => Payroll,
    (payroll) => payroll.items,
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
    description: 'Payroll UUID.',
  })
  @Column({
    type: 'uuid',
  })
  payroll_id!: string;

  // ==========================================
  // ITEM TYPE
  // ==========================================

  /**
   * These values will later be represented by a dedicated enum.
   *
   * Example values:
   *
   * BASIC_SALARY
   * COMPUTE_ALLOWANCE
   * MEDICAL_ALLOWANCE
   * WEEKEND_WORK
   * PUBLIC_HOLIDAY_WORK
   * COMMISSION
   * BONUS
   * REIMBURSEMENT
   * UNPAID_LEAVE
   * UNAUTHORIZED_ABSENCE
   * HALF_DAY
   * PROVIDENT_FUND
   * LOAN
   * TAX
   * OTHER
   */
  @ApiProperty({
    example: 'BASIC_SALARY',
    description: 'Type of payroll item.',
    enum: [
      'BASIC_SALARY',
      'COMPUTE_ALLOWANCE',
      'MEDICAL_ALLOWANCE',
      'WEEKEND_WORK',
      'PUBLIC_HOLIDAY_WORK',
      'COMMISSION',
      'BONUS',
      'REIMBURSEMENT',
      'UNPAID_LEAVE',
      'UNAUTHORIZED_ABSENCE',
      'HALF_DAY',
      'PROVIDENT_FUND',
      'LOAN',
      'TAX',
      'OTHER',
    ],
  })
  @Column({
    type: 'varchar',
    length: 40,
  })
  item_type!: string;

  // ==========================================
  // DESCRIPTION
  // ==========================================

  @ApiProperty({
    example: 'Basic salary for August 2026',
  })
  @Column({
    type: 'varchar',
    length: 255,
  })
  description!: string;

  // ==========================================
  // AMOUNT
  // ==========================================

  @ApiProperty({
    example: 75000,
    description: 'Absolute monetary value of the payroll item.',
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
  // EARNING / DEDUCTION
  // ==========================================

  @ApiProperty({
    example: 'EARNING',
    description:
      'Whether the item increases salary or represents a deduction.',
    enum: ['EARNING', 'DEDUCTION'],
  })
  @Column({
    type: 'varchar',
    length: 20,
  })
  category!: string;

  // ==========================================
  // TAXABILITY
  // ==========================================

  @ApiProperty({
    example: false,
    description:
      'Whether this payroll item is included in taxable income.',
  })
  @Column({
    type: 'boolean',
    default: true,
  })
  is_taxable!: boolean;

  // ==========================================
  // QUANTITY
  // ==========================================

  @ApiPropertyOptional({
    example: 2,
    description:
      'Number of days/units represented by this item, when applicable.',
  })
  @Column({
    type: 'numeric',
    precision: 8,
    scale: 2,
    nullable: true,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  quantity?: number | null;

  // ==========================================
  // RATE
  // ==========================================

  @ApiPropertyOptional({
    example: 2500,
    description:
      'Rate used to calculate this item, such as daily basic salary.',
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  rate?: number | null;

  // ==========================================
  // SOURCE
  // ==========================================

  @ApiPropertyOptional({
    example: 'ATTENDANCE',
    description:
      'Source module responsible for this payroll item.',
    enum: [
      'SALARY',
      'ATTENDANCE',
      'LEAVE',
      'PUBLIC_HOLIDAY',
      'LOAN',
      'REIMBURSEMENT',
      'HR',
      'TAX',
      'SYSTEM',
    ],
  })
  @Column({
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  source?: string | null;

  // ==========================================
  // SOURCE REFERENCE
  // ==========================================

  @ApiPropertyOptional({
    example: 'attendance-uuid',
    description:
      'Optional ID of the source record that generated this payroll item.',
  })
  @Column({
    type: 'uuid',
    nullable: true,
  })
  source_id?: string | null;

  // ==========================================
  // NOTES
  // ==========================================

  @ApiPropertyOptional({
    example: 'One unpaid leave day.',
  })
  @Column({
    type: 'text',
    nullable: true,
  })
  notes?: string | null;

  // ==========================================
  // TIMESTAMP
  // ==========================================

  @ApiProperty({
    example: '2026-08-25T10:00:00.000Z',
  })
  @CreateDateColumn({
    type: 'timestamp',
  })
  created_at!: Date;
}