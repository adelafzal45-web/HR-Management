// Employee loans / salary advances (spec §9). A loan is repaid by fixed
// installments deducted from payroll; `outstanding` is the running balance a
// payroll run decrements (idempotently, keyed on the period) as installments
// are deducted, closing the loan when it hits zero.
//
// `schedule` (re)generates the installment ladder from principal / installment
// amount, preserving anything already deducted. Real backend or throw; bodies
// are snake_case to match CreateEmployeeLoanDto.

import { api, ENDPOINTS } from "@/lib/apiClient";

export const LOAN_STATUSES = ["active", "closed", "paused"] as const;
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
  created_at: string;
  updated_at: string;
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
};
