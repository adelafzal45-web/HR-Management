import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { BiometricService } from './biometric.service';

import { CreateBiometricUserDto } from './dto/create.dto';
import { UpdateBiometricUserDto } from './dto/update.dto';

import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Biometric')
@Controller('biometric')
export class BiometricController {
  constructor(
    private readonly biometricService: BiometricService,
  ) {}

  // =====================================================
  // TEST ZKTECO DEVICE CONNECTION
  // =====================================================

  @Get('device/test')
  @Public()
  @ApiOperation({
    summary: 'Test ZKTeco biometric device connection',
  })
  @ApiResponse({
    status: 200,
    description:
      'Returns the connection status and device information.',
  })
  testDeviceConnection() {
    return this.biometricService.testDeviceConnection();
  }

  // =====================================================
  // CREATE BIOMETRIC USER MAPPING
  // =====================================================

  @Post()
  @Public()
  @ApiOperation({
    summary: 'Map a biometric user to an employee',
    description:
      'Maps the user ID from the ZKTeco biometric machine to an employee in the HR portal.',
  })
  @ApiBody({
    type: CreateBiometricUserDto,
  })
  @ApiResponse({
    status: 201,
    description:
      'Biometric user mapped successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Employee not found.',
  })
  @ApiResponse({
    status: 409,
    description:
      'Biometric device user ID is already mapped.',
  })
  create(
    @Body()
    createDto: CreateBiometricUserDto,
  ) {
    return this.biometricService.create(createDto);
  }

  // =====================================================
  // GET ALL BIOMETRIC MAPPINGS
  // =====================================================

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Get all biometric mappings',
  })
  findAll() {
    return this.biometricService.findAll();
  }

  // =====================================================
  // FIND EMPLOYEE BY DEVICE USER ID
  // =====================================================

  @Get('device-user/:deviceUserId')
  @Public()
  @ApiOperation({
    summary:
      'Find employee by ZKTeco device user ID',
  })
  @ApiParam({
    name: 'deviceUserId',
    example: '58',
  })
  findByDeviceUserId(
    @Param('deviceUserId')
    deviceUserId: string,
  ) {
    return this.biometricService.findByDeviceUserId(
      deviceUserId,
    );
  }

  // =====================================================
  // GET ONE BIOMETRIC MAPPING
  // =====================================================

  @Get(':id')
  @Public()
  @ApiOperation({
    summary: 'Get biometric mapping by ID',
  })
  findOne(@Param('id') id: string) {
    return this.biometricService.findOne(id);
  }

  // =====================================================
  // UPDATE BIOMETRIC MAPPING
  // =====================================================

  @Patch(':id')
  @Public()
  @ApiOperation({
    summary: 'Update biometric mapping',
  })
  @ApiBody({
    type: UpdateBiometricUserDto,
  })
  update(
    @Param('id') id: string,
    @Body()
    updateDto: UpdateBiometricUserDto,
  ) {
    return this.biometricService.update(
      id,
      updateDto,
    );
  }

  // =====================================================
  // DEACTIVATE BIOMETRIC MAPPING
  // =====================================================

  @Patch(':id/deactivate')
  @Public()
  @ApiOperation({
    summary: 'Deactivate biometric mapping',
  })
  deactivate(@Param('id') id: string) {
    return this.biometricService.deactivate(id);
  }

  // =====================================================
  // DELETE BIOMETRIC MAPPING
  // =====================================================

  @Delete(':id')
  @Public()
  @ApiOperation({
    summary: 'Delete biometric mapping',
  })
  remove(@Param('id') id: string) {
    return this.biometricService.remove(id);
  }
}