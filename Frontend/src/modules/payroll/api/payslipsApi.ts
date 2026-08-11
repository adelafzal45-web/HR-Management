// Payslips (spec §14) — the org-wide read side for HR/Admin, the JWT-scoped
// self-service side for employees, and the "Preview with Why?" dry-run that
// computes a payslip without persisting it.
//
// Real backend or throw — no demo fallback (see payrollSettingsApi.ts). The
// preview/computed-line types below are shared: payrollPeriodsApi re-exports
// them for the process/run summary, and the Process screen renders them.

import { api, ENDPOINTS } from "@/lib/apiClient";

export const PAYSLIP_STATUSES = [
  "draft",
  "generated",
  "approved",
  "locked",
  "paid",
] as const;
export type PayslipStatus = (typeof PAYSLIP_STATUSES)[number];

export type LineType = "earning" | "deduction";

/** One computed line, each carrying the per-line "Why?" note (calc_note). */
export type ComputedLine = {
  component_id: string | null;
  code: string | null;
  label: string;
  type: LineType;
  calculation_type: string;
  amount: number;
  calc_note: string;
  display_order: number;
};

/** The period's measured attendance/leave/overtime figures fed to the engine. */
export type ComputeInputs = {
  working_days: number;
  present_days: number;
  absent_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  late_count: number;
  late_minutes: number;
  overtime_hours: number;
  overtime_amount: number;
};

/**
 * The full breakdown the engine returns for one employee/period — headline
 * totals, every line with its note, the inputs, and any non-fatal warnings.
 * Mirrors PayslipPreview (Backend/src/payroll-engine/payroll-calculation.service.ts).
 */
export type PayslipPreview = {
  user_id: string;
  employee_name: string;
  employee_code: string;
  period_id: string;
  period_name: string;
  period_start: string;
  period_end: string;
  currency: string;
  structure_id: string | null;
  structure_name: string | null;
  basic_salary: number;
  gross_salary: number;
  total_earnings: number;
  total_deductions: number;
  net_salary: number;
  lines: ComputedLine[];
  inputs: ComputeInputs;
  warnings: string[];
};

/** A persisted payslip row. `calculation_json` is the frozen breakdown snapshot. */
export type Payslip = {
  payslip_id: string;
  period_id: string;
  user_id: string;
  structure_id: string | null;
  basic_salary: number;
  gross_salary: number;
  total_earnings: number;
  total_deductions: number;
  net_salary: number;
  working_days: number;
  present_days: number;
  absent_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  late_count: number;
  overtime_hours: number;
  overtime_amount: number;
  status: PayslipStatus;
  calculation_json: PayslipPreview | null;
  payment_date: string | null;
  created_at: string;
  updated_at: string;
  user?: unknown;
  period?: unknown;
  lines?: ComputedLine[];
};

export type PreviewPayload = { user_id: string; period_id: string };

export type PayslipListParams = { periodId?: string; userId?: string };

// ---- Payroll register report (spec §14) -----------------------------------

/** One employee's row in the period register. */
export type PayrollReportRow = {
  payslip_id: string;
  user_id: string;
  employee_name: string;
  basic_salary: number;
  gross_salary: number;
  total_earnings: number;
  total_deductions: number;
  net_salary: number;
  tax: number;
  loan: number;
};

/** A component/synthetic line rolled up across the whole period. */
export type PayrollReportLineTotal = {
  label: string;
  type: string;
  total: number;
  count: number;
};

/** The period payroll register + roll-ups. Read-only — never recalculates. */
export type PayrollReport = {
  period: { period_id: string; name: string; status: string } | null;
  employee_count: number;
  totals: {
    basic: number;
    gross: number;
    earnings: number;
    deductions: number;
    net: number;
    tax: number;
    loan: number;
  };
  rows: PayrollReportRow[];
  line_totals: PayrollReportLineTotal[];
};

const { payslips } = ENDPOINTS.payrollEngine;

export const payslipsApi = {
  /** Org-wide list, optionally filtered by period and/or employee (payslips.view). */
  list: (params: PayslipListParams = {}): Promise<Payslip[]> => {
    const query = new URLSearchParams();
    if (params.periodId) query.set("periodId", params.periodId);
    if (params.userId) query.set("userId", params.userId);
    const qs = query.toString();
    return api.get<Payslip[]>(`${payslips.base}${qs ? `?${qs}` : ""}`);
  },

  getById: (id: string): Promise<Payslip> =>
    api.get<Payslip>(payslips.byId(id)),

  /** Compute (without persisting) a payslip for one employee/period. */
  preview: (payload: PreviewPayload): Promise<PayslipPreview> =>
    api.post<PayslipPreview>(payslips.preview, payload),

  /** The signed-in employee's own payslips (self-service, JWT-scoped). */
  listMine: (periodId?: string): Promise<Payslip[]> => {
    const query = periodId ? `?periodId=${encodeURIComponent(periodId)}` : "";
    return api.get<Payslip[]>(`${payslips.me}${query}`);
  },

  getMineById: (id: string): Promise<Payslip> =>
    api.get<Payslip>(payslips.meById(id)),

  /** The period payroll register — per-employee rows + company-wide roll-ups. */
  report: (periodId: string): Promise<PayrollReport> =>
    api.get<PayrollReport>(
      `${payslips.report}?periodId=${encodeURIComponent(periodId)}`,
    ),
};
