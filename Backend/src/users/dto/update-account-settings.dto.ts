import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Account state toggles for an employee.
 *
 * Scope note: the spec lists ~22 toggles, but most of them ("Leave Module",
 * "Payroll Module", "View Reports", "Submit Evaluation", …) describe *feature
 * access*, which this application already models through the RBAC
 * role/permission graph. Duplicating them as boolean columns would create a
 * second authorization system that can silently disagree with the first — the
 * classic case being a user whose role grants `payroll.view` while their row
 * says `payroll_module = false`, leaving "can they?" genuinely ambiguous.
 *
 * So this DTO carries only the flags that RBAC cannot express: whether the
 * account can authenticate at all, and through which channel or device. Module
 * access is granted and revoked by changing the employee's role or that role's
 * permissions, which is the existing, audited path.
 *
 * Every field is optional so the UI can PATCH a single toggle.
 */
export class UpdateAccountSettingsDto {
  @ApiPropertyOptional({
    description:
      'Master switch. When false, login is refused regardless of correct credentials.',
  })
  @IsOptional()
  @IsBoolean()
  login_enabled?: boolean;

  @ApiPropertyOptional({
    description: 'Whether this employee may reset their own password.',
  })
  @IsOptional()
  @IsBoolean()
  password_reset_allowed?: boolean;

  @ApiPropertyOptional({ description: 'Allow sign-in from the web client.' })
  @IsOptional()
  @IsBoolean()
  web_login_allowed?: boolean;

  @ApiPropertyOptional({ description: 'Allow sign-in from the mobile app.' })
  @IsOptional()
  @IsBoolean()
  mobile_login_allowed?: boolean;

  @ApiPropertyOptional({
    description: 'Allow programmatic API access with this account.',
  })
  @IsOptional()
  @IsBoolean()
  api_access_allowed?: boolean;

  @ApiPropertyOptional({
    description:
      'Allow concurrent sessions on multiple devices. When false, a new sign-in supersedes the previous session.',
  })
  @IsOptional()
  @IsBoolean()
  multi_device_login_allowed?: boolean;

  @ApiPropertyOptional({
    description: 'Allow marking attendance from outside the office network.',
  })
  @IsOptional()
  @IsBoolean()
  remote_attendance_allowed?: boolean;

  @ApiPropertyOptional({
    description: 'Allow attendance capture through the biometric device.',
  })
  @IsOptional()
  @IsBoolean()
  biometric_attendance_allowed?: boolean;

  @ApiPropertyOptional({
    description: 'Whether overtime hours may be logged for this employee.',
  })
  @IsOptional()
  @IsBoolean()
  is_overtime?: boolean;

  @ApiPropertyOptional({
    description:
      'Employment status. False deactivates the employee record without deleting it.',
  })
  @IsOptional()
  @IsBoolean()
  status?: boolean;
}
