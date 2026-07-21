import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { User } from './user.entity';
import { UtilsModule} from '../utilis/utilis.module';

@Module({
   imports: [TypeOrmModule.forFeature([User]),UtilsModule],
  providers: [UsersService],
  controllers: [UsersController]
})
export class UsersModule {}
