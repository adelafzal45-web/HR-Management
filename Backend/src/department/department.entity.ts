import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';

import { User } from '../users/user.entity';
import { Designation } from '../designation/designation.entity';
@Entity('departments')
export class Department {
  @PrimaryGeneratedColumn('uuid')
  department_id!: string;

  @Column({
    unique: true,
    length: 100,
  })
  department_name!: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  description?: string;

  @OneToMany(() => User, (user) => user.department)
  users!: User[];

  @OneToMany(() => Designation, (designation) => designation.department)
  designations!: Designation[];
}
