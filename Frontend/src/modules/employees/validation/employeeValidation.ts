// ============================================================================
// Client-side field validation for the employee forms.
//
// Every rule here is a deliberate mirror of Backend/src/users/dto/
// validation.constants.ts. The regexes are copied verbatim rather than
// approximated: a looser client rule produces a confusing round-trip 400, and a
// stricter one blocks input the server would have accepted. When the backend
// constants change, these must change with them — that duplication is the price
// of instant feedback, and it is only safe because the server remains the
// authority (this is UX, not enforcement).
// ============================================================================

/** Letters (incl. accented), spaces, hyphens, apostrophes, periods. */
export const NAME_REGEX = /^[\p{L}][\p{L}\s'.-]*$/u;
export const PHONE_REGEX = /^\+?[\d][\d\s().-]{5,25}$/;
export const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
export const POSTAL_CODE_REGEX = /^[A-Za-z0-9][A-Za-z0-9\s-]{1,18}$/;
export const EMPLOYEE_CODE_REGEX = /^TC-EMP-\d{3,}$/;
export const ACCOUNT_NUMBER_REGEX = /^[A-Za-z0-9-]{6,34}$/;
export const ROUTING_CODE_REGEX = /^[A-Za-z0-9]{6,20}$/;

/**
 * Email shape.
 *
 * class-validator's @IsEmail is considerably more thorough than any short
 * regex, so this is intentionally a coarse pre-check: it catches the obvious
 * typo ("ali@", "ali.example.com") without claiming to be the final word. The
 * server still has the last say, including the duplicate check, which no client
 * rule can perform.
 */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const PASSWORD_MESSAGE =
  "Must be at least 8 characters with an uppercase letter, a lowercase letter, a number and a special character.";

/** Field-level result: an error string, or undefined when valid. */
export type FieldError = string | undefined;
export type Errors<T> = Partial<Record<keyof T, string>>;

const isBlank = (value: unknown): boolean =>
  value === undefined || value === null || String(value).trim() === "";

export const required = (value: unknown, label: string): FieldError =>
  isBlank(value) ? `${label} is required.` : undefined;

/**
 * Validates a name-like field.
 *
 * Digits and symbols are rejected because they are almost always a paste error;
 * the message names the allowed characters rather than saying "invalid" so the
 * user can tell what to fix.
 */
export const validateName = (value: string, label: string): FieldError => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return `${label} is required.`;
  if (trimmed.length > 100) return `${label} must be 100 characters or fewer.`;
  if (!NAME_REGEX.test(trimmed))
    return `${label} may only contain letters, spaces, hyphens, apostrophes and periods.`;
  return undefined;
};

export const validateEmail = (value: string): FieldError => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "Email is required.";
  if (!EMAIL_REGEX.test(trimmed)) return "Enter a valid email address.";
  return undefined;
};

export const validatePhone = (value: string, label = "Phone"): FieldError => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return `${label} is required.`;
  if (!PHONE_REGEX.test(trimmed))
    return `${label} must be 7–20 digits, optionally starting with +.`;
  return undefined;
};

export const validateOptionalPhone = (value: string, label = "Phone"): FieldError => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return undefined;
  return PHONE_REGEX.test(trimmed)
    ? undefined
    : `${label} must be 7–20 digits, optionally starting with +.`;
};

export const validatePassword = (value: string): FieldError => {
  if (!value) return "Password is required.";
  if (!PASSWORD_REGEX.test(value)) return PASSWORD_MESSAGE;
  return undefined;
};

export const validatePostalCode = (value: string): FieldError => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "Postal code is required.";
  if (!POSTAL_CODE_REGEX.test(trimmed))
    return "Postal code must be 2–20 letters or digits (spaces and hyphens allowed).";
  return undefined;
};

export const validateEmployeeCode = (value: string): FieldError => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return undefined; // Generated server-side when absent.
  if (!EMPLOYEE_CODE_REGEX.test(trimmed))
    return "Employee code must look like TC-EMP-001.";
  return undefined;
};

export const validateAccountNumber = (value: string): FieldError => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return undefined;
  return ACCOUNT_NUMBER_REGEX.test(trimmed)
    ? undefined
    : "Account number must be 6–34 letters or digits (hyphens allowed).";
};

export const validateRoutingCode = (value: string): FieldError => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return undefined;
  return ROUTING_CODE_REGEX.test(trimmed)
    ? undefined
    : "Routing / IFSC code must be 6–20 letters or digits.";
};

/**
 * Salary must be a non-negative number.
 *
 * Guards against the empty-string-to-zero coercion that `Number("")` performs:
 * an untouched required field must read as missing, not as a salary of 0.
 */
export const validateSalary = (value: number | string | undefined): FieldError => {
  if (isBlank(value)) return "Salary is required.";
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return "Salary must be a number.";
  if (parsed < 0) return "Salary cannot be negative.";
  if (parsed > 99_999_999.99) return "Salary is unrealistically large.";
  return undefined;
};

/** A date input's value, rejecting anything the browser could not parse. */
export const validateDate = (value: string, label: string): FieldError => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return `${label} is required.`;
  if (Number.isNaN(new Date(trimmed).getTime())) return `${label} is not a valid date.`;
  return undefined;
};

/**
 * Date of birth: valid, in the past, and old enough to be employable.
 *
 * The 14-year floor is a sanity check on typos (a 2024 birth year), not a
 * legal-minimum-age claim — hence the deliberately generous bound.
 */
export const validateDateOfBirth = (value: string): FieldError => {
  const base = validateDate(value, "Date of birth");
  if (base) return base;

  const dob = new Date(value);
  const now = new Date();
  if (dob > now) return "Date of birth cannot be in the future.";

  const age = (now.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (age < 14) return "Date of birth implies an age under 14 — please check it.";
  if (age > 100) return "Date of birth implies an age over 100 — please check it.";
  return undefined;
};

/** Leave allocation: non-negative, and used days cannot exceed allocated. */
export const validateAllocation = (
  allocated: number | string,
  used: number | string,
): FieldError => {
  const a = Number(allocated ?? 0);
  const u = Number(used ?? 0);
  if (Number.isNaN(a) || a < 0) return "Allocated days must be 0 or more.";
  if (Number.isNaN(u) || u < 0) return "Used days must be 0 or more.";
  if (u > a) return "Used days cannot exceed the allocation.";
  return undefined;
};

/** Drops undefined entries so `Object.keys(errors).length` means "is invalid". */
export function compact<T>(errors: Record<string, FieldError>): Errors<T> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(errors)) {
    if (value) out[key] = value;
  }
  return out as Errors<T>;
}
