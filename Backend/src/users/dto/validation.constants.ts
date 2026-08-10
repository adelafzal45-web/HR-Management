import { Transform } from 'class-transformer';
import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

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

/**
 * IBAN, or an IFSC / routing / SWIFT style code.
 *
 * 34 is the ISO 13616 maximum IBAN length (Pakistan's is 24), so the upper bound
 * has to clear it — a 20-char cap rejected every real IBAN. The lower bound stays
 * at 6 so the shorter SWIFT/IFSC codes already stored remain valid. The format
 * itself isn't checked beyond "alphanumeric": country-specific IBAN lengths and
 * the mod-97 checksum are more than this field needs, and getting them subtly
 * wrong would block valid input.
 */
export const ROUTING_CODE_REGEX = /^[A-Za-z0-9]{6,34}$/;
export const ROUTING_CODE_MESSAGE = 'must be 6-34 alphanumeric characters';

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

/** The structured address parts, in the order the form presents them. */
export const ADDRESS_FIELDS = [
  'street_address',
  'city',
  'state_province',
  'postal_code',
  'country',
] as const;

export const ADDRESS_REQUIRED_MESSAGE =
  'Enter at least one address field (street, city, state / province, postal code or country)';

/** True when a record carries a non-blank value in any address column. */
export function hasAnyAddressField(
  record: Partial<Record<(typeof ADDRESS_FIELDS)[number], unknown>>,
): boolean {
  return ADDRESS_FIELDS.some((field) => {
    const value = record[field];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

/**
 * "At least one address field must be filled in."
 *
 * Every part is individually optional — plenty of real addresses have no
 * postal code, and an employee record should not be blocked on one — but an
 * employee with no address at all is a record nobody can post a letter to, so
 * the group as a whole is required.
 *
 * Declared on a synthetic property rather than on `street_address`, because
 * `@IsOptional()` suppresses *every* validator on the property it decorates:
 * hung on a real address field the check would be skipped in exactly the case
 * it exists to catch — all five left empty. The validator reads the address
 * fields off the object under validation, so the property it is attached to
 * carries no value of its own and setting one cannot satisfy the rule.
 *
 * This covers creates only. `UpdateUserDto` derives from this class through
 * `PartialType`, which marks each inherited property optional and so disables
 * this rule too — deliberately, since a PATCH body carrying no address is an
 * edit to something else, not an attempt to erase one. The equivalent check for
 * edits is made against the *merged* record in `UserService.update`, which is
 * the only place the stored values and the incoming ones are both visible.
 */
export function RequiresAnyAddressField(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'requiresAnyAddressField',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(_value: unknown, args: ValidationArguments) {
          return hasAnyAddressField(args.object as Record<string, unknown>);
        },
        defaultMessage() {
          return ADDRESS_REQUIRED_MESSAGE;
        },
      },
    });
  };
}
