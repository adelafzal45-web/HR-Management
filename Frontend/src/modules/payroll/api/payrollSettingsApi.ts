// Payroll general settings (spec §1) — the single global row that frames every
// run: pay frequency, how working days are counted, the approval/lock switches,
// self-service, and rounding.
//
// Same contract as mailApi.ts: talks to the real backend or throws. No demo
// fallback — the route exists, so a failure is a real failure the screen must
// surface, not something to paper over with invented values. Bodies are
// snake_case to match PatchPayrollSettingsDto (the global ValidationPipe runs
// with whitelist:true, so a camelCase key is silently dropped).

import { api, ENDPOINTS } from "@/lib/apiClient";

export const PAYROLL_FREQUENCIES = ["monthly", "weekly", "biweekly"] as const;
export type PayrollFrequency = (typeof PAYROLL_FREQUENCIES)[number];

export const PERIOD_TYPES = ["calendar", "custom"] as const;
export type PeriodType = (typeof PERIOD_TYPES)[number];

export const WORKING_DAYS_SOURCES = [
  "calendar",
  "fixed",
  "attendance",
] as const;
export type WorkingDaysSource = (typeof WORKING_DAYS_SOURCES)[number];

export const ROUNDING_MODES = ["none", "nearest", "up", "down"] as const;
export type RoundingMode = (typeof ROUNDING_MODES)[number];

/** Mirrors PayrollSettings (Backend/src/payroll-settings/payroll-settings.entity.ts). */
export type PayrollSettings = {
  id: number;
  frequency: PayrollFrequency;
  period_type: PeriodType;
  currency: string;
  working_days_source: WorkingDaysSource;
  fixed_working_days: number;
  working_hours_per_day: number;
  approval_enabled: boolean;
  auto_generate_payslip: boolean;
  employee_self_service: boolean;
  payroll_locking_enabled: boolean;
  payslip_close_day: number;
  overtime_enabled: boolean;
  rounding: RoundingMode;
  created_at: string;
  updated_at: string;
};

/** Every field is optional — PATCH updates only what it is given. */
export type PayrollSettingsPayload = Partial<
  Omit<PayrollSettings, "id" | "created_at" | "updated_at">
>;

export const payrollSettingsApi = {
  get: (): Promise<PayrollSettings> =>
    api.get<PayrollSettings>(ENDPOINTS.payrollEngine.settings),

  update: (payload: PayrollSettingsPayload): Promise<PayrollSettings> =>
    api.patch<PayrollSettings>(ENDPOINTS.payrollEngine.settings, payload),
};
