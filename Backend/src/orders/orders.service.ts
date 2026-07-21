import { Injectable,Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './orders.entity';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
      @Inject('CUSTOM_ID_PROVIDER') private generateId: () => number,
  ) {}

  async create(orderData: Partial<Order>): Promise<Order> {

  if (!orderData.id) {
    orderData.id = this.generateId();
  }

  const order = this.ordersRepository.create(orderData);
  return await this.ordersRepository.save(order);
}


  async findAll(): Promise<Order[]> {
    return await this.ordersRepository.find({ relations: ['user'] });
  }

  async findOne(id: number): Promise<Order | null> {
    return this.ordersRepository.findOne({
      where: { id },
      relations: ['user'],
    });
  }

  
  async remove(id: number): Promise<void> {
    await this.ordersRepository.delete(id);
  }
}
