import { ApiProperty } from '@nestjs/swagger';

import {
  IsNotEmpty,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateBiometricUserDto {
  @ApiProperty({
    example: '25',
    description:
      'User ID assigned to the employee by the ZKTeco biometric machine.',
  })
  @IsString()
  @IsNotEmpty()
  device_user_id!: string;

  @ApiProperty({
    example: 'dced0533-ad5e-4f86-8e76-34e9a4e78451',
    description: 'UUID of the employee in the HR portal.',
  })
  @IsUUID()
  user_id!: string;
}