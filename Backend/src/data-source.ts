import { DataSource } from 'typeorm';
import { User } from './users/user.entity';
import { Post } from './posts/post.entity';
import { Order } from './orders/orders.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: '123454321',
  database: 'bu',
  entities: [User, Post,Order],
  migrations: ['./migrations/*{.ts,.js}'],
  synchronize: false,
});
