import {
  Entity,
  PrimaryGeneratedColumn,
  Column,OneToMany,
} from 'typeorm';
import { RolePermission } from '../role-permissions/role-permissions.entity';

@Entity('permissions')
export class Permission {

  @PrimaryGeneratedColumn('uuid')
  permission_id!: string;

  @Column({
    unique: true,
    length: 100,
  })
  permission_name!: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  description?: string;

  @OneToMany(() => RolePermission, (rolePermission) => rolePermission.permission)
rolePermissions!: RolePermission[];
}

