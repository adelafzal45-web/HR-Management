import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { User } from '../users/user.entity';

@Entity('posts') 
export class Post {
  @PrimaryGeneratedColumn()
  id: number; 

  @Column({ length: 200 })
  title: string; 

  @Column('text')
  content: string;

  @Column({ default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date; 
  
  @ManyToOne(() => User, user => user.posts, { onDelete: 'CASCADE' })
  user: User; 
}
