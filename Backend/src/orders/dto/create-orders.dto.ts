import { IsString, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrderDto {
   @ApiProperty({ example: 'airpods pro', description: 'Full name of the Product' })
  @IsString()
  productName: string;

   @ApiProperty({ example: '2', description: 'Quantity of the Order' })
  @IsNumber()
  quantity: number;

 @ApiProperty({ example: '120', description: 'Price of the Product' })
  @IsNumber()
  price: number;
  @ApiPropertyOptional({ example: 'shipped', description: 'Status of the Order (optional)' })
  @IsOptional()
  @IsString()
  status?: string;
}
