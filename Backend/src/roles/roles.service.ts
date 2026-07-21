import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

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

  async remove(id: string) {
    await this.roleRepository.delete(id);

    return {
      message: 'Role deleted successfully',
    };
  }
}