import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { User } from '../users/user.entity';

@Entity('payroll')
export class Payroll {
  @PrimaryGeneratedColumn('uuid')
  payroll_id!: string;

  @Column({
    type: 'date',
  })
  payroll_month!: Date;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
  basic_salary!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  allowance!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  bonus!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  deduction!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  tax!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
  })
  net_salary!: number;

  @Column({
    type: 'date',
  })
  payment_date!: Date;

  @ManyToOne(() => User, {
    eager: true,
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
  })
  user!: User;
}