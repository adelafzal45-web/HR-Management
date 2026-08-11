// Expense reimbursements (spec §2, employee-initiated in Phase 3). An employee
// claims money they already spent; HR/Admin approve; the next payroll run pays
// the claim as a NON-TAXABLE earning — added to net pay but deliberately kept
// out of gross, so it never inflates the taxable base or a percent-of-gross
// component. Reimbursing a receipt is repayment, not income.
//
// Two audiences, two route families:
//   - `listMine`/`submit`/`withdrawMine` hit `/reimbursements/me*`, which carry
//     NO permission server-side and resolve the employee from the JWT. An
//     employee never holds `reimbursements.*`.
//   - everything else is the HR/Admin queue and is permission-gated.
// Bodies are snake_case to match CreateReimbursementDto.

import { api, ENDPOINTS } from "@/lib/apiClient";

export const REIMBURSEMENT_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "paid",
] as const;
export type ReimbursementStatus = (typeof REIMBURSEMENT_STATUSES)[number];

/** Suggested categories — the column is a plain varchar, so this is a hint. */
export const REIMBURSEMENT_CATEGORIES = [
  "Travel",
  "Fuel",
  "Meals",
  "Accommodation",
  "Medical",
  "Internet",
  "Mobile",
  "Equipment",
  "Training",
  "Other",
] as const;
export type ReimbursementCategory = (typeof REIMBURSEMENT_CATEGORIES)[number];

/** Mirrors Reimbursement (Backend/src/reimbursements/reimbursement.entity.ts). */
export type Reimbursement = {
  reimbursement_id: string;
  user_id: string;
  title: string;
  category: string;
  amount: number;
  expense_date: string;
  description?: string | null;
  receipt_url?: string | null;
  status: ReimbursementStatus;
  decided_by?: string | null;
  decided_at?: string | null;
  decision_note?: string | null;
  /** Set when a payroll run pays the claim — what stops a double payment. */
  paid_period_id?: string | null;
  paid_payslip_id?: string | null;
  created_at: string;
  updated_at: string;
  user?: {
    user_id: string;
    first_name: string;
    last_name: string;
    employee_code?: string | null;
  };
};

/** What an employee submits. `user_id` is never sent — the token decides. */
export type ReimbursementPayload = {
  title: string;
  category: string;
  amount: number;
  expense_date: string;
  description?: string;
  receipt_url?: string;
};

/** HR filing on an employee's behalf names the employee. */
export type ReimbursementForEmployeePayload = ReimbursementPayload & {
  user_id: string;
};

export type ReimbursementListParams = {
  userId?: string;
  status?: ReimbursementStatus;
  from?: string;
  to?: string;
};

const { reimbursements } = ENDPOINTS.payrollEngine;

const toQuery = (params: ReimbursementListParams): string => {
  const query = new URLSearchParams();
  if (params.userId) query.set("userId", params.userId);
  if (params.status) query.set("status", params.status);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  const qs = query.toString();
  return qs ? `?${qs}` : "";
};

export const reimbursementsApi = {
  // ---- HR/Admin (permission-gated) ---------------------------------------

  list: (params: ReimbursementListParams = {}): Promise<Reimbursement[]> =>
    api.get<Reimbursement[]>(`${reimbursements.base}${toQuery(params)}`),

  getById: (id: string): Promise<Reimbursement> =>
    api.get<Reimbursement>(reimbursements.byId(id)),

  /** File a claim for an employee (HR only — employees use `submit`). */
  createFor: (
    payload: ReimbursementForEmployeePayload,
  ): Promise<Reimbursement> =>
    api.post<Reimbursement>(reimbursements.base, payload),

  update: (
    id: string,
    payload: Partial<ReimbursementPayload>,
  ): Promise<Reimbursement> =>
    api.patch<Reimbursement>(reimbursements.byId(id), payload),

  approve: (id: string, note?: string): Promise<Reimbursement> =>
    api.post<Reimbursement>(reimbursements.approve(id), { note }),

  reject: (id: string, note?: string): Promise<Reimbursement> =>
    api.post<Reimbursement>(reimbursements.reject(id), { note }),

  remove: (id: string): Promise<{ message: string }> =>
    api.delete<{ message: string }>(reimbursements.byId(id)),

  // ---- Employee self-service (token-scoped, no permission) ----------------

  listMine: (): Promise<Reimbursement[]> =>
    api.get<Reimbursement[]>(reimbursements.me),

  submit: (payload: ReimbursementPayload): Promise<Reimbursement> =>
    api.post<Reimbursement>(reimbursements.me, payload),

  /** Withdraw an own claim — the backend allows this only while pending. */
  withdrawMine: (id: string): Promise<{ message: string }> =>
    api.delete<{ message: string }>(reimbursements.meById(id)),
};
