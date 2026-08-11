// Payroll periods (spec §1) and the run workflow: process (generate payslips) →
// approve (Administrator only) → lock. A period is the unit HR processes; its
// status is a small state machine (draft → processing → pending_approval →
// approved → locked → paid).
//
// Real backend or throw — no demo fallback (see payrollSettingsApi.ts). Bodies
// are snake_case to match CreatePayrollPeriodDto. `process`/`approve`/`lock`
// take the actor from the JWT, so the client sends no body.

import { api, ENDPOINTS } from "@/lib/apiClient";
import type { PayrollFrequency } from "./payrollSettingsApi";

export const PERIOD_STATUSES = [
  "draft",
  "processing",
  "pending_approval",
  "approved",
  "locked",
  "paid",
] as const;
export type PeriodStatus = (typeof PERIOD_STATUSES)[number];

/** A user reference as the period joins it (prepared_by / approved_by). */
export type PeriodActor = {
  user_id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

/** Mirrors PayrollPeriod (Backend/src/payroll-periods/payroll-periods.entity.ts). */
export type PayrollPeriod = {
  period_id: string;
  name: string;
  frequency: PayrollFrequency;
  period_start: string;
  period_end: string;
  pay_date: string | null;
  working_days: number;
  status: PeriodStatus;
  prepared_by: string | null;
  preparedBy?: PeriodActor | null;
  approved_by: string | null;
  approvedBy?: PeriodActor | null;
  processed_at: string | null;
  approved_at: string | null;
  locked_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PayrollPeriodPayload = {
  name: string;
  frequency?: PayrollFrequency;
  period_start: string;
  period_end: string;
  pay_date?: string;
  working_days?: number;
  notes?: string;
};

/** Summary the process run returns: how many payslips were made vs skipped. */
export type PeriodRunResult = {
  period_id: string;
  generated: number;
  skipped: number;
  warnings: string[];
};

export type ProcessResult = { period: PayrollPeriod; run: PeriodRunResult };

/** One line of the "Activate Payroll" checklist (spec §1 setup gate). */
export type SetupCheck = {
  key: string;
  label: string;
  passed: boolean;
  required: boolean;
  detail: string;
};

/** Overall setup readiness — `ready` is true only when every required check passes. */
export type SetupStatus = {
  ready: boolean;
  checks: SetupCheck[];
};

const { periods } = ENDPOINTS.payrollEngine;

export const payrollPeriodsApi = {
  list: (): Promise<PayrollPeriod[]> =>
    api.get<PayrollPeriod[]>(periods.base),

  getById: (id: string): Promise<PayrollPeriod> =>
    api.get<PayrollPeriod>(periods.byId(id)),

  create: (payload: PayrollPeriodPayload): Promise<PayrollPeriod> =>
    api.post<PayrollPeriod>(periods.base, payload),

  update: (
    id: string,
    payload: Partial<PayrollPeriodPayload>,
  ): Promise<PayrollPeriod> =>
    api.patch<PayrollPeriod>(periods.byId(id), payload),

  remove: (id: string): Promise<{ message: string }> =>
    api.delete<{ message: string }>(periods.byId(id)),

  /** Generate payslips for every active employee in the period. */
  process: (id: string): Promise<ProcessResult> =>
    api.post<ProcessResult>(periods.process(id)),

  /** Approve a processed run (Administrator only, requires approval enabled). */
  approve: (id: string): Promise<PayrollPeriod> =>
    api.post<PayrollPeriod>(periods.approve(id)),

  /** Lock an approved period and freeze its payslips. */
  lock: (id: string): Promise<PayrollPeriod> =>
    api.post<PayrollPeriod>(periods.lock(id)),

  /** The "Activate Payroll" readiness checklist processing is hard-gated on. */
  setupStatus: (): Promise<SetupStatus> =>
    api.get<SetupStatus>(periods.setupStatus),
};
