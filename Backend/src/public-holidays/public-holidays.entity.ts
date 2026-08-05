import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../users/user.entity';

@Entity('public_holidays')
export class PublicHoliday {
  @PrimaryGeneratedColumn('uuid')
  holiday_id!: string;

  /**
   * Holiday Name
   */
  @Column({
    length: 100,
  })
  name!: string;

  /**
   * Holiday Date
   */
  @Column({
    type: 'date',
  })
  holiday_date!: Date;

  /**
   * Description
   */
  @Column({
    type: 'text',
    nullable: true,
  })
  description?: string;

  /**
   * HR/Admin who created this holiday
   */
  @ManyToOne(() => User, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'created_by',
  })
  createdBy!: User;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
