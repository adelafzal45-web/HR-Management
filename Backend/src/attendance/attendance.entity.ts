import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { User } from '../users/user.entity';
import { Shift } from '../shifts/shifts.entity';
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

 @ManyToOne(() => User, (user) => user.attendance, {
  nullable: false,
  eager: true,
  onDelete: 'CASCADE',
})
@JoinColumn({
  name: 'user_id',
})
user!: User;

@ManyToOne(() => Shift, (shift) => shift.attendance, {
  eager: true,
})
@JoinColumn({
  name: 'shift_id',
})
shift!: Shift;
}
