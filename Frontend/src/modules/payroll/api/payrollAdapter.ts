// Shared adapter for `/payroll` rows from the live backend.
//
// Confirmed shape (see the live Swagger sample response for GET /api/payroll
// and the request body for POST /api/payroll):
// {
//   payroll_id, payroll_month: "2026-04-01",   // first-of-month date string
//   basic_salary, allowance, bonus, deduction, tax, net_salary,  // numeric strings, e.g. "51529.00"
//   payment_date: "2026-04-06" | null,
//   user: { user_id, employee_code, first_name, last_name, ... },
// }
//
// There is no separate pay-components table exposed over HTTP and no
// `status`/`generatedDate` column — those are derived client-side (a row is
// "Generated" once it has a payment_date, otherwise "Pending"; the pay
// components breakdown shown in the UI is synthesized from the flat
// basic/allowance/bonus/deduction/tax columns).

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : v == null ? fallback : String(v);

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const nested = (v: unknown, key: string): unknown =>
  v && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined;

const pick = (...vals: unknown[]) => vals.find((v) => v !== undefined && v !== null && v !== "");

export type ParsedPayrollRow = {
  payrollId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  payrollMonth: number; // 1-12
  payrollYear: number;
  basicSalary: number;
  allowance: number;
  bonus: number;
  deduction: number;
  tax: number;
  netSalary: number;
  paymentDate: string | null;
  status: "Generated" | "Pending";
};

export function parsePayrollRow(row: Record<string, unknown>): ParsedPayrollRow {
  const user = row.user as Record<string, unknown> | undefined;

  const firstName = str(pick(row.firstName, nested(user, "first_name"), nested(user, "firstName")));
  const lastName = str(pick(row.lastName, nested(user, "last_name"), nested(user, "lastName")));

  // `payroll_month` arrives as a first-of-month date string, e.g. "2026-04-01".
  const monthRaw = str(pick(row.payrollMonth, row.payroll_month));
  const monthDate = monthRaw ? new Date(monthRaw) : null;
  const paymentDate = str(pick(row.paymentDate, row.payment_date), "") || null;

  return {
    payrollId: str(pick(row.payrollId, row.payroll_id, row.id)),
    employeeId: str(pick(row.employeeId, row.employee_id, row.user_id, nested(user, "user_id"), nested(user, "id"))),
    employeeCode: str(pick(row.employeeCode, row.employee_code, nested(user, "employee_code")), "—"),
    employeeName: [firstName, lastName].filter(Boolean).join(" ") || "—",
    payrollMonth: monthDate && !Number.isNaN(monthDate.getTime()) ? monthDate.getMonth() + 1 : new Date().getMonth() + 1,
    payrollYear: monthDate && !Number.isNaN(monthDate.getTime()) ? monthDate.getFullYear() : new Date().getFullYear(),
    basicSalary: num(pick(row.basicSalary, row.basic_salary)),
    allowance: num(pick(row.allowance)),
    bonus: num(pick(row.bonus)),
    deduction: num(pick(row.deduction)),
    tax: num(pick(row.tax)),
    netSalary: num(pick(row.netSalary, row.net_salary)),
    paymentDate,
    status: paymentDate ? "Generated" : "Pending",
  };
}

// Builds the confirmed POST /api/payroll body from generation inputs.
// `payroll_month` must be sent as a first-of-month date string to match the
// live example ("2026-07-01"), and every currency field is a plain number
// (the backend stores/returns them as numeric strings, but accepts numbers).
export function buildPayrollPayload(input: {
  employeeId: string;
  month: number; // 1-12
  year: number;
  basicSalary: number;
  allowance: number;
  bonus: number;
  deduction: number;
  tax: number;
  paymentDate?: string | null;
}) {
  const netSalary = input.basicSalary + input.allowance + input.bonus - input.deduction - input.tax;
  const monthStr = `${input.year}-${String(input.month).padStart(2, "0")}-01`;
  return {
    user_id: input.employeeId,
    payroll_month: monthStr,
    basic_salary: input.basicSalary,
    allowance: input.allowance,
    bonus: input.bonus,
    deduction: input.deduction,
    tax: input.tax,
    net_salary: netSalary,
    ...(input.paymentDate ? { payment_date: input.paymentDate } : {}),
  };
}

// Standard breakdown used across the org (matches the ratios seen in the
// live seed data: allowance ≈ 10% of basic, deduction ≈ 2%, tax ≈ 8%).
export function standardPayrollComponents(basicSalary: number) {
  return {
    allowance: Math.round(basicSalary * 0.1 * 100) / 100,
    deduction: Math.round(basicSalary * 0.02 * 100) / 100,
    tax: Math.round(basicSalary * 0.08 * 100) / 100,
  };
}
