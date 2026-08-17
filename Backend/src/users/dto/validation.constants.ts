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

/**
 * Employee code — any short alphanumeric identifier.
 *
 * Must start with a letter or digit, then letters, digits or hyphens, up to the
 * 20-character column limit. This is intentionally permissive: a code may be
 * auto-generated (TC-EMP-001) or typed by HR in whatever scheme the company
 * uses. Uniqueness — not format — is what actually matters, and that is checked
 * in the service.
 */
export const EMPLOYEE_CODE_REGEX = /^[A-Za-z0-9][A-Za-z0-9-]{0,19}$/;
export const EMPLOYEE_CODE_MESSAGE =
  'must be 1-20 characters: letters, digits and hyphens, starting with a letter or digit';

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
 * Employee fields whose required/optional state HR can toggle in
 * Settings → Employee Fields.
 *
 * The single source of truth shared by the backend enforcement
 * (`UserService`) and the settings module. Deliberately limited to columns that
 * are NULLABLE in the database: making one "optional" must never require a
 * schema change, and must never risk a NOT NULL insert failure. Structural
 * fields (name, email, department, designation, role) and the NOT NULL /
 * payroll-critical fields (`employee_type`, `job_category_id`, `shift_id`,
 * `salary`) are intentionally NOT configurable — they are always required.
 */
export const EMPLOYEE_CONFIGURABLE_FIELDS = [
  'phone',
  'date_of_birth',
  'gender',
  'blood_group',
  'address',
  'emergency_contact_name',
  'emergency_contact_relationship',
  'emergency_contact_phone',
  'bank_name',
  'bank_account_number',
  'bank_routing_code',
] as const;

export type EmployeeConfigurableField =
  (typeof EMPLOYEE_CONFIGURABLE_FIELDS)[number];

/** O(1) membership test for validating an incoming config's keys. */
export const EMPLOYEE_CONFIGURABLE_FIELD_SET: ReadonlySet<string> = new Set(
  EMPLOYEE_CONFIGURABLE_FIELDS,
);

/**
 * Default requiredness — mirrors the hard-coded behaviour these fields had
 * before the settings existed, so seeding this row changes nothing until an
 * admin edits it (phone / date of birth / gender were required; the rest were
 * optional).
 */
export const DEFAULT_EMPLOYEE_FIELD_CONFIG: Record<
  EmployeeConfigurableField,
  boolean
> = {
  phone: true,
  date_of_birth: true,
  gender: true,
  blood_group: false,
  address: false,
  emergency_contact_name: false,
  emergency_contact_relationship: false,
  emergency_contact_phone: false,
  bank_name: false,
  bank_account_number: false,
  bank_routing_code: false,
};

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
 * Coerces an optional date field, collapsing blanks to `undefined`.
 *
 * Replaces `@Type(() => Date)` on a nullable date. The problem it solves: an
 * untouched date input submits `""`, which `@Type(() => Date)` turns into an
 * Invalid Date rather than dropping — so `@IsOptional()` sees a value present
 * and `@IsDate()` then fails a field the user deliberately left blank. Here a
 * blank becomes `undefined` (skipped), a parseable value becomes a `Date`
 * (validated), and anything else is passed through untouched so `@IsDate()`
 * rejects it with the intended message.
 */
export const TransformOptionalDate = () =>
  Transform(({ value }: { value: unknown }) => {
    if (value === '' || value === null || value === undefined) return undefined;
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : date;
    }
    return value;
  });

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

