import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from './post.entity';
import { User } from '../users/user.entity';

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post)
    private readonly postsRepository: Repository<Post>,
  ) {}


  async create(postData: Partial<Post>): Promise<Post> {
  const post = this.postsRepository.create(postData);
  return this.postsRepository.save(post);
}



  async findAll(): Promise<Post[]> {
    return this.postsRepository.find({ relations: ['user'] });
  }


async findOne(id: number): Promise<Post | null> {
  return this.postsRepository.findOne({
    where: { id },
    relations: ['user'], 
  });
}


  async remove(id: number): Promise<void> {
    await this.postsRepository.delete(id);
  }
}
