import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../users/user.entity';
import { Shift } from '../shifts/shifts.entity';
import { PerformanceReview } from '../performance-review/performance-review.entity';
import {
  DEFAULT_ATTENDANCE_SOURCE,
  type AttendanceSource,
} from './attendance-source';

@Entity('attendance')
export class Attendance {
  @PrimaryGeneratedColumn('uuid')
  attendance_id!: string;

  @Column({
    type: 'date',
  })
  attendance_date!: Date;

  @Column({
    type: 'time',
    nullable: true,
  })
  check_in?: string;

  @Column({
    type: 'time',
    nullable: true,
  })
  check_out?: string;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  working_hours?: number;

  @Column({
    length: 20,
  })
  attendance_status!: string;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  overtime_hours?: number;

  @Column({
    default: false,
  })
  is_overtime!: boolean;

  // ============================
  // Source + audit trail
  // ============================
  //
  // Added so a manual entry for a remote employee can be told apart from a
  // device punch, and so every row records who filed and who last changed it.
  // The three text/uuid columns carry an explicit `type` — TypeORM cannot infer
  // a Postgres type from a union/`string | null` and the app would compile but
  // crash at startup without it ([[typeorm-nullable-union-column-type]]).

  // 'Device' or 'Online'. Defaults to Online: self-service and remote manual
  // entries are online; a device punch is flagged explicitly.
  @Column({ type: 'varchar', length: 20, default: DEFAULT_ATTENDANCE_SOURCE })
  attendance_source!: AttendanceSource;

  // Who created the row. Null for rows that predate this column and for any
  // future system-generated insert with no acting user. Raw uuid rather than a
  // relation to keep the eager-loaded record lean; the FK lives in the DB.
  @Column({ type: 'uuid', nullable: true })
  created_by?: string | null;

  // Who last changed the row (check-out, correction, status change).
  @Column({ type: 'uuid', nullable: true })
  updated_by?: string | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  // ============================
  // User Relation
  // ============================

  @ManyToOne(() => User, (user) => user.attendance, {
    nullable: false,
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
  })
  user!: User;

  // ============================
  // Shift Relation
  // ============================

  @ManyToOne(() => Shift, (shift) => shift.attendance, {
    eager: true,
    nullable: true,
  })
  @JoinColumn({
    name: 'shift_id',
  })
  shift?: Shift;

  // ============================
  // Attendance → Appraisal
  // ============================

  @OneToMany(() => PerformanceReview, (review) => review.attendance)
  performanceReviews!: PerformanceReview[];
}
