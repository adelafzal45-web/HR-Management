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
import { Designation } from '../designation/designation.entity';

/**
 * One row per (scope, day-of-week) that is configured.
 *
 * Scope is implied by which FKs are set:
 *   - both NULL              -> global company default
 *   - department only        -> department override
 *   - department+designation -> designation override (most specific)
 *
 * A day with no row at the winning scope is non-working. See
 * CreateWorkingDaySchedules for the uniqueness rules.
 */
@Entity('working_day_schedules')
export class WorkingDaySchedule {
  @PrimaryGeneratedColumn('uuid')
  schedule_id!: string;

  @ManyToOne(() => Department, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'department_id' })
  department?: Department | null;

  @Column({ type: 'uuid', nullable: true })
  department_id?: string | null;

  @ManyToOne(() => Designation, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'designation_id' })
  designation?: Designation | null;

  @Column({ type: 'uuid', nullable: true })
  designation_id?: string | null;

  /** ISO-8601 day number: 1 = Monday ... 7 = Sunday. */
  @Column({ type: 'smallint' })
  day_of_week!: number;

  @Column({ type: 'boolean', default: true })
  is_working!: boolean;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
