import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsUUID,
  IsBoolean,
  IsNumber,
  IsDate,
  IsIn,
  IsArray,
  ValidateNested,
  Matches,
  MaxDate,
  Min,
  MaxLength,
  ArrayUnique,
} from 'class-validator';

import {
  NAME_REGEX,
  NAME_MESSAGE,
  PHONE_REGEX,
  PHONE_MESSAGE,
  PASSWORD_REGEX,
  PASSWORD_MESSAGE,
  POSTAL_CODE_REGEX,
  POSTAL_CODE_MESSAGE,
  EMPLOYEE_CODE_REGEX,
  EMPLOYEE_CODE_MESSAGE,
  ACCOUNT_NUMBER_REGEX,
  ACCOUNT_NUMBER_MESSAGE,
  ROUTING_CODE_REGEX,
  ROUTING_CODE_MESSAGE,
  GENDERS,
  EMPLOYMENT_TYPES,
  BLOOD_GROUPS,
  RequiresAnyAddressField,
  Trim,
  TrimOptional,
  NormalizeEmail,
} from './validation.constants';

/** One leave type granted to the employee, with its opening allocation. */
export class LeaveAssignmentDto {
  @ApiProperty({
    example: 'a3f1c2d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
    description: 'Leave type UUID from the leave_types catalog.',
  })
  @IsUUID('4', { message: 'leave_type_id must be a valid UUID' })
  leave_type_id!: string;

