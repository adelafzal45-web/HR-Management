import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIP, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Optional connection override for the "Test connection" button.
 *
 * Every field is optional so an empty body tests the device currently saved on
 * company_settings. When HR is editing the connection, the not-yet-saved
 * ip/port/timeout ride along so they can confirm the machine is reachable
 * before committing. Provided values are validated exactly like
 * `BiometricDeviceDto`; the controller only forwards an override when both ip
 * and port are present.
 */
export class DeviceTestDto {
  @ApiPropertyOptional({ example: '192.168.100.73' })
  @IsOptional()
  @IsIP()
  ip?: string;

  @ApiPropertyOptional({ example: 4370, minimum: 1, maximum: 65535 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiPropertyOptional({ example: 10000, minimum: 1000, maximum: 60000 })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(60000)
  timeout?: number;
}
