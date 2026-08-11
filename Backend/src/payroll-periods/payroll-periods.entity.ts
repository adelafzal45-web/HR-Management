import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { User } from '../users/user.entity';

/**
 * A payroll run for a date range (spec §1 periods + the process/approve/lock
 * workflow).
 *
 * A period is the unit HR processes: it fixes the date window and working-day
 * count, then payslips are generated against it. Its `status` is a small state
 * machine — draft → processing → (pending_approval →) approved → locked → paid.
 * When `approval_enabled` is off in settings, processing goes straight to
 * approved; when on, an Administrator holding `payroll.approve` moves it from
 * pending_approval to approved. `prepared_by`/`approved_by` record who did each.
 */
@Entity('payroll_periods')
export class PayrollPeriod {
  @PrimaryGeneratedColumn('uuid')
  period_id!: string;

  @Column({ length: 100 })
  name!: string;

  @Column({ length: 20, default: 'monthly' })
  frequency!: string;

  @Column({ type: 'date' })
  period_start!: Date;

  @Column({ type: 'date' })
  period_end!: Date;

  @Column({ type: 'date', nullable: true })
  pay_date?: Date | null;

  /** Working days for the period; seeded from settings, overridable per run. */
  @Column({ type: 'int', default: 0 })
  working_days!: number;

  /** draft | processing | pending_approval | approved | locked | paid. */
  @Column({ length: 20, default: 'draft' })
  status!: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'prepared_by' })
  preparedBy?: User | null;

  @Column({ type: 'uuid', nullable: true })
  prepared_by?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approved_by' })
  approvedBy?: User | null;

  @Column({ type: 'uuid', nullable: true })
  approved_by?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  processed_at?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  approved_at?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  locked_at?: Date | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
