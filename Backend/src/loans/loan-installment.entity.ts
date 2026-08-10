import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  RelationId
} from 'typeorm';

import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

import { Loan } from './loan.entity';
import { LoanInstallmentStatus } from './enums/loan-installment-status.enum';
import { Payroll } from '../payroll/payroll.entity';
import { User } from '../users/user.entity';

@Entity('loan_installments')
@Index(['loan_id', 'installment_number'], {
  unique: true,
})
@Index(['status', 'due_date'])
export class LoanInstallment {
  // ==========================================
  // PRIMARY KEY
  // ==========================================

  @ApiProperty({
    example: 'e5f6a7b8-9c0d-1e2f-3a4b-5c6d7e8f9a0b',
  })
  @PrimaryGeneratedColumn('uuid')
  loan_installment_id!: string;

  // ==========================================
  // LOAN
  // ==========================================

  @ApiProperty({
    description: 'Loan to which this installment belongs.',
  })
  @ManyToOne(
  () => Loan,
  (loan) => loan.installments,
  {
    nullable: false,
    onDelete: 'CASCADE',
  },
)
@JoinColumn({
  name: 'loan_id',
})
loan!: Loan;

@RelationId((installment: LoanInstallment) => installment.loan)
loan_id!: string;


  // ==========================================
  // INSTALLMENT NUMBER
  // ==========================================

  @ApiProperty({
    example: 1,
  })
  @Column({
    type: 'smallint',
  })
  installment_number!: number;

  // ==========================================
  // AMOUNT
  // ==========================================

  @ApiProperty({
    example: 10000,
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
  // DUE DATE
  // ==========================================

  @ApiProperty({
    example: '2026-08-30',
  })
  @Column({
    type: 'date',
  })
  due_date!: Date;

  // ==========================================
  // STATUS
  // ==========================================

  @ApiProperty({
    enum: LoanInstallmentStatus,
    example: LoanInstallmentStatus.PENDING,
  })
  @Column({
    type: 'enum',
    enum: LoanInstallmentStatus,
    default: LoanInstallmentStatus.PENDING,
  })
  status!: LoanInstallmentStatus;

  // ==========================================
  // PAID DATE
  // ==========================================

  @ApiPropertyOptional({
    example: '2026-08-30T15:00:00.000Z',
  })
  @Column({
    type: 'timestamp',
    nullable: true,
  })
  paid_at?: Date | null;

  // ==========================================
  // SKIP INFORMATION
  // ==========================================

  @ApiPropertyOptional({
    example: 'Employee requested temporary installment deferment.',
  })
  @Column({
    type: 'text',
    nullable: true,
  })
  skip_reason?: string | null;

  @ApiPropertyOptional({
    example: '2026-09-15T10:00:00.000Z',
  })
  @Column({
    type: 'timestamp',
    nullable: true,
  })
  skipped_at?: Date | null;

  @ApiPropertyOptional({
    example: 'd4e5f6a7-8b9c-0d1e-2f3a-4b5c6d7e8f9a',
  })
@ManyToOne(() => User, {
  nullable: true,
  eager: false,
  onDelete: 'SET NULL',
})
@JoinColumn({
  name: 'skipped_by_id',
})
skipped_by?: User | null;

@RelationId((installment: LoanInstallment) => installment.skipped_by)
skipped_by_id?: string | null;
  // ==========================================
  // PAYROLL REFERENCE
  // ==========================================

  /**
   * The payroll UUID is stored when this installment
   * is actually processed through payroll.
   *
   * This avoids making a loan belong to one payroll,
   * because a loan can span many payroll periods.
   */

 @ApiPropertyOptional({
  description: 'Payroll in which this installment was processed.',
  type: () => Payroll,
})
@ManyToOne(
  () => Payroll,
  (payroll) => payroll.loan_installments,
  {
    nullable: true,
    onDelete: 'SET NULL',
  },
)
@JoinColumn({
  name: 'payroll_id',
})
payroll?: Payroll | null;

@RelationId((installment: LoanInstallment) => installment.payroll)
payroll_id?: string | null;

  // ==========================================
  // TIMESTAMPS
  // ==========================================

  @ApiProperty({
    example: '2026-08-01T10:00:00.000Z',
  })
  @CreateDateColumn({
    type: 'timestamp',
  })
  created_at!: Date;

  @ApiProperty({
    example: '2026-08-01T10:00:00.000Z',
  })
  @UpdateDateColumn({
    type: 'timestamp',
  })
  updated_at!: Date;
}