  @ApiPropertyOptional({
    example: 12,
    default: 0,
    description:
      'Days granted for the current cycle. Remaining days are derived as allocated - used.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'allocated_days must be a number' },
  )
  @Min(0, { message: 'allocated_days cannot be negative' })
  allocated_days?: number;

  @ApiPropertyOptional({
    example: 0,
    default: 0,
    description:
      'Days already consumed. Normally 0 at creation; settable so historical records can be migrated accurately.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'used_days must be a number' })
  @Min(0, { message: 'used_days cannot be negative' })
  used_days?: number;
}

/**
 * Payload for creating an employee.
 *
 * Two deliberate changes from the previous version of this DTO:
 *
 *   - `employee_code` is now OPTIONAL. The service generates the next
 *     TC-EMP-NNN inside a locked transaction; supplying one explicitly is
 *     still allowed (for data migration) and is uniqueness-checked.
 *   - The free-text `address` field is replaced by structured address parts.
 *     The legacy column still exists on the entity for backward compatibility,
 *     but new records write the structured fields.
 */
export class CreateUserDto {
  // ==========================================
  // PERSONAL INFORMATION
  // ==========================================

  @ApiPropertyOptional({
    example: 'TC-EMP-001',
    description:
      'Auto-generated when omitted. Supply only to preserve an existing code during migration.',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(20)
  @Matches(EMPLOYEE_CODE_REGEX, {
    message: `employee_code ${EMPLOYEE_CODE_MESSAGE}`,
  })
  employee_code?: string;

  @ApiProperty({ example: 'Ali' })
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  @MaxLength(100)
  @Matches(NAME_REGEX, { message: `First name ${NAME_MESSAGE}` })
  first_name!: string;

  @ApiProperty({ example: 'Khan' })
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  @MaxLength(100)
  @Matches(NAME_REGEX, { message: `Last name ${NAME_MESSAGE}` })
  last_name!: string;

  @ApiProperty({
    example: '2000-01-01',
    description: 'Date of birth. The UI defaults this to 01-01-2000.',
  })
  @Type(() => Date)
  @IsDate({ message: 'Date of birth must be a valid date' })
  // Guards against a typo putting a future birth date into payroll/appraisal
  // calculations. An exact minimum-age rule is policy, not validation, so it
  // is not enforced here.
  @MaxDate(() => new Date(), {
    message: 'Date of birth cannot be in the future',
  })
  date_of_birth!: Date;

  @ApiProperty({ example: 'Male', enum: GENDERS })
  @Trim()
  @IsIn(GENDERS, { message: `Gender must be one of: ${GENDERS.join(', ')}` })
  gender!: string;

  @ApiProperty({ example: 'ali.khan@technocues.com' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: '+92 300 1234567' })
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Phone number is required' })
  @MaxLength(20)
  @Matches(PHONE_REGEX, { message: `Phone ${PHONE_MESSAGE}` })
  phone!: string;

  @ApiProperty({
    example: 'Str0ng@Pass',
    description:
      'Hashed with bcrypt before storage and never returned by any endpoint.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MaxLength(128)
  @Matches(PASSWORD_REGEX, { message: `Password ${PASSWORD_MESSAGE}` })
  password!: string;

  @ApiPropertyOptional({
    example: '/uploads/employee-photos/abc123.webp',
    description:
      'Path returned by POST /users/:id/photo. Set directly only when migrating existing data.',
  })
  @IsOptional()
  @TrimOptional()
  @IsString()
  @MaxLength(500)
  profile_image?: string;

  @ApiPropertyOptional({ example: 'O+', enum: BLOOD_GROUPS })
  @IsOptional()
  @TrimOptional()
  @IsIn(BLOOD_GROUPS, {
    message: `Blood group must be one of: ${BLOOD_GROUPS.join(', ')}`,
  })
  blood_group?: string;

  // ==========================================
  // ADDRESS
  // ==========================================
  //
  // Every part is optional on its own; at least one must be filled in. Real
  // addresses skip parts all the time — plenty of places have no postal code —
  // and requiring all five blocked an employee record on a field nobody had.
  // The group rule below keeps "no address at all" from getting through.
  //
  // `TrimOptional` rather than `Trim`: an untouched input submits `""`, which
  // satisfies `@IsOptional()` (the value is present) and would then fail the
  // format regex, so the user is told their postal code is invalid for a field
  // they deliberately left blank.

  @ApiPropertyOptional({ example: 'House 12, Street 4, Gulberg III' })
  @TrimOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  street_address?: string;

  @ApiPropertyOptional({ example: 'Lahore' })
  @TrimOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(NAME_REGEX, { message: `City ${NAME_MESSAGE}` })
  city?: string;

  @ApiPropertyOptional({ example: 'Punjab' })
  @TrimOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(NAME_REGEX, { message: `State / province ${NAME_MESSAGE}` })
  state_province?: string;

  @ApiPropertyOptional({ example: '54000' })
  @TrimOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(POSTAL_CODE_REGEX, { message: `Postal code ${POSTAL_CODE_MESSAGE}` })
  postal_code?: string;

  @ApiPropertyOptional({ example: 'Pakistan' })
  @TrimOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(NAME_REGEX, { message: `Country ${NAME_MESSAGE}` })
  country?: string;

  /**
   * Carries the "at least one address field" rule. Not a real field — nothing
   * is ever read from or written to it.
   *
   * It exists because the rule has to be attached to a property that is *not*
   * `@IsOptional()`: that decorator suppresses every validator on its own
   * property, so hung on `street_address` the check would be skipped precisely
   * when all five are empty. See `RequiresAnyAddressField`.
   *
   * A client may set it — `whitelist: true` keeps any property carrying a
   * validator, so unlike a genuinely unknown key this one survives the pipe.
   * It stays out of the database because `UserService.mapScalars` copies an
   * explicit list of columns rather than spreading the DTO, and setting it
   * cannot satisfy the rule either: the validator reads the five address
   * fields, never its own value.
   */
  @RequiresAnyAddressField()
  address_group?: never;

  // ==========================================
  // EMPLOYMENT DETAILS
  // ==========================================

  @ApiProperty({
    example: '2026-08-01',
    description: 'Joining date. The UI defaults this to today.',
  })
  @Type(() => Date)
  @IsDate({ message: 'Joining date must be a valid date' })
  joining_date!: Date;

  @ApiProperty({ example: 'Full-Time', enum: EMPLOYMENT_TYPES })
  @Trim()
  @IsIn(EMPLOYMENT_TYPES, {
    message: `Employment type must be one of: ${EMPLOYMENT_TYPES.join(', ')}`,
  })
  employee_type!: string;

  @ApiProperty({ description: 'Department UUID' })
  @IsUUID('4', { message: 'Department is required' })
  department_id!: string;

  @ApiProperty({ description: 'Designation UUID' })
  @IsUUID('4', { message: 'Designation is required' })
  designation_id!: string;

  @ApiProperty({ description: 'Job category UUID' })
  @IsUUID('4', { message: 'Job category is required' })
  job_category_id!: string;

  @ApiProperty({ description: 'Shift UUID' })
  @IsUUID('4', { message: 'Shift is required' })
  shift_id!: string;

  @ApiPropertyOptional({
    description:
      'Team Lead UUID. Must be a user in the SAME department who holds the Team Lead role — validated server-side.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'team_lead_id must be a valid UUID' })
  team_lead_id?: string;

  // ==========================================
  // SYSTEM ACCESS
  // ==========================================

  @ApiProperty({
    description:
      'Role UUID. The caller may only assign roles they are permitted to assign.',
  })
  @IsUUID('4', { message: 'Role is required' })
  role_id!: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  status?: boolean;

  // ==========================================
  // LEAVE ASSIGNMENT
  // ==========================================

  @ApiPropertyOptional({
    type: [LeaveAssignmentDto],
    description:
      'Leave types granted to this employee, each with an opening allocation.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeaveAssignmentDto)
  @ArrayUnique((item: LeaveAssignmentDto) => item.leave_type_id, {
    message: 'The same leave type cannot be assigned twice',
  })
  leave_assignments?: LeaveAssignmentDto[];

  // ==========================================
  // PAYROLL
  // ==========================================

  @ApiProperty({ example: 85000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Salary must be a number' })
  @Min(0, { message: 'Salary cannot be negative' })
  salary!: number;

  @ApiPropertyOptional({ example: 'Meezan Bank' })
  @IsOptional()
  @TrimOptional()
  @IsString()
  @MaxLength(150)
  bank_name?: string;

  @ApiPropertyOptional({ example: '01234567890123' })
  @IsOptional()
  @TrimOptional()
  @IsString()
  @Matches(ACCOUNT_NUMBER_REGEX, {
    message: `Account number ${ACCOUNT_NUMBER_MESSAGE}`,
  })
  bank_account_number?: string;

  @ApiPropertyOptional({ example: 'MEZNPKKA' })
  @IsOptional()
  @TrimOptional()
  @IsString()
  @Matches(ROUTING_CODE_REGEX, {
    message: `IBAN number ${ROUTING_CODE_MESSAGE}`,
  })
  bank_routing_code?: string;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  is_overtime?: boolean;

  // ==========================================
  // EMERGENCY CONTACT
  // ==========================================

  @ApiPropertyOptional({ example: 'Sara Khan' })
  @IsOptional()
  @TrimOptional()
  @IsString()
  @MaxLength(150)
  @Matches(NAME_REGEX, { message: `Emergency contact name ${NAME_MESSAGE}` })
  emergency_contact_name?: string;

  @ApiPropertyOptional({ example: 'Spouse' })
  @IsOptional()
  @TrimOptional()
  @IsString()
  @MaxLength(60)
  @Matches(NAME_REGEX, {
    message: `Emergency contact relationship ${NAME_MESSAGE}`,
  })
  emergency_contact_relationship?: string;

  @ApiPropertyOptional({ example: '+92 300 7654321' })
  @IsOptional()
  @TrimOptional()
  @IsString()
  @MaxLength(20)
  @Matches(PHONE_REGEX, { message: `Emergency contact phone ${PHONE_MESSAGE}` })
  emergency_contact_phone?: string;
}
