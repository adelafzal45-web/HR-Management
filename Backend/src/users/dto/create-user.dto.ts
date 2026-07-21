import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'Taha Tayyab', description: 'Full name of the user' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'abc@gmail.com', description: 'Unique email of the user' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'mypassword', minLength: 6, description: 'Password with at least 6 characters' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({ example: 'admin', description: 'Role of the user (optional)' })
  @IsOptional()
  @IsString()
  role?: string;
}
