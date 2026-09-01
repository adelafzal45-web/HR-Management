// Salary revisions (increment/decrement with history) — the audited base-pay
// adjustment behind the employee drawer's "Adjust Salary" action.
//
// Applying a revision updates `users.salary`, records an append-only history
// row (previous → new, signed delta, reason, author, effective date), and
// audits the change in one transaction. Reuses the employees.salary.view/edit
// permissions that already gate the salary field. Real backend or throw — no
// demo fallback (see payslipsApi.ts); bodies are snake_case to match
// CreateSalaryRevisionDto.

import { api, ENDPOINTS } from "@/lib/apiClient";

export const SALARY_CHANGE_TYPES = ["increment", "decrement"] as const;
export type SalaryChangeType = (typeof SALARY_CHANGE_TYPES)[number];

export const SALARY_INPUT_MODES = ["amount", "percent"] as const;
export type SalaryInputMode = (typeof SALARY_INPUT_MODES)[number];

/** One salary revision, with the author's display name. Mirrors SalaryRevisionView. */
export type SalaryRevision = {
  revision_id: string;
  user_id: string;
  previous_salary: number | null;
  new_salary: number;
  delta: number;
  change_type: SalaryChangeType;
  input_mode: SalaryInputMode;
  input_value: number;
  reason: string | null;
  effective_date: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
};

export type SalaryRevisionPayload = {
  user_id: string;
  change_type: SalaryChangeType;
  input_mode: SalaryInputMode;
  /** Positive magnitude — the direction comes from change_type. */
  input_value: number;
  reason?: string;
  /** YYYY-MM-DD; defaults to today, may be backdated but not future-dated. */
  effective_date?: string;
};

/**
 * The result of applying a revision. `warning` is set when an active
 * salary-structure assignment's base_salary would mask the change from actual
 * payroll — advisory only; the revision is still recorded.
 */
export type ApplyRevisionResult = {
  revision: SalaryRevision;
  warning: string | null;
};

const { salaryRevisions } = ENDPOINTS;

export const salaryRevisionsApi = {
  /** An employee's salary history, newest first. */
  list: (userId: string): Promise<SalaryRevision[]> =>
    api.get<SalaryRevision[]>(
      `${salaryRevisions.base}?userId=${encodeURIComponent(userId)}`,
    ),

  /** Apply an increment/decrement to the employee's base salary. */
  apply: (payload: SalaryRevisionPayload): Promise<ApplyRevisionResult> =>
    api.post<ApplyRevisionResult>(salaryRevisions.base, payload),
};
