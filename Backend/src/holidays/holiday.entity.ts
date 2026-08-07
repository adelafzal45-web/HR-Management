import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Department } from '../department/department.entity';

/**
 * Company/department holiday calendar.
 *
 * Excluded from leave day counts alongside weekends by
 * `LeaveCalculationService`. `department_id` null means the holiday applies
 * company-wide; set, it applies to that department only (e.g. a regional
 * public holiday).
 */
@Entity('holidays')
export class Holiday {
  @PrimaryGeneratedColumn('uuid')
  holiday_id!: string;

  @Column({ length: 150 })
  name!: string;

  @Column({ type: 'date' })
  holiday_date!: Date;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'department_id' })
  department?: Department | null;

  @Column({ type: 'uuid', nullable: true })
  department_id?: string | null;

  /**
   * When true, this holiday recurs on the same month/day every year.
   * `LeaveCalculationService` matches recurring holidays on month+day only,
   * so a single row created once (e.g. "New Year's Day") keeps applying
   * without HR having to re-enter it annually.
   */
  @Column({ type: 'boolean', default: false })
  is_recurring!: boolean;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
