import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Post } from '../posts/post.entity';
import { Order } from '../orders/orders.entity';

@Entity('users') 
export class User {
  @PrimaryGeneratedColumn() 
  id: number;

  @Column({ unique: true }) 
  email: string;

  @Column({ length: 100 }) 
  name: string;

  @Column() 
  password: string;

  @Column({ default: true }) 
  isActive: boolean;


  @OneToMany(() => Post, post => post.user, { cascade: true, onDelete: 'CASCADE' })
  posts: Post[];

    @OneToMany(() => Order, orders => orders.user, { cascade: true, onDelete: 'CASCADE' })
  orders: Order[];
}
