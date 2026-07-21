import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
} from 'typeorm';

import { User } from '../users/user.entity';
import { RolePermission } from '../role-permissions/role-permissions.entity';
@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid')
  role_id!: string;

  @Column({
    unique: true,
    length: 50,
  })
  role_name!: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  description!: string;

  @OneToMany(() => User, (user) => user.role)
  users!: User[];

  @OneToMany(() => RolePermission, (rolePermission) => rolePermission.role)
rolePermissions!: RolePermission[];
}

