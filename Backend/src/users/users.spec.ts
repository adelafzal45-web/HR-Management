import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { Post } from '../posts/post.entity';
import { Order } from '../orders/orders.entity';

describe('UsersModule (Integration)', () => {

  let controller: UsersController;
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: 'localhost',
          port: 5432,
          username: 'postgres',
          password: '123454321',
          database: 'bus',
          entities: [User,Post,Order],
          synchronize: true,
          dropSchema: true, 
        }),
        TypeOrmModule.forFeature([User]),
      ],
      controllers: [UsersController],
      providers: [
        UsersService,
        {
          provide: 'CUSTOM_ID_PROVIDER',
          useValue: () => Math.floor(Math.random() * 1000000),
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(service).toBeDefined();
  });

  it('should create a user (via controller)', async () => {
    const user = await controller.create({
      name: 'Taha',
      email: 'taha@example.com',
      password: '12345',
    });

    expect(user.id).toBeDefined();
    expect(user.name).toBe('Taha');
  });

  it('should fetch all users (via controller)', async () => {
    await controller.create({ name: 'Ali', email: 'ali@example.com', password: 'pass' });

    const users = await controller.findAll();
    expect(users.length).toBeGreaterThan(0);
  });

  it('should fetch a user by ID (via controller)', async () => {
    const newUser = await controller.create({
      name: 'Sara',
      email: 'sara@example.com',
      password: 'securepass',
    });

    const user = await controller.findOne(newUser.id);
    expect(user).toBeDefined();
    expect(user?.email).toBe('sara@example.com');
  });

  it('should delete a user (via controller)', async () => {
    const newUser = await controller.create({
      name: 'DeleteMe',
      email: 'deleteme@example.com',
      password: 'bye',
    });

    await controller.remove(newUser.id.toString());
    const result = await controller.findOne(newUser.id);

    expect(result).toBeNull();
  });
});
