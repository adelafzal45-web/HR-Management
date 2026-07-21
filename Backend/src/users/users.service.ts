import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @Inject('CUSTOM_ID_PROVIDER') private generateId: () => number,
  ) {}


  async create(userData: Partial<User>): Promise<User> {
   const id=this.generateId();
    const user = this.usersRepository.create({id,...userData});
    return this.usersRepository.save(user);
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.find({ relations: ['posts'] });
  }

  

async findOne(id: number): Promise<User | null> {
  return this.usersRepository.findOne({
    where: { id },
   relations: ['posts'],
  });
}

  
  async remove(id: number): Promise<void> {
    await this.usersRepository.delete(id);
  }
}
