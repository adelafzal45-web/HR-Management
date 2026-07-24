import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from './user.entity';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  create(user: Partial<User>) {
    const newUser = this.userRepository.create(user);
    return this.userRepository.save(newUser);
  }

  findAll() {
    return this.userRepository.find({
      relations: ['role', 'department', 'designation', 'shift', 'jobCategory'],
    });
  }

  findOne(id: string) {
    return this.userRepository.findOne({
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

    Object.assign(existingUser, updateUserDto);

    return this.userRepository.save(existingUser);
  }

  async delete(id: string) {
    await this.userRepository.delete(id);

    return {
      message: 'User deleted successfully',
    };
  }
}
