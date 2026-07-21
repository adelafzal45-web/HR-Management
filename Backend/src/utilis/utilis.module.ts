import { Module } from '@nestjs/common';
import { CustomIdProvider } from './id.provider';

@Module({
  providers: [CustomIdProvider],
  exports: [CustomIdProvider],
})
export class UtilsModule {}
