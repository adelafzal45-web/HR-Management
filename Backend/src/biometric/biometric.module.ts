import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BiometricController } from './biometric.controller';
import { BiometricService } from './biometric.service';

import { BiometricUser } from './biometric.entity';
import { User } from '../users/user.entity';

import { AuthorizationModule } from '../authorization/authorization.module';
import { AttendanceModule } from '../attendance/attendance.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      BiometricUser,
      User,
    ]),

    AuthorizationModule,
    AttendanceModule,
  ],

  controllers: [
    BiometricController,
  ],

  providers: [
    BiometricService,
  ],

  exports: [
    BiometricService,
  ],
})
export class BiometricModule {}