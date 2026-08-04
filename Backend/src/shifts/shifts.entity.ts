import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
} from 'typeorm';

import { User } from '../users/user.entity';
import { Attendance } from '../attendance/attendance.entity';

@Entity('shifts')
export class Shift {
  @PrimaryGeneratedColumn('uuid')
  shift_id!: string;

  @Column({
    unique: true,
    length: 100,
  })
  shift_name!: string;

  @Column({
    type: 'time',
  })
  start_time!: string;

  @Column({
    type: 'time',
  })
  end_time!: string;

  @Column({
    default: 0,
  })
  break_duration_minutes!: number;

  @Column({
    default: 0,
  })
  grace_period_minutes!: number;

  @Column({
    length: 20,
    default: 'Active',
  })
  status!: string;

  @OneToMany(() => User, (user) => user.shift)
  users!: User[];

  @OneToMany(() => Attendance, (attendance) => attendance.shift)
  attendance!: Attendance[];

  @CreateDateColumn()
  created_at!: Date;
}
