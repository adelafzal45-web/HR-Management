import { PartialType } from '@nestjs/swagger';

import { CreateBiometricUserDto } from './create.dto';

export class UpdateBiometricUserDto extends PartialType(
  CreateBiometricUserDto,
) {}