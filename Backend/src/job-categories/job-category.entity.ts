import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
} from 'typeorm';

import { User } from '../users/user.entity';

@Entity('job_categories')
export class JobCategory {
  @PrimaryGeneratedColumn('uuid')
  job_category_id!: string;

  @Column({
    unique: true,
    length: 100,
  })
  job_category_name!: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  description?: string;

  @OneToMany(() => User, (user) => user.jobCategory)
  users!: User[];
}