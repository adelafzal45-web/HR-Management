import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { User } from '../users/user.entity';

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
  })
  check_in!: string;

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

  @ManyToOne(() => User, (user) => user.attendance, {
    nullable: false,
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
  })
  user!: User;
}
