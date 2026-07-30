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

  // ==========================================
  // MAP DTO RELATION IDs TO ENTITY RELATIONS
  // ==========================================

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

    // ==========================================
    // ROLE
    // ==========================================

    if (dto.role_id) {
      user.role = {
        role_id: dto.role_id,
      } as User['role'];
    }

    // ==========================================
    // DEPARTMENT
    // ==========================================

    if (dto.department_id) {
      user.department = {
        department_id: dto.department_id,
      } as User['department'];
    }

    // ==========================================
    // DESIGNATION
    // ==========================================

    if (dto.designation_id) {
      user.designation = {
        designation_id: dto.designation_id,
      } as User['designation'];
    }

    // ==========================================
    // JOB CATEGORY
    // ==========================================

    if (dto.job_category_id) {
      user.jobCategory = {
        job_category_id: dto.job_category_id,
      } as User['jobCategory'];
    }

    // ==========================================
    // SHIFT
    // ==========================================

    if (dto.shift_id) {
      user.shift = {
        shift_id: dto.shift_id,
      } as User['shift'];
    }

    return user;
  }

  // ==========================================
  // CREATE USER
  // ==========================================

  async create(createUserDto: CreateUserDto) {
    const newUser = this.userRepository.create(
      this.mapRelations(createUserDto),
    );

    return await this.userRepository.save(newUser);
  }

  // ==========================================
  // FIND ALL USERS
  // ==========================================

  async findAll() {
    return await this.userRepository.find({
      relations: ['role', 'department', 'designation', 'shift', 'jobCategory'],
    });
  }

  // ==========================================
  // FIND ONE USER
  // ==========================================

  async findOne(id: string) {
    const user = await this.userRepository.findOne({
      where: {
        user_id: id,
      },
      relations: ['role', 'department', 'designation', 'shift', 'jobCategory'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  // ==========================================
  // UPDATE USER
  // ==========================================

  async update(id: string, updateUserDto: UpdateUserDto) {
    const existingUser = await this.findOne(id);

    Object.assign(existingUser, this.mapRelations(updateUserDto));

    return await this.userRepository.save(existingUser);
  }

  // ==========================================
  // DELETE USER
  // ==========================================

  async delete(id: string) {
    const existingUser = await this.findOne(id);

    await this.userRepository.remove(existingUser);

    return {
      message: 'User deleted successfully',
    };
  }
}
