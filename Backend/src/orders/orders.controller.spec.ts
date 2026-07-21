import { Test, TestingModule } from '@nestjs/testing';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';


jest.mock('../guards/roles.guard', () => ({
  OrderOwnerGuard: jest.fn().mockImplementation(() => true),
}));


describe('OrdersController', () => {
  let controller: OrdersController;
  let service: Partial<OrdersService>;

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue([{ id: 1, name: 'Stub Order' }]),
      create: jest.fn().mockResolvedValue({ id: 1, name: 'Created Stub' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        {
          provide: OrdersService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<OrdersController>(OrdersController);
  });

  it('should return stubbed orders from service', async () => {
    const result = await controller.findAll();
    expect(result).toEqual([{ id: 1, name: 'Stub Order' }]);
  });

  it('should create order using stubbed service', async () => {
  const dto = { productName: 'Laptop', price: 1000, quantity: 2 };
    const result = await controller.createOrder(1, dto);
    expect(result).toEqual({ id: 1, name: 'Created Stub' });
  });
});
