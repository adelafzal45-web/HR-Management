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
 * What kind of calendar row this is. `Holiday` is excluded from leave/
 * attendance/payroll working-day counts; `Event` (a dinner, a town hall) is
 * calendar-and-notification only and never removes a working day from
 * anyone's count.
 */
export enum HolidayEventType {
  HOLIDAY = 'Holiday',
  EVENT = 'Event',
}

/**
 * Company/department holiday calendar. Also carries plain company events
 * (`event_type = Event`) so both show up on the same calendar without an
 * event ever being mistaken for a day off.
 *
 * Holiday rows are excluded from leave day counts alongside weekends by
 * `LeaveCalculationService`. `department_id` null means the entry applies
 * company-wide; set, it applies to that department only (e.g. a regional
 * public holiday or a team dinner).
 */
@Entity('holidays')
export class Holiday {
  @PrimaryGeneratedColumn('uuid')
  holiday_id!: string;

  @Column({ length: 150 })
  name!: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: HolidayEventType.HOLIDAY,
  })
  event_type!: HolidayEventType;

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

  /** Whether the creator asked everyone to be notified when this was added. */
  @Column({ type: 'boolean', default: false })
  notify!: boolean;

  /**
   * When the announcement actually went out. Null while `notify` is false,
   * and also null if `notify` was true but the send failed (e.g. no active
   * employees) — distinct from "never asked for" on purpose, so a silently
   * failed send is still visible on the row.
   */
  @Column({ type: 'timestamp', nullable: true })
  notified_at?: Date | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
