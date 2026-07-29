import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from './user.entity';

import { UserController } from './users.controller';
import { UserService } from './users.service';
import { AuthorizationModule } from '../authorization/authorization.module';
@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthorizationModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
