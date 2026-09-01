import { IsIP, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Validates the biometric device connection for the company-settings PATCH.
 *
 * Stored as one jsonb blob and replaced wholesale — the frontend sends the whole
 * object, so `ip` and `port` are required (a device config without an address is
 * meaningless). `ip` must be a real IP the listener can dial; `port` a valid TCP
 * port; `timeout` a sane socket timeout when present.
 */
export class BiometricDeviceDto {
  @ApiProperty({
    example: '192.168.100.73',
    description: 'Device IP address on the local network.',
  })
  @IsIP()
  ip!: string;

  @ApiProperty({
    example: 4370,
    description: 'TCP port the ZKTeco SDK connects on.',
  })
  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @ApiPropertyOptional({
    example: 10000,
    description: 'Socket timeout in milliseconds.',
  })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(60000)
  timeout?: number;
}
