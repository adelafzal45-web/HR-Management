import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { Permission } from './permission.entity';

@Injectable()
export class PermissionsService {

  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
  ) {}

  create(permission: Partial<Permission>) {

    const newPermission =
      this.permissionRepository.create(permission);

    return this.permissionRepository.save(newPermission);
  }

  findAll() {
    return this.permissionRepository.find();
  }

  findOne(id: string) {
    return this.permissionRepository.findOne({
      where: {
        permission_id: id,
      },
    });
  }

  async delete(id: string) {

    await this.permissionRepository.delete(id);

    return {
      message: 'Permission deleted successfully',
    };
  }
}