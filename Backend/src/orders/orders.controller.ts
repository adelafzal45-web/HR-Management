import { Controller, Get, Post, Body, Param, Delete, UseGuards,UseInterceptors,Inject } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrderOwnerGuard } from '../guards/roles.guard';
import { OrderDataInterceptor } from '../interceptor/login-interceptor'; 
import { CreateOrderDto } from './dto/create-orders.dto';
import { ApiTags, ApiOperation, ApiCreatedResponse, ApiOkResponse, ApiParam, ApiBadRequestResponse,ApiHeader } from '@nestjs/swagger';


@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService,) {}


  @Post(':userId')
  @UseInterceptors(OrderDataInterceptor)
  @ApiOperation({ summary: 'Create a new Order' })
  @ApiCreatedResponse({ description: 'Order created successfully' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  async createOrder(
    @Param('userId') userId: number, @Body() dto:CreateOrderDto) {
    return this.ordersService.create({
      ...dto,
      user: { id: userId } as any,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Get all Orders' })
  @ApiOkResponse({ description: 'List of all Orders returned successfully' })
  async findAll() {
    return this.ordersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get Order by User ID' })
  @ApiParam({ name: 'ID', type: Number, description: 'User ID' })
  @ApiOkResponse({ description: 'Order returned successfully' })
  async findOne(@Param('id') id: string) {
    return this.ordersService.findOne(+id);
  }

  @UseGuards(OrderOwnerGuard)
  @ApiOperation({ summary: 'Delete a user' })
  @ApiParam({ name: 'id', type: Number, description: 'Post ID' })
  @ApiHeader({ 
    name: 'user-id', 
    description: 'ID of the user who owns the post', 
    required: true 
  })
  @ApiOkResponse({ description: 'User deleted successfully' })
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.ordersService.remove(+id);
  }
}
