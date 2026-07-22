import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { User } from './user.entity';

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
      relations: ['role', 'department'],
    });
  }

  findOne(id: string) {
    return this.userRepository.findOne({
      where: {
        user_id: id,
      },
      relations: ['role', 'department'],
    });
  }

  async delete(id: string) {
    await this.userRepository.delete(id);

    return {
      message: 'User deleted successfully',
    };
  }
}
