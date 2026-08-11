// Small display helpers shared across the payroll admin screens. Kept separate
// from payslipPdf.ts (which has its own money() tuned for the PDF) so the
// on-screen formatting can carry the configured currency without dragging in
// jsPDF.

/** Format a number as a currency amount, e.g. money(52000, "PKR") -> "PKR 52,000.00". */
export function money(n: number | null | undefined, currency = "PKR"): string {
  const value = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return `${currency} ${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Format an ISO date (or null) as a short readable date, e.g. "11 Aug 2026". */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Title-case a snake/kebab enum value for display, e.g. "pending_approval" -> "Pending Approval". */
export function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Filename for a downloaded payroll register, e.g. "payroll-register-august-2026.xlsx".
 * Shared by every screen that offers the Excel export so a file downloaded from
 * the run screen, Reports and Payslips is named identically for the same period.
 */
export function registerFilename(periodName: string, ext = "xlsx"): string {
  const slug =
    periodName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "period";
  return `payroll-register-${slug}.${ext}`;
}
