import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Maps DTO relation IDs to TypeORM relation objects.
   */
  private mapRelations(
    dto: Partial<CreateUserDto | UpdateUserDto>,
  ): Partial<User> {
    const user: Partial<User> = {
      employee_code: dto.employee_code,
      first_name: dto.first_name,
      last_name: dto.last_name,
      email: dto.email,
      password: dto.password,
      phone: dto.phone,
      profile_image: dto.profile_image,
      date_of_birth: dto.date_of_birth,
      gender: dto.gender,
      address: dto.address,
      employee_type: dto.employee_type,
      joining_date: dto.joining_date,
      salary: dto.salary,
      status: dto.status,
    };

    if (dto.roleId) {
      user.role = {
        role_id: dto.roleId,
      } as User['role'];
    }

    if (dto.departmentId) {
      user.department = {
        department_id: dto.departmentId,
      } as User['department'];
    }

    if (dto.designationId) {
      user.designation = {
        designation_id: dto.designationId,
      } as User['designation'];
    }

    if (dto.jobCategoryId) {
      user.jobCategory = {
        job_category_id: dto.jobCategoryId,
      } as User['jobCategory'];
    }

    if (dto.shiftId) {
      user.shift = {
        shift_id: dto.shiftId,
      } as User['shift'];
    }

    return user;
  }

  async create(createUserDto: CreateUserDto) {
    const newUser = this.userRepository.create(
      this.mapRelations(createUserDto),
    );

    return await this.userRepository.save(newUser);
  }

  async findAll() {
    return await this.userRepository.find({
      relations: ['role', 'department', 'designation', 'shift', 'jobCategory'],
    });
  }

  async findOne(id: string) {
    return await this.userRepository.findOne({
      where: {
        user_id: id,
      },
      relations: ['role', 'department', 'designation', 'shift', 'jobCategory'],
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const existingUser = await this.findOne(id);

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    Object.assign(existingUser, this.mapRelations(updateUserDto));

    return await this.userRepository.save(existingUser);
  }

  async delete(id: string) {
    const existingUser = await this.findOne(id);

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    await this.userRepository.remove(existingUser);

    return {
      message: 'User deleted successfully',
    };
  }
}
