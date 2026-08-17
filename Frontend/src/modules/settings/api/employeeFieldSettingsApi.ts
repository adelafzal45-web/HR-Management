// ============================================================================
// Employee Field Settings — the single-row config behind Settings → Employee
// Fields, deciding which employee fields are Required vs Optional.
//
// Real backend only (no demo fallback): the route exists, and a form that
// pretended a field was optional when the server requires it would just produce
// a confusing round-trip 400. The tolerant `getEffectiveOrDefaults()` helper is
// for the *consumers* (the employee form, the profile edit) — a config it can't
// load must not stop someone editing an employee, so it degrades to the
// built-in defaults rather than throwing.
//
// The constants below MIRROR Backend/src/users/dto/validation.constants.ts:
// EMPLOYEE_CONFIGURABLE_FIELDS and DEFAULT_EMPLOYEE_FIELD_CONFIG must stay in
// lock-step with the backend, exactly as employeeValidation.ts mirrors the
// regexes. The server remains the authority; this is UX.
// ============================================================================

import { api, ENDPOINTS } from "@/lib/apiClient";

/**
 * Employee fields whose required/optional state HR can toggle.
 *
 * Deliberately limited to columns that are nullable in the database — see the
 * backend constant of the same name. Structural fields (name, email,
 * department, designation, role) and the NOT NULL / payroll-critical fields
 * (employee_type, job_category_id, shift_id, salary) are always required and
 * never appear here.
 */
export const EMPLOYEE_CONFIGURABLE_FIELDS = [
  "phone",
  "date_of_birth",
  "gender",
  "blood_group",
  "address",
  "emergency_contact_name",
  "emergency_contact_relationship",
  "emergency_contact_phone",
  "bank_name",
  "bank_account_number",
  "bank_routing_code",
] as const;

export type EmployeeFieldKey = (typeof EMPLOYEE_CONFIGURABLE_FIELDS)[number];

/** fieldKey -> required? (true = required). Always total over the field set. */
export type EmployeeFieldConfig = Record<EmployeeFieldKey, boolean>;

/**
 * Default requiredness — mirrors the behaviour these fields had before the
 * setting existed (phone / date of birth / gender required, the rest optional).
 * Used as the fallback when the config can't be fetched.
 */
export const DEFAULT_EMPLOYEE_FIELD_CONFIG: EmployeeFieldConfig = {
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
 * Presentation metadata for the toggle screen: a human label and the section
 * each field belongs to. Order within a group follows the employee form.
 */
export const EMPLOYEE_FIELD_META: Record<
  EmployeeFieldKey,
  { label: string; group: string }
> = {
  phone: { label: "Phone", group: "Personal" },
  date_of_birth: { label: "Date of birth", group: "Personal" },
  gender: { label: "Gender", group: "Personal" },
  blood_group: { label: "Blood group", group: "Personal" },
  address: { label: "Address", group: "Personal" },
  emergency_contact_name: {
    label: "Contact name",
    group: "Emergency contact",
  },
  emergency_contact_relationship: {
    label: "Relationship",
    group: "Emergency contact",
  },
  emergency_contact_phone: {
    label: "Contact phone",
    group: "Emergency contact",
  },
  bank_name: { label: "Bank name", group: "Payroll & bank" },
  bank_account_number: { label: "Account number", group: "Payroll & bank" },
  bank_routing_code: { label: "IBAN / routing code", group: "Payroll & bank" },
};

/** The GET/PATCH payload — the effective config plus when it last changed. */
export type EmployeeFieldSettingsView = {
  field_config: EmployeeFieldConfig;
  updated_at: string;
};

/** Layers stored overrides over the defaults, narrowing to the known set. */
function toEffective(
  stored: Partial<Record<string, boolean>> | null | undefined,
): EmployeeFieldConfig {
  const effective = { ...DEFAULT_EMPLOYEE_FIELD_CONFIG };
  if (stored) {
    for (const field of EMPLOYEE_CONFIGURABLE_FIELDS) {
      const value = stored[field];
      if (typeof value === "boolean") effective[field] = value;
    }
  }
  return effective;
}

export const employeeFieldSettingsApi = {
  /** GET /employee-field-settings — the effective requiredness map. */
  get: () =>
    api
      .get<EmployeeFieldSettingsView>(ENDPOINTS.employeeFieldSettings.base)
      .then((res) => ({
        field_config: toEffective(res.field_config),
        updated_at: res.updated_at,
      })),

  /**
   * PATCH /employee-field-settings — partial merge. Send only the toggles being
   * changed; the backend keeps the rest.
   */
  update: (fieldConfig: Partial<EmployeeFieldConfig>) =>
    api
      .patch<EmployeeFieldSettingsView>(ENDPOINTS.employeeFieldSettings.base, {
        field_config: fieldConfig,
      })
      .then((res) => ({
        field_config: toEffective(res.field_config),
        updated_at: res.updated_at,
      })),

  /**
   * Tolerant read for form consumers: the effective config, or the built-in
   * defaults if the request fails. A config the form can't load must never be
   * the thing that blocks editing an employee.
   */
  getEffectiveOrDefaults: async (): Promise<EmployeeFieldConfig> => {
    try {
      const res = await api.get<EmployeeFieldSettingsView>(
        ENDPOINTS.employeeFieldSettings.base,
      );
      return toEffective(res.field_config);
    } catch {
      return { ...DEFAULT_EMPLOYEE_FIELD_CONFIG };
    }
  },
};
