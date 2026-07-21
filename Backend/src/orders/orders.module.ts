import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import {Order} from './orders.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UtilsModule} from '../utilis/utilis.module';

@Module({
   imports: [TypeOrmModule.forFeature([Order]),UtilsModule],
  providers: [OrdersService],
  controllers: [OrdersController]
})
export class OrdersModule {}
