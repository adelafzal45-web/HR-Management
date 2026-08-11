// Salary components (spec §2) — the atom of the payroll engine. HR defines what
// an earning/deduction is and how its amount is derived (fixed, percent of
// basic/gross, per day/hour, or a formula over approved variables), plus the
// "Test Rule" dry-run that evaluates a formula against sample values.
//
// Real backend or throw — no demo fallback (see payrollSettingsApi.ts). Bodies
// are snake_case to match CreateSalaryComponentDto / TestFormulaDto.

import { api, ENDPOINTS } from "@/lib/apiClient";

export const COMPONENT_TYPES = ["earning", "deduction"] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

export const CALCULATION_TYPES = [
  "fixed",
  "percent_basic",
  "percent_gross",
  "per_day",
  "per_hour",
  "formula",
] as const;
export type CalculationType = (typeof CALCULATION_TYPES)[number];

/** Mirrors SalaryComponent (Backend/src/salary-components/salary-components.entity.ts). */
export type SalaryComponent = {
  component_id: string;
  name: string;
  code: string;
  type: ComponentType;
  calculation_type: CalculationType;
  amount: number;
  formula: string | null;
  is_recurring: boolean;
  is_taxable: boolean;
  include_in_gross: boolean;
  include_in_overtime: boolean;
  include_in_leave_deduction: boolean;
  include_in_bonus: boolean;
  display_order: number;
  is_active: boolean;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
};

export type SalaryComponentPayload = {
  name: string;
  code: string;
  type: ComponentType;
  calculation_type: CalculationType;
  amount?: number;
  formula?: string | null;
  is_recurring?: boolean;
  is_taxable?: boolean;
  include_in_gross?: boolean;
  include_in_overtime?: boolean;
  include_in_leave_deduction?: boolean;
  include_in_bonus?: boolean;
  display_order?: number;
  is_active?: boolean;
  effective_from?: string | null;
  effective_to?: string | null;
};

/** One entry of the approved-variable whitelist the formula builder may use. */
export type FormulaVariable = { name: string; description: string };

/**
 * Result of the "Test Rule" dry-run. `ok` false carries a readable `error`
 * (unknown variable, bad syntax, divide-by-zero) and a null `result`; the
 * `scope` echoes the sample values the formula was evaluated against.
 */
export type FormulaTestResult = {
  ok: boolean;
  result: number | null;
  error: string | null;
  scope: Record<string, number>;
};

export type TestFormulaPayload = {
  formula: string;
  sample?: Record<string, number>;
};

const { components } = ENDPOINTS.payrollEngine;

export const salaryComponentsApi = {
  list: (): Promise<SalaryComponent[]> =>
    api.get<SalaryComponent[]>(components.base),

  getById: (id: string): Promise<SalaryComponent> =>
    api.get<SalaryComponent>(components.byId(id)),

  create: (payload: SalaryComponentPayload): Promise<SalaryComponent> =>
    api.post<SalaryComponent>(components.base, payload),

  update: (
    id: string,
    payload: Partial<SalaryComponentPayload>,
  ): Promise<SalaryComponent> =>
    api.patch<SalaryComponent>(components.byId(id), payload),

  remove: (id: string): Promise<{ message: string }> =>
    api.delete<{ message: string }>(components.byId(id)),

  /** The whitelisted variables a formula may reference. */
  variables: (): Promise<FormulaVariable[]> =>
    api.get<FormulaVariable[]>(components.variables),

  /** Evaluate a formula against sample values without saving anything. */
  testFormula: (payload: TestFormulaPayload): Promise<FormulaTestResult> =>
    api.post<FormulaTestResult>(components.testFormula, payload),
};
