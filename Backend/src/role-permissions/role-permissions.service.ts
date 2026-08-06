import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UpdateRolePermissionDto } from './dto/update-role.dto';
import { Repository } from 'typeorm';

import { RolePermission } from './role-permissions.entity';
import { Role } from '../roles/roles.entity';
import { Permission } from '../permissions/permission.entity';

import { CreateRolePermissionDto } from './dto/create-role-permission.dto';

@Injectable()
export class RolePermissionsService {
  constructor(
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepository: Repository<RolePermission>,

    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,

    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
  ) {}

  async create(dto: CreateRolePermissionDto) {
    const role = await this.roleRepository.findOne({
      where: { role_id: dto.roleId },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const permission = await this.permissionRepository.findOne({
      where: { permission_id: dto.permissionId },
    });

    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    /*
     * `role_permissions` has no UNIQUE on (role_id, permission_id), so nothing
     * at the database level stops the same grant being inserted twice. A
     * duplicate is not harmful — `PermissionGuard` only asks whether a row
     * exists — but it makes the Roles screen's diff wrong: it unassigns by row
     * id, so it deletes one copy and the permission stays granted.
     *
     * Checked rather than caught, because there is no constraint to catch. Two
     * concurrent grants of the same pair can still both land; that is the
     * existing behaviour and needs the index to fix properly.
     */
    const duplicate = await this.rolePermissionRepository.findOne({
      where: {
        role: { role_id: dto.roleId },
        permission: { permission_id: dto.permissionId },
      },
    });

    if (duplicate) {
      throw new ConflictException(
        `"${role.role_name}" already grants "${permission.permission_name}".`,
      );
    }

    const rolePermission = this.rolePermissionRepository.create({
      role,
      permission,
    });

    return this.rolePermissionRepository.save(rolePermission);
  }

  findAll() {
    return this.rolePermissionRepository.find({
      relations: ['role', 'permission'],
    });
  }

  async update(id: string, dto: UpdateRolePermissionDto) {
    const rolePermission = await this.rolePermissionRepository.findOne({
      where: {
        role_permission_id: id,
      },
      relations: ['role', 'permission'],
    });

    if (!rolePermission) {
      throw new NotFoundException('Role Permission not found');
    }

    if (dto.roleId) {
      const role = await this.roleRepository.findOne({
        where: {
          role_id: dto.roleId,
        },
      });

      if (!role) {
        throw new NotFoundException('Role not found');
      }

      rolePermission.role = role;
    }

    if (dto.permissionId) {
      const permission = await this.permissionRepository.findOne({
        where: {
          permission_id: dto.permissionId,
        },
      });

      if (!permission) {
        throw new NotFoundException('Permission not found');
      }

      rolePermission.permission = permission;
    }

    return this.rolePermissionRepository.save(rolePermission);
  }

  async remove(id: string) {
    // `delete` reports 0 affected rows for an id that never existed rather than
    // throwing, so without this an unassign of a stale row answered 200 and the
    // Roles screen took it as confirmation that the grant was gone.
    const result = await this.rolePermissionRepository.delete(id);

    if (!result.affected) {
      throw new NotFoundException('Role Permission not found');
    }

    return {
      role_permission_id: id,
      message: 'Role Permission deleted successfully',
    };
  }
}
