import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';

import { UpdateRoleDto } from './dto/update-role.dto';
import { Repository } from 'typeorm';

import { Role } from './roles.entity';

import { CreateRoleDto } from './dto/create-role.dto';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
  ) {}

  create(createRoleDto: CreateRoleDto) {
    const role = this.roleRepository.create(createRoleDto);

    return this.roleRepository.save(role);
  }

  findAll() {
    return this.roleRepository.find();
  }

  findOne(id: string) {
    return this.roleRepository.findOne({
      where: {
        role_id: id,
      },
    });
  }

  async update(id: string, updateRoleDto: UpdateRoleDto) {
    const role = await this.roleRepository.findOne({
      where: {
        role_id: id,
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    Object.assign(role, updateRoleDto);

    return this.roleRepository.save(role);
  }

  async remove(id: string) {
    await this.roleRepository.delete(id);

    return {
      message: 'Role deleted successfully',
    };
  }
}
