import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Role } from '../roles/roles.entity';
import { Department } from '../department/department.entity';

@Entity('users')
export class User {

  @PrimaryGeneratedColumn('uuid')
  user_id!: string;

  @Column({ length: 100 })
  first_name!: string;

  @Column({ length: 100 })
  last_name!: string;

  @Column({
    unique: true,
    length: 255,
  })
  email!: string;

  @Column()
  password!: string;

  @Column({
    nullable: true,
    length: 20,
  })
  phone?: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  profile_image?: string;

  @Column({
    nullable: true,
    length: 30,
  })
  employee_type?: string;

  @Column({
    nullable: true,
    length: 100,
  })
  designation?: string;

  @Column({
    type: 'date',
  })
  joining_date!: Date;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  salary?: number;

  @Column({
    default: true,
  })
  status!: boolean;

  @ManyToOne(() => Role, (role) => role.users)
  role!: Role;

  @ManyToOne(() => Department, (department) => department.users)
  department!: Department;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}