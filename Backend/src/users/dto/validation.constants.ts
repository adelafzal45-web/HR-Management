import { Transform } from 'class-transformer';

/**
 * Shared validation vocabulary for the employee DTOs.
 *
 * Centralised so the same rule can't drift between create, update, and
 * self-service profile edits — three DTOs enforcing three slightly different
 * ideas of a "valid phone number" is how bad data gets in.
 */

/**
 * Person and place names: letters (including accented), spaces, hyphens,
 * apostrophes, periods. Deliberately rejects digits and symbols — those are
 * the "invalid characters" the spec calls out, and they're almost always a
 * paste error or an injection attempt rather than a real name.
 *
 * Unicode-aware so "Zoë", "O'Brien" and "Jean-Luc" all pass.
 */
export const NAME_REGEX = /^[\p{L}][\p{L}\s'.-]*$/u;
export const NAME_MESSAGE =
  'may only contain letters, spaces, hyphens, apostrophes and periods';

/**
 * Phone: optional leading +, then 7-20 digits with optional spaces, hyphens,
 * periods, or parentheses as separators.
 *
 * Deliberately permissive about formatting and strict about digit count —
 * validating national formats server-side would reject legitimate
 * international numbers, while a bare length check would accept "abc".
 */
export const PHONE_REGEX = /^\+?[\d][\d\s().-]{5,25}$/;
export const PHONE_MESSAGE =
  'must be a valid phone number (7-20 digits, optional leading +)';

/**
 * Strong password: at least one lowercase, one uppercase, one digit, one
 * special character, minimum 8 characters.
 */
export const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
export const PASSWORD_MESSAGE =
  'must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character';

/** Postal codes vary wildly by country — allow alphanumeric plus space/hyphen. */
export const POSTAL_CODE_REGEX = /^[A-Za-z0-9][A-Za-z0-9\s-]{1,18}$/;
export const POSTAL_CODE_MESSAGE =
  'must be 2-20 alphanumeric characters (spaces and hyphens allowed)';

/** Auto-generated format, e.g. TC-EMP-001. Validated when supplied explicitly. */
export const EMPLOYEE_CODE_REGEX = /^TC-EMP-\d{3,}$/;
export const EMPLOYEE_CODE_MESSAGE =
  'must follow the format TC-EMP-001 (prefix TC-EMP- followed by at least 3 digits)';

/** Bank account numbers: digits and hyphens only, 6-34 chars (IBAN-length). */
export const ACCOUNT_NUMBER_REGEX = /^[A-Za-z0-9-]{6,34}$/;
export const ACCOUNT_NUMBER_MESSAGE =
  'must be 6-34 alphanumeric characters (hyphens allowed)';

/** IFSC / routing / SWIFT style codes. */
export const ROUTING_CODE_REGEX = /^[A-Za-z0-9]{6,20}$/;
export const ROUTING_CODE_MESSAGE = 'must be 6-20 alphanumeric characters';

export const GENDERS = ['Male', 'Female', 'Other'] as const;

export const EMPLOYMENT_TYPES = [
  'Full-Time',
  'Part-Time',
  'Contract',
  'Intern',
  'Probation',
] as const;

export const BLOOD_GROUPS = [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
] as const;

/**
 * Trims surrounding whitespace and collapses empty strings to undefined.
 *
 * The collapse matters for optional fields: without it, an untouched form input
 * submits `""`, which passes `@IsOptional()` (the value is present) and then
 * fails the format regex — so the user gets "phone must be a valid phone
 * number" for a field they deliberately left blank.
 */
export const TrimOptional = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  });

/** Trims without collapsing — for required fields, so "   " fails @IsNotEmpty. */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

/**
 * Lowercases and trims an email.
 *
 * Stored normalised so the duplicate check is meaningful:
 * "Ali@Example.com" and "ali@example.com" are the same mailbox, and without
 * this both could be inserted past a case-sensitive unique index.
 */
export const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
