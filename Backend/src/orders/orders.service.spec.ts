import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Order } from './orders.entity';

describe('OrdersService', () => {
  let service: OrdersService;
  let ordersRepository: any;
  let idProvider: jest.Mock;

  beforeEach(async () => {
    const mockOrdersRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
    };

    const mockIdProvider = jest.fn(() => 12345);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue:mockOrdersRepository },
        { provide: 'CUSTOM_ID_PROVIDER', useValue: mockIdProvider },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    ordersRepository = module.get(getRepositoryToken(Order));
    idProvider = module.get('CUSTOM_ID_PROVIDER');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should generate id if not provided and save order', async () => {
      const orderData: Partial<Order> = {
        productName: 'Laptop',
        price: 1200.5,
        quantity: 2,
        status: 'pending',
      };

      const savedOrder = { id: 12345, ...orderData };

      ordersRepository.create.mockReturnValue(orderData);
      ordersRepository.save.mockResolvedValue(savedOrder);

      const result = await service.create(orderData);

      expect(idProvider).toHaveBeenCalled();
      expect(ordersRepository.create).toHaveBeenCalledWith({ id: 12345, ...orderData });
      expect(ordersRepository.save).toHaveBeenCalled();
      expect(result).toEqual(savedOrder);
    });
  });

  describe('findAll', () => {
    it('should return all orders with user relation', async () => {
      const orders = [
        { id: 1, productName: 'Phone', price: 800, quantity: 1, status: 'pending', user: {} },
      ];
      ordersRepository.find.mockResolvedValue(orders);

      const result = await service.findAll();

      expect(ordersRepository.find).toHaveBeenCalledWith({ relations: ['user'] });
      expect(result).toEqual(orders);
    });
  });

  describe('findOne', () => {
    it('should return an order by id with user relation', async () => {
      const order = {
        id: 1,
        productName: 'Tablet',
        price: 500,
        quantity: 3,
        status: 'pending',
        user: {},
      };
      ordersRepository.findOne.mockResolvedValue(order);

      const result = await service.findOne(1);

      expect(ordersRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['user'],
      });
      expect(result).toEqual(order);
    });
  });

  describe('remove', () => {
    it('should delete order by id', async () => {
      ordersRepository.delete.mockResolvedValue(undefined);

      await service.remove(1);

      expect(ordersRepository.delete).toHaveBeenCalledWith(1);
    });
  });
});
