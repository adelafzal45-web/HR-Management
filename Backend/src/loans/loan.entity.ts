import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  RelationId,
} from 'typeorm';

import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

import { User } from '../users/user.entity';
import { LoanStatus } from './enums/loan-status.enum';
import { LoanInstallment } from './loan-installment.entity';

@Entity('loans')
@Index(['user', 'status'])
export class Loan {
  // ==========================================
  // PRIMARY KEY
  // ==========================================

  @ApiProperty({
    example: 'c5d3e4f6-7a8b-9c0d-1e2f-3a4b5c6d7e8f',
    description: 'Unique loan UUID.',
  })
  @PrimaryGeneratedColumn('uuid')
  loan_id!: string;

  // ==========================================
  // EMPLOYEE
  // ==========================================

  @ApiProperty({
    description: 'Employee who received the loan.',
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

  /**
   * ID of the employee who received the loan.
   *
   * This is a RelationId, not a second database column.
   * The actual database column is created by the user relation above.
   */
  @ApiProperty({
    example: 'a3f1c2d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
    description: 'Employee UUID.',
  })
  @RelationId((loan: Loan) => loan.user)
  user_id!: string;

  // ==========================================
  // LOAN AMOUNT
  // ==========================================

  @ApiProperty({
    example: 120000,
    description: 'Original amount issued to the employee.',
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
  principal_amount!: number;

  // ==========================================
  // INSTALLMENT
  // ==========================================

  @ApiProperty({
    example: 10000,
    description: 'Monthly installment amount.',
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
  installment_amount!: number;

  @ApiProperty({
    example: 12,
    description: 'Total number of installments.',
  })
  @Column({
    type: 'smallint',
  })
  total_installments!: number;

  @ApiProperty({
    example: 3,
    description: 'Number of installments already paid.',
  })
  @Column({
    type: 'smallint',
    default: 0,
  })
  paid_installments!: number;

  // ==========================================
  // BALANCE
  // ==========================================

  @ApiProperty({
    example: 90000,
    description: 'Remaining loan balance.',
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
  remaining_amount!: number;

  // ==========================================
  // DATES
  // ==========================================

  @ApiProperty({
    example: '2026-08-01',
    description: 'Date on which the loan starts.',
  })
  @Column({
    type: 'date',
  })
  start_date!: Date;

  @ApiPropertyOptional({
    example: '2027-07-30',
    description: 'Expected date on which the loan will be fully paid.',
  })
  @Column({
    type: 'date',
    nullable: true,
  })
  end_date?: Date | null;

  // ==========================================
  // STATUS
  // ==========================================

  @ApiProperty({
    enum: LoanStatus,
    example: LoanStatus.ACTIVE,
    description: 'Current status of the loan.',
  })
  @Column({
    type: 'enum',
    enum: LoanStatus,
    default: LoanStatus.ACTIVE,
  })
  status!: LoanStatus;

  // ==========================================
  // REASON
  // ==========================================

  @ApiPropertyOptional({
    example: 'Personal emergency loan.',
    description: 'Reason provided for requesting the loan.',
  })
  @Column({
    type: 'text',
    nullable: true,
  })
  reason?: string | null;

  // ==========================================
  // APPROVED BY
  // ==========================================

  @ApiPropertyOptional({
    description: 'HR/Admin user who approved the loan.',
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

  /**
   * ID of the user who approved the loan.
   *
   * This does not create another database column.
   * The actual FK column is `approved_by`.
   */
  @ApiPropertyOptional({
    example: 'd4e5f6a7-8b9c-0d1e-2f3a-4b5c6d7e8f9a',
    description: 'UUID of the HR/Admin user who approved the loan.',
  })
  @RelationId((loan: Loan) => loan.approved_by)
  approved_by_id?: string | null;

  // ==========================================
  // INSTALLMENTS
  // ==========================================

  @ApiPropertyOptional({
    description: 'Installments generated for this loan.',
    type: () => [LoanInstallment],
  })
  @OneToMany(
    () => LoanInstallment,
    (installment) => installment.loan,
    {
      cascade: true,
    },
  )
  installments!: LoanInstallment[];

  // ==========================================
  // TIMESTAMPS
  // ==========================================

  @ApiProperty({
    example: '2026-08-01T10:00:00.000Z',
    description: 'Date when the loan record was created.',
  })
  @CreateDateColumn({
    type: 'timestamp',
  })
  created_at!: Date;

  @ApiProperty({
    example: '2026-08-01T10:00:00.000Z',
    description: 'Date when the loan record was last updated.',
  })
  @UpdateDateColumn({
    type: 'timestamp',
  })
  updated_at!: Date;
}