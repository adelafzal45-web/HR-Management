// Employee loans / salary advances (spec §9). A loan is repaid by fixed
// installments deducted from payroll; `outstanding` is the running balance a
// payroll run decrements (idempotently, keyed on the period) as installments
// are deducted, closing the loan when it hits zero.
//
// `schedule` (re)generates the installment ladder from principal / installment
// amount, preserving anything already deducted. Real backend or throw; bodies
// are snake_case to match CreateEmployeeLoanDto.

import { api, ENDPOINTS } from "@/lib/apiClient";

// An employee's own request lands as `pending` and deducts nothing — the engine
// only ever looks at `active` loans. HR/Admin approval flips it to `active` and
// generates the schedule; rejection is terminal.
export const LOAN_STATUSES = [
  "pending",
  "active",
  "closed",
  "paused",
  "rejected",
] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];

export const INSTALLMENT_STATUSES = [
  "scheduled",
  "deducted",
  "skipped",
] as const;
export type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number];

/** One scheduled repayment. `(loan_id, period_id)` makes deduction idempotent. */
export type LoanInstallment = {
  installment_id: string;
  loan_id: string;
  period_id: string | null;
  sequence: number;
  amount: number;
  status: InstallmentStatus;
  balance_after: number | null;
  deducted_on: string | null;
  created_at: string;
};

/** Mirrors EmployeeLoan (Backend/src/payroll-loans/payroll-loans.entity.ts). */
export type EmployeeLoan = {
  loan_id: string;
  user_id: string;
  name: string;
  principal: number;
  outstanding: number;
  installment_amount: number;
  start_period_id: string | null;
  status: LoanStatus;
  remarks: string | null;
  installments: LoanInstallment[];
  /** Set when an employee filed the request themselves. */
  requested_at?: string | null;
  decided_by?: string | null;
  decided_at?: string | null;
  decision_note?: string | null;
  created_at: string;
  updated_at: string;
  user?: {
    user_id: string;
    first_name: string;
    last_name: string;
    employee_code?: string | null;
  };
};

export type EmployeeLoanPayload = {
  user_id: string;
  name: string;
  principal: number;
  installment_amount: number;
  start_period_id?: string | null;
  status?: LoanStatus;
  remarks?: string | null;
};

/**
 * What an employee asks for. Narrower than the HR payload on purpose: no
 * `user_id` (the token decides) and no `installment_amount` — HR sets the real
 * deduction on approval. `requested_months` is only a suggestion the approver
 * sees, used to derive a starting installment.
 */
export type LoanRequestPayload = {
  name: string;
  principal: number;
  requested_months?: number;
  remarks?: string;
};

/** HR's approval sets the installment payroll will actually deduct. */
export type ApproveLoanPayload = {
  installment_amount?: number;
  start_period_id?: string;
  note?: string;
};

export type LoanListParams = { userId?: string; status?: LoanStatus };

const { loans } = ENDPOINTS.payrollEngine;

export const payrollLoansApi = {
  list: (params: LoanListParams = {}): Promise<EmployeeLoan[]> => {
    const query = new URLSearchParams();
    if (params.userId) query.set("userId", params.userId);
    if (params.status) query.set("status", params.status);
    const qs = query.toString();
    return api.get<EmployeeLoan[]>(`${loans.base}${qs ? `?${qs}` : ""}`);
  },

  getById: (id: string): Promise<EmployeeLoan> =>
    api.get<EmployeeLoan>(loans.byId(id)),

  create: (payload: EmployeeLoanPayload): Promise<EmployeeLoan> =>
    api.post<EmployeeLoan>(loans.base, payload),

  update: (
    id: string,
    payload: Partial<EmployeeLoanPayload>,
  ): Promise<EmployeeLoan> => api.patch<EmployeeLoan>(loans.byId(id), payload),

  remove: (id: string): Promise<{ message: string }> =>
    api.delete<{ message: string }>(loans.byId(id)),

  /** (Re)generate the installment schedule from principal / installment amount. */
  schedule: (id: string): Promise<EmployeeLoan> =>
    api.post<EmployeeLoan>(loans.schedule(id)),

  // ---- HR/Admin decisions on employee requests (`payroll-loans.approve`) ---

  /** Approve a pending request: sets the installment and builds the schedule. */
  approve: (id: string, payload: ApproveLoanPayload = {}): Promise<EmployeeLoan> =>
    api.post<EmployeeLoan>(loans.approve(id), payload),

  reject: (id: string, note?: string): Promise<EmployeeLoan> =>
    api.post<EmployeeLoan>(loans.reject(id), { note }),

  // ---- Employee self-service (token-scoped, no permission) ----------------

  listMine: (): Promise<EmployeeLoan[]> => api.get<EmployeeLoan[]>(loans.me),

  /** Apply for an advance. Lands as `pending` and deducts nothing until HR acts. */
  request: (payload: LoanRequestPayload): Promise<EmployeeLoan> =>
    api.post<EmployeeLoan>(loans.me, payload),

  /** Withdraw an own request — the backend allows this only while pending. */
  withdrawMine: (id: string): Promise<{ message: string }> =>
    api.delete<{ message: string }>(loans.meById(id)),
};
