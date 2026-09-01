import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
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
import { DeviceTestDto } from './dto/device-test.dto';

import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

/**
 * Biometric device administration.
 *
 * The device connection and the company-wide attendance mode are
 * `company_settings` columns, so these routes reuse that domain's permissions:
 * `company-settings.view` to read mappings, `company-settings.update` to change
 * anything (map/unmap an employee, test or reconnect the device). Every route
 * also sits behind the global JwtAuthGuard — none are `@Public()`. Real-time
 * punch ingestion is an internal listener, not an HTTP route, so it is
 * unaffected by this guarding.
 */
@ApiTags('Biometric')
@Controller('biometric')
export class BiometricController {
  constructor(
    private readonly biometricService: BiometricService,
  ) {}

  // =====================================================
  // TEST ZKTECO DEVICE CONNECTION
  // =====================================================

  @Post('device/test')
  @UseGuards(PermissionGuard)
  @RequirePermission('company-settings.update')
  @ApiOperation({
    summary: 'Test ZKTeco biometric device connection',
    description:
      'Connects to the biometric machine and reads its device info. With no body the currently saved device is used; send { ip, port, timeout } to validate an unsaved connection before committing it.',
  })
  @ApiBody({ type: DeviceTestDto, required: false })
  @ApiResponse({
    status: 201,
    description: 'Returns the connection status and device information.',
  })
  @ApiResponse({
    status: 403,
    description: 'User does not have company-settings.update permission.',
  })
  @ApiResponse({
    status: 500,
    description: 'The biometric machine could not be reached.',
  })
  testDeviceConnection(@Body() body?: DeviceTestDto) {
    // Forward an override only when a full connection was supplied; a partial
    // or empty body means "test the saved device".
    const override =
      body && body.ip && body.port
        ? { ip: body.ip, port: body.port, timeout: body.timeout }
        : undefined;

    return this.biometricService.testDeviceConnection(override);
  }

  // =====================================================
  // RECONNECT THE REAL-TIME LISTENER
  // =====================================================

  @Post('device/reconnect')
  @UseGuards(PermissionGuard)
  @RequirePermission('company-settings.update')
  @ApiOperation({
    summary: 'Reconnect the biometric listener',
    description:
      'Re-reads the saved device connection and restarts the real-time punch listener. Call this after changing the device IP/port so it takes effect without a server restart.',
  })
  @ApiResponse({ status: 201, description: 'Listener is restarting.' })
  @ApiResponse({
    status: 403,
    description: 'User does not have company-settings.update permission.',
  })
  reconnect() {
    return this.biometricService.restartListener();
  }

  // =====================================================
  // CREATE BIOMETRIC USER MAPPING
  // =====================================================

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('company-settings.update')
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
    description: 'Biometric user mapped successfully.',
  })
  @ApiResponse({
    status: 403,
    description: 'User does not have company-settings.update permission.',
  })
  @ApiResponse({
    status: 404,
    description: 'Employee not found.',
  })
  @ApiResponse({
    status: 409,
    description:
      'Biometric device user ID, or this employee, is already mapped.',
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
  @UseGuards(PermissionGuard)
  @RequirePermission('company-settings.view')
  @ApiOperation({
    summary: 'Get all biometric mappings',
  })
  @ApiResponse({
    status: 403,
    description: 'User does not have company-settings.view permission.',
  })
  findAll() {
    return this.biometricService.findAll();
  }

  // =====================================================
  // FIND EMPLOYEE BY DEVICE USER ID
  // =====================================================

  @Get('device-user/:deviceUserId')
  @UseGuards(PermissionGuard)
  @RequirePermission('company-settings.view')
  @ApiOperation({
    summary:
      'Find employee by ZKTeco device user ID',
  })
  @ApiParam({
    name: 'deviceUserId',
    example: '58',
  })
  @ApiResponse({
    status: 403,
    description: 'User does not have company-settings.view permission.',
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
  // FIND MAPPING BY HR USER ID (for the employee form)
  // =====================================================

  @Get('user/:userId')
  @UseGuards(PermissionGuard)
  @RequirePermission('company-settings.view')
  @ApiOperation({
    summary: "Get an employee's biometric mapping",
    description:
      'Returns the biometric mapping for the given HR user id, or null when the employee is not mapped. Used to prefill the device-ID field on the employee form.',
  })
  @ApiParam({
    name: 'userId',
    description: 'HR user id (uuid).',
  })
  @ApiResponse({
    status: 403,
    description: 'User does not have company-settings.view permission.',
  })
  findByUserId(
    @Param('userId')
    userId: string,
  ) {
    return this.biometricService.findByUserId(userId);
  }

  // =====================================================
  // GET ONE BIOMETRIC MAPPING
  // =====================================================

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('company-settings.view')
  @ApiOperation({
    summary: 'Get biometric mapping by ID',
  })
  @ApiResponse({
    status: 403,
    description: 'User does not have company-settings.view permission.',
  })
  findOne(@Param('id') id: string) {
    return this.biometricService.findOne(id);
  }

  // =====================================================
  // UPDATE BIOMETRIC MAPPING
  // =====================================================

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('company-settings.update')
  @ApiOperation({
    summary: 'Update biometric mapping',
  })
  @ApiBody({
    type: UpdateBiometricUserDto,
  })
  @ApiResponse({
    status: 403,
    description: 'User does not have company-settings.update permission.',
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
  @UseGuards(PermissionGuard)
  @RequirePermission('company-settings.update')
  @ApiOperation({
    summary: 'Deactivate biometric mapping',
  })
  @ApiResponse({
    status: 403,
    description: 'User does not have company-settings.update permission.',
  })
  deactivate(@Param('id') id: string) {
    return this.biometricService.deactivate(id);
  }

  // =====================================================
  // DELETE BIOMETRIC MAPPING
  // =====================================================

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('company-settings.update')
  @ApiOperation({
    summary: 'Delete biometric mapping',
  })
  @ApiResponse({
    status: 403,
    description: 'User does not have company-settings.update permission.',
  })
  remove(@Param('id') id: string) {
    return this.biometricService.remove(id);
  }
}
