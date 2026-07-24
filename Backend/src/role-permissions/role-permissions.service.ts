import { Injectable, NotFoundException } from '@nestjs/common';
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
    await this.rolePermissionRepository.delete(id);

    return {
      message: 'Role Permission deleted successfully',
    };
  }
}
