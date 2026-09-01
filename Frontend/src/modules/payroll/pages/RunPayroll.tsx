// Run Payroll — the one flow HR actually does every pay cycle, built as a
// single guided screen instead of five separate nav stops (Setup, Periods,
// Process, Approvals, Payslips). A linear stepper walks through five plain
// stages, one screen at a time, in the order they have to happen:
//
//   1. Start           — pick the pay period (or start a new one). If
//                         something required is missing from Configuration,
//                         this step blocks with a fix-it banner.
//   2. Review           — an editable, spreadsheet-style grid: one row per
//                         employee, salary components and bonus editable,
//                         loan installment and claims auto-filled. Edits are
//                         saved as period-scoped per-employee overrides.
//   3. Confirm          — the same grid, read-only, for a final look before
//                         payslips are generated.
//   4. Generate         — create payslips for every employee in the period.
//   5. Approve & Share  — sign off, lock, and hand out payslips.
//
// Nothing here is new capability — every call already existed across
// PayrollSetup / PayrollPeriods / ProcessPayrollV2 / PayrollApprovals. This
// page just puts them in one line, one step visible at a time, so there is
// exactly one place to start and exactly one next thing to do. The old
// screens stay reachable from the sidebar for anyone who wants to jump
// straight to a specific period or fix a configuration detail.

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  ShieldCheck,
  AlertTriangle,
  Wand2,
  Check,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  Settings2,
  CalendarRange,
  Plus,
  PlayCircle,
  CheckCircle2,
  Lock,
  ShieldAlert,
  FileSpreadsheet,
  ReceiptText,
  Sparkles,
  X,
  Save,
  Loader2,
  Landmark,
  Gift,
  ClipboardCheck,
  Pencil,
  Maximize2,
  Minimize2,
} from "lucide-react";
import PayrollLayout from "./PayrollLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import StatusBadge from "@/components/common/StatusBadge";
import Modal from "@/components/dialogs/Modal";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import { FormField, PrimaryButton } from "@/components/forms/FormField";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import { useAuth } from "@/app/providers/AuthContext";
import {
  payrollPeriodsApi,
  type PayrollPeriod,
  type PayrollPeriodPayload,
  type SetupStatus,
  type QuickSetupPreview,
  type PeriodRunResult,
} from "@/modules/payroll/api/payrollPeriodsApi";
import { payslipsApi } from "@/modules/payroll/api/payslipsApi";
import { PAYROLL_FREQUENCIES, type PayrollFrequency } from "@/modules/payroll/api/payrollSettingsApi";
import { employeesApi, type Employee } from "@/modules/employees/api/employeeApi";
import { salaryStructuresApi } from "@/modules/payroll/api/salaryStructuresApi";
import { bonusOverridesApi } from "@/modules/payroll/api/bonusOverridesApi";
import { payrollLoansApi } from "@/modules/payroll/api/payrollLoansApi";
import { reimbursementsApi } from "@/modules/payroll/api/reimbursementsApi";
import { money, shortDate, registerFilename } from "@/modules/payroll/utils/format";

// ---- Review grid types ----------------------------------------------------
//
// One row per employee, one column per configured salary component that
// shows up on anyone's payslip for the period (earnings and deductions
// alike — both editable). Loan installment and claim/reimbursement columns
// are auto-fetched and read-only. The Bonus column pre-fills from the
// configured bonus rule (surfaced by the engine as the synthetic
// `code === "BONUS"` line) and is always editable — an edit persists as a
// per-(employee, period) bonus override the engine honors with precedence
// over the rule for this run only. Editing a component cell writes a
// per-employee EmployeeOverride
// (salaryStructuresApi) scoped to the period being run — the same mechanism
// HR uses to give one person a different amount for a component, but bounded
// to this month so it doesn't change future runs.

type ReviewColumn = {
  component_id: string;
  label: string;
  type: "earning" | "deduction";
  display_order: number;
};

type ReviewCell = {
  component_id: string;
  amount: number;
  // The employee's own period-scoped override for this component, if one
  // already exists — null means "no grid override yet, create one on save".
  // A standing (open-ended) override set in the structure builder is left
  // untouched: it never matches here, so editing the cell creates a separate
  // period override that the engine prefers for this month only.
  overrideId: string | null;
  dirty: boolean;
};

type ReviewRow = {
  userId: string;
  name: string;
  code: string;
  currency: string;
  // The employee's basic salary (from their record — `user.salary`, or a
  // structure's base_salary override). Read-only here: it's the figure every
  // other number on the row is calculated from, shown so HR can see the base.
  basic: number;
  cells: Record<string, ReviewCell>;
  loanName: string | null;
  loanInstallment: number;
  claimAmount: number;
  claimCount: number;
  bonusOverrideId: string | null;
  bonusAmount: number;
  bonusDirty: boolean;
  net: number;
  dirty: boolean;
  saving: boolean;
  error: string | null;
};

type StepKey = 1 | 2 | 3 | 4 | 5;

const STEP_TITLES: Record<StepKey, string> = {
  1: "Start",
  2: "Review",
  3: "Confirm",
  4: "Generate",
  5: "Approve & Share",
};

// Plain-language line shown under the active step's heading — what this
// screen is for, in words a non-technical user gets at first sight.
const STEP_BLURBS: Record<StepKey, string> = {
  1: "Pick the month you're paying for.",
  2: "Edit salary components, bonus, loan and claims for every employee.",
  3: "Final check — read-only — before payslips are generated.",
  4: "Create payslips for all employees.",
  5: "Approve and share the payslips.",
};

const inputClass =
  "w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60 disabled:opacity-60";

// A period past "draft" already has payslips — Generate becomes read-only
// and the wizard should land straight on whatever's next for it.
const isDraft = (p: PayrollPeriod | null) => p?.status === "draft";
const isProcessed = (p: PayrollPeriod | null) =>
  !!p && ["pending_approval", "approved", "locked", "paid"].includes(p.status);
const landingStepFor = (p: PayrollPeriod | null): StepKey => {
  if (!p) return 1;
  if (p.status === "draft") return 2;
  return 5;
};

// Grid edits are scoped to the period being run: they carry the period's own
// start/end as their effective window, so the change applies to this month
// only and the engine (narrowest-wins) prefers it over any standing override.
const dateOnly = (v: string | null | undefined) => (v ? v.slice(0, 10) : "");
// True when an override is one the grid itself wrote for this exact period —
// i.e. its window equals the period's. Standing overrides from the structure
// builder (open-ended or a different window) deliberately don't match, so the
// grid never edits or clobbers them.
const isGridOverrideForPeriod = (
  o: { effective_from: string | null; effective_to: string | null },
  period: PayrollPeriod,
) =>
  dateOnly(o.effective_from) === dateOnly(period.period_start) &&
  dateOnly(o.effective_to) === dateOnly(period.period_end);

// ---- Small shared bits ------------------------------------------------

// Horizontal progress rail: numbered nodes joined by a connector line.
// Done nodes are emerald with a check, the active node carries the brand
// gradient, everything upcoming is gray. Nodes are buttons — completed
// ones step back, everything else is disabled until its prerequisite step
// is actually done.
function StepRail({
  activeStep,
  doneMap,
  lockedMap,
  onSelect,
}: {
  activeStep: StepKey;
  doneMap: Record<StepKey, boolean>;
  lockedMap: Record<StepKey, boolean>;
  onSelect: (step: StepKey) => void;
}) {
  const steps: StepKey[] = [1, 2, 3, 4, 5];
  return (
    <div className="mb-5 overflow-x-auto">
      <ol className="flex min-w-max items-start">
        {steps.map((step, i) => {
          const done = doneMap[step];
          const active = activeStep === step;
          const locked = lockedMap[step];
          const clickable = !locked;
          return (
            <li key={step} className="flex flex-1 items-center">
              <button
                type="button"
                onClick={() => clickable && onSelect(step)}
                disabled={!clickable}
                className={`flex flex-col items-center gap-2 px-1 ${
                  clickable ? "cursor-pointer" : "cursor-not-allowed"
                }`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition ${
                    done
                      ? "bg-emerald-100 text-emerald-700"
                      : active
                        ? "bg-gradient-to-r from-brand to-brand-dark text-gray-900 ring-4 ring-brand/15"
                        : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {done ? <Check size={17} /> : step}
                </span>
                <span
                  className={`whitespace-nowrap text-xs font-semibold ${
                    active ? "text-gray-900" : done ? "text-gray-600" : "text-gray-400"
                  }`}
                >
                  {STEP_TITLES[step]}
                </span>
              </button>
              {i < steps.length - 1 && (
                <span
                  className={`mx-2 mt-[-18px] h-0.5 flex-1 rounded transition ${
                    done ? "bg-emerald-300" : "bg-gray-200"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// Footer nav shown at the bottom of every step panel. `back` is omitted on
// step 1. `continueSlot` lets a step swap in its own primary action
// (Generate, Approve, etc.) instead of a generic Continue button.
function StepFooter({
  onBack,
  continueSlot,
}: {
  onBack?: () => void;
  continueSlot?: React.ReactNode;
}) {
  if (!onBack && !continueSlot) return null;
  return (
    <div className="mt-6 flex items-center justify-between gap-3 border-t border-gray-100 pt-5">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-gray-200 px-4 text-sm font-semibold text-gray-600 transition hover:border-gray-300 hover:text-gray-900"
        >
          <ArrowLeft size={15} /> Back
        </button>
      ) : (
        <span />
      )}
      {continueSlot}
    </div>
  );
}

// Small inline numeric cell — an input in edit mode, plain text once the
// grid is locked for Confirm/generation.
function GridAmountCell({
  value,
  currency,
  editable,
  tone,
  onChange,
}: {
  value: number;
  currency: string;
  editable: boolean;
  tone?: "earning" | "deduction";
  onChange?: (value: number) => void;
}) {
  if (!editable) {
    return (
      <span
        className={`tabular-nums ${
          tone === "deduction" ? "text-rose-600" : tone === "earning" ? "text-emerald-700" : "text-gray-700"
        }`}
      >
        {tone === "deduction" && value > 0 ? "−" : ""}
        {money(value, currency)}
      </span>
    );
  }
  return (
    <input
      type="number"
      step="0.01"
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange?.(Number(e.target.value))}
      className="w-24 rounded-md border border-gray-200 bg-white px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/40"
    />
  );
}

// The Excel-like review grid: sticky employee column, one column per salary
// component, then auto-fetched Loan/Claim, an editable Bonus, and Net Pay.
// `editable` toggles between the Review step (inputs + Save) and the
// Confirm step (plain values, nothing to touch).
function ReviewGrid({
  rows,
  columns,
  editable,
  loading,
  savingAll,
  onCellChange,
  onBonusChange,
  onClearBonus,
  onSaveRow,
  onSaveAll,
}: {
  rows: ReviewRow[];
  columns: ReviewColumn[];
  editable: boolean;
  loading: boolean;
  savingAll: boolean;
  onCellChange?: (userId: string, componentId: string, value: number) => void;
  onBonusChange?: (userId: string, value: number) => void;
  onClearBonus?: (userId: string) => void;
  onSaveRow?: (userId: string) => void;
  onSaveAll?: () => void;
}) {
  const dirtyCount = rows.filter((r) => r.dirty).length;
  const currency = rows[0]?.currency ?? "PKR";

  // Fullscreen lets HR blow the grid up to the whole viewport so wide payrolls
  // (many components) are easy to scan and edit. Local to the grid so both the
  // Review (editable) and Confirm (read-only) instances get it. Escape exits.
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen]);

  const totals = useMemo(() => {
    const perColumn: Record<string, number> = {};
    columns.forEach((c) => {
      perColumn[c.component_id] = rows.reduce((sum, r) => sum + (r.cells[c.component_id]?.amount ?? 0), 0);
    });
    return {
      perColumn,
      basic: rows.reduce((sum, r) => sum + r.basic, 0),
      loan: rows.reduce((sum, r) => sum + r.loanInstallment, 0),
      claim: rows.reduce((sum, r) => sum + r.claimAmount, 0),
      bonus: rows.reduce((sum, r) => sum + r.bonusAmount, 0),
      net: rows.reduce((sum, r) => sum + r.net, 0),
    };
  }, [rows, columns]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
        No active employees to review yet.
      </p>
    );
  }

  return (
    <div className={isFullscreen ? "fixed inset-0 z-50 flex flex-col bg-white p-4 md:p-6" : undefined}>
      {/* Toolbar — always present so the Fullscreen toggle is available on both
          the Review and Confirm grids. The edit hint and Save button live here
          on the editable Review step only. */}
      <div className="mb-3 flex items-center justify-between gap-3">
        {editable ? (
          <p className="flex items-center gap-1.5 text-xs text-gray-500">
            <Pencil size={13} /> Click any earning, deduction or bonus amount to override it for this run.
          </p>
        ) : (
          <span />
        )}
        <div className="flex shrink-0 items-center gap-2">
          {editable && (
            <button
              type="button"
              onClick={onSaveAll}
              disabled={dirtyCount === 0 || savingAll}
              className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-3.5 text-xs font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingAll ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {savingAll ? "Saving…" : dirtyCount ? `Save ${dirtyCount} change${dirtyCount === 1 ? "" : "s"}` : "All saved"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsFullscreen((v) => !v)}
            className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-gray-200 px-3.5 text-xs font-semibold text-gray-600 transition hover:border-gray-300 hover:text-gray-900"
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          </button>
        </div>
      </div>
      <div
        className={
          isFullscreen
            ? "min-h-0 flex-1 overflow-auto rounded-xl ring-1 ring-gray-100"
            : "overflow-x-auto rounded-xl ring-1 ring-gray-100"
        }
      >
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="sticky left-0 z-10 min-w-[180px] border-b border-gray-100 bg-gray-50 px-3 py-2.5 text-left">
                Employee
              </th>
              <th
                className="min-w-[120px] whitespace-nowrap border-b border-l border-gray-100 px-3 py-2.5 text-right text-gray-700"
                title="Set when adding the employee — all pay is calculated from this."
              >
                Basic salary
              </th>
              {columns.map((col) => (
                <th
                  key={col.component_id}
                  className={`min-w-[110px] whitespace-nowrap border-b border-l border-gray-100 px-3 py-2.5 text-right ${
                    col.type === "deduction" ? "text-rose-600" : "text-emerald-700"
                  }`}
                >
                  {col.label}
                </th>
              ))}
              <th className="min-w-[130px] whitespace-nowrap border-b border-l border-gray-100 px-3 py-2.5 text-right text-gray-600">
                <span className="inline-flex items-center gap-1">
                  <Landmark size={12} /> Loan installment
                </span>
              </th>
              <th className="min-w-[130px] whitespace-nowrap border-b border-l border-gray-100 px-3 py-2.5 text-right text-gray-600">
                <span className="inline-flex items-center gap-1">
                  <ReceiptText size={12} /> Claim
                </span>
              </th>
              <th className="min-w-[110px] whitespace-nowrap border-b border-l border-gray-100 px-3 py-2.5 text-right text-emerald-700">
                <span className="inline-flex items-center gap-1">
                  <Gift size={12} /> Bonus
                </span>
              </th>
              <th className="min-w-[120px] whitespace-nowrap border-b border-l border-gray-100 px-3 py-2.5 text-right text-gray-900">
                Net pay
              </th>
              {editable && (
                <th className="min-w-[90px] border-b border-l border-gray-100 px-3 py-2.5 text-center text-gray-500">
                  Save
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.userId} className={i % 2 === 1 ? "bg-gray-50/40" : undefined}>
                <td className="sticky left-0 z-10 border-b border-gray-50 bg-inherit px-3 py-2 align-top">
                  <p className="font-medium text-gray-900">{row.name}</p>
                  {row.code && <p className="text-xs text-gray-400">{row.code}</p>}
                  {row.error && <p className="mt-1 text-xs text-rose-600">{row.error}</p>}
                </td>
                <td className="border-b border-l border-gray-50 px-3 py-2 text-right">
                  <span className="font-medium tabular-nums text-gray-900">
                    {money(row.basic, row.currency)}
                  </span>
                </td>
                {columns.map((col) => {
                  const cell = row.cells[col.component_id];
                  return (
                    <td key={col.component_id} className="border-b border-l border-gray-50 px-3 py-2 text-right">
                      <GridAmountCell
                        value={cell?.amount ?? 0}
                        currency={row.currency}
                        editable={editable}
                        tone={col.type}
                        onChange={(v) => onCellChange?.(row.userId, col.component_id, v)}
                      />
                    </td>
                  );
                })}
                <td className="border-b border-l border-gray-50 px-3 py-2 text-right text-gray-600">
                  <span className="tabular-nums">{money(row.loanInstallment, row.currency)}</span>
                  {row.loanName && <p className="text-[11px] text-gray-400">{row.loanName}</p>}
                </td>
                <td className="border-b border-l border-gray-50 px-3 py-2 text-right text-gray-600">
                  <span className="tabular-nums">{money(row.claimAmount, row.currency)}</span>
                  {row.claimCount > 0 && (
                    <p className="text-[11px] text-gray-400">
                      {row.claimCount} claim{row.claimCount === 1 ? "" : "s"}
                    </p>
                  )}
                </td>
                <td className="border-b border-l border-gray-50 px-3 py-2 text-right">
                  <GridAmountCell
                    value={row.bonusAmount}
                    currency={row.currency}
                    editable={editable}
                    tone="earning"
                    onChange={(v) => onBonusChange?.(row.userId, v)}
                  />
                  {editable && row.bonusOverrideId && (
                    <button
                      type="button"
                      onClick={() => onClearBonus?.(row.userId)}
                      disabled={row.saving}
                      className="mt-1 block w-full text-right text-[11px] font-medium text-gray-400 transition hover:text-rose-600 disabled:opacity-40"
                      title="Remove this manual bonus and revert to the configured rule"
                    >
                      Clear override
                    </button>
                  )}
                </td>
                <td className="border-b border-l border-gray-50 px-3 py-2 text-right font-semibold text-gray-900">
                  {money(row.net, row.currency)}
                </td>
                {editable && (
                  <td className="border-b border-l border-gray-50 px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => onSaveRow?.(row.userId)}
                      disabled={!row.dirty || row.saving}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition hover:border-brand/60 hover:text-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
                      title="Save this row"
                    >
                      {row.saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 text-xs font-semibold text-gray-700">
              <td className="sticky left-0 z-10 bg-gray-50 px-3 py-2.5">Totals</td>
              <td className="border-l border-gray-100 px-3 py-2.5 text-right tabular-nums">
                {money(totals.basic, currency)}
              </td>
              {columns.map((col) => (
                <td key={col.component_id} className="border-l border-gray-100 px-3 py-2.5 text-right tabular-nums">
                  {money(totals.perColumn[col.component_id] ?? 0, currency)}
                </td>
              ))}
              <td className="border-l border-gray-100 px-3 py-2.5 text-right tabular-nums">
                {money(totals.loan, currency)}
              </td>
              <td className="border-l border-gray-100 px-3 py-2.5 text-right tabular-nums">
                {money(totals.claim, currency)}
              </td>
              <td className="border-l border-gray-100 px-3 py-2.5 text-right tabular-nums">
                {money(totals.bonus, currency)}
              </td>
              <td className="border-l border-gray-100 px-3 py-2.5 text-right tabular-nums">
                {money(totals.net, currency)}
              </td>
              {editable && <td className="border-l border-gray-100 px-3 py-2.5" />}
            </tr>
          </tfoot>
        </table>
      </div>
      {editable && (
        <p className="mt-2 text-xs text-gray-400">
          Bonus pre-fills from the configured Bonus rule (Payroll → Rules). Editing a cell sets a
          manual bonus for that employee this run only — it overrides the rule; enter 0 to leave
          someone out, or Clear override to revert to the rule.
        </p>
      )}
    </div>
  );
}

// ---- Page ---------------------------------------------------------------

export default function RunPayrollPage() {
  const status = useBackendStatus();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const canApprove = hasPermission("payroll.approve");

  // Step 1 — setup + period
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [quickPreview, setQuickPreview] = useState<QuickSetupPreview | null>(null);
  const [previewingQuick, setPreviewingQuick] = useState(false);
  const [runningQuick, setRunningQuick] = useState(false);

  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [loadingPeriods, setLoadingPeriods] = useState(true);
  const [periodId, setPeriodId] = useState<string>(searchParams.get("period") ?? "");
  const [showNewPeriod, setShowNewPeriod] = useState(false);
  const [newPeriod, setNewPeriod] = useState({
    name: "",
    frequency: "monthly" as PayrollFrequency,
    period_start: "",
    period_end: "",
    pay_date: "",
  });
  const [creatingPeriod, setCreatingPeriod] = useState(false);
  const [periodFormError, setPeriodFormError] = useState<string | null>(null);

  // Step 2 — review grid
  const [employees, setEmployees] = useState<Employee[]>([]);
  // Marks Review as "passed" once the person continues or skips it, so the
  // rail can check it off even before payslips exist yet.
  const [reviewCleared, setReviewCleared] = useState(false);

  // Step 2/3 — the editable review grid (one row per employee) and its
  // read-only confirmation mirror. Loaded once per period.
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [reviewColumns, setReviewColumns] = useState<ReviewColumn[]>([]);
  const [loadingReview, setLoadingReview] = useState(false);
  const [reviewLoadedFor, setReviewLoadedFor] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  // Marks Confirm as "passed" once the person continues from it.
  const [confirmCleared, setConfirmCleared] = useState(false);

  // Step 4 — generate
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [runResult, setRunResult] = useState<PeriodRunResult | null>(null);

  // Step 4 — approve & share
  const [approving, setApproving] = useState(false);
  const [locking, setLocking] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [activeStep, setActiveStep] = useState<StepKey>(1);
  const [manualStep, setManualStep] = useState(false);

  // ---- Load setup + periods + employees once ----
  useEffect(() => {
    let active = true;
    payrollPeriodsApi
      .setupStatus()
      .then((s) => active && setSetup(s))
      .catch(() => active && toast.showError("Couldn't load the setup checklist."))
      .finally(() => active && setLoadingSetup(false));
    payrollPeriodsApi
      .list()
      .then((p) => active && setPeriods(p))
      .catch(() => active && toast.showError("Couldn't load pay periods."))
      .finally(() => active && setLoadingPeriods(false));
    employeesApi
      .list({ status: "active", pageSize: 500 })
      .then((r) => active && setEmployees(r.data))
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedPeriod = useMemo(
    () => periods.find((p) => p.period_id === periodId) ?? null,
    [periods, periodId],
  );

  // Land on the right step whenever the selected period changes, unless the
  // person deliberately clicked a different step themselves.
  useEffect(() => {
    if (manualStep) return;
    if (loadingSetup || loadingPeriods) return;
    if (setup && !setup.ready) {
      setActiveStep(1);
      return;
    }
    setActiveStep(landingStepFor(selectedPeriod));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod, setup, loadingSetup, loadingPeriods]);

  const goToStep = (step: StepKey) => {
    setManualStep(true);
    setActiveStep(step);
  };

  const advanceTo = (step: StepKey) => {
    setManualStep(false);
    setActiveStep(step);
  };

  const selectPeriod = (id: string) => {
    setManualStep(false);
    setPeriodId(id);
    setReviewCleared(false);
    setConfirmCleared(false);
    setReviewRows([]);
    setReviewColumns([]);
    setReviewLoadedFor(null);
    setRunResult(null);
    setSearchParams(id ? { period: id } : {}, { replace: true });
  };

  // ---- Step 1 actions ----
  const openQuickPreview = async () => {
    setPreviewingQuick(true);
    try {
      setQuickPreview(await payrollPeriodsApi.quickSetupPreview());
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't check what's missing.");
    } finally {
      setPreviewingQuick(false);
    }
  };

  const runQuickSetup = async () => {
    setRunningQuick(true);
    try {
      const result = await payrollPeriodsApi.quickSetup();
      setQuickPreview(null);
      const s = await payrollPeriodsApi.setupStatus();
      setSetup(s);
      toast.showSuccess(
        result.created.length
          ? `Payroll configured — ${result.created.length} item${result.created.length === 1 ? "" : "s"} created.`
          : "Everything was already set up.",
      );
      if (s.ready) {
        setManualStep(false);
        setActiveStep(landingStepFor(selectedPeriod));
      }
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Quick setup failed.");
    } finally {
      setRunningQuick(false);
    }
  };

  // ---- Step 2 (period picker, part of Start) actions ----
  const submitNewPeriod = async (e: FormEvent) => {
    e.preventDefault();
    setPeriodFormError(null);
    if (!newPeriod.name.trim() || !newPeriod.period_start || !newPeriod.period_end) {
      setPeriodFormError("Name, start date and end date are required.");
      return;
    }
    setCreatingPeriod(true);
    try {
      const payload: PayrollPeriodPayload = {
        name: newPeriod.name.trim(),
        frequency: newPeriod.frequency,
        period_start: newPeriod.period_start,
        period_end: newPeriod.period_end,
        pay_date: newPeriod.pay_date || undefined,
      };
      const created = await payrollPeriodsApi.create(payload);
      setPeriods((prev) => [created, ...prev]);
      setShowNewPeriod(false);
      setNewPeriod({ name: "", frequency: "monthly", period_start: "", period_end: "", pay_date: "" });
      toast.showSuccess("Pay period created.");
      selectPeriod(created.period_id);
      advanceTo(2);
    } catch (err) {
      setPeriodFormError(err instanceof Error ? err.message : "Couldn't create the period.");
    } finally {
      setCreatingPeriod(false);
    }
  };

  const clearReviewAndAdvance = () => {
    setReviewCleared(true);
    advanceTo(3);
  };

  // ---- Step 2/3 (Review grid) actions ----
  // Loads one row per active employee: their editable salary components
  // (with any existing per-employee override applied), the next due loan
  // installment, any approved-but-unpaid claim total, and — if a "Bonus"
  // component is configured — its current amount too.
  const loadReviewGrid = async (pid: string) => {
    if (!pid || employees.length === 0) return;
    const period = periods.find((p) => p.period_id === pid);
    if (!period) return;
    setLoadingReview(true);
    try {
      const [previews, overrides, loans, claims, bonusOverrides] = await Promise.all([
        Promise.all(
          employees.map((e) =>
            payslipsApi.preview({ user_id: e.employeeId, period_id: pid }).catch(() => null),
          ),
        ),
        salaryStructuresApi.listOverrides(),
        payrollLoansApi.list({ status: "active" }),
        reimbursementsApi.list({ status: "approved" }),
        bonusOverridesApi.list(pid),
      ]);

      const colMap = new Map<string, ReviewColumn>();
      previews.forEach((p) => {
        if (!p) return;
        p.lines.forEach((l) => {
          if (!l.component_id) return;
          if (!colMap.has(l.component_id)) {
            colMap.set(l.component_id, {
              component_id: l.component_id,
              label: l.label,
              type: l.type,
              display_order: l.display_order,
            });
          }
        });
      });
      const columns = Array.from(colMap.values()).sort((a, b) => a.display_order - b.display_order);
      setReviewColumns(columns);

      const rows: ReviewRow[] = employees.map((e, idx) => {
        const p = previews[idx];
        const cells: Record<string, ReviewCell> = {};
        columns.forEach((col) => {
          const line = p?.lines.find((l) => l.component_id === col.component_id);
          const ov = overrides.find(
            (o) =>
              o.user_id === e.employeeId &&
              o.component_id === col.component_id &&
              isGridOverrideForPeriod(o, period),
          );
          cells[col.component_id] = {
            component_id: col.component_id,
            amount: line ? Math.abs(line.amount) : (ov?.override_amount ?? 0),
            overrideId: ov?.override_id ?? null,
            dirty: false,
          };
        });

        let loanInstallment = 0;
        let loanName: string | null = null;
        loans
          .filter((l) => l.user_id === e.employeeId)
          .forEach((loan) => {
            const due = [...(loan.installments ?? [])]
              .filter((inst) => inst.status === "scheduled")
              .sort((a, b) => a.sequence - b.sequence)[0];
            if (due) {
              loanInstallment += due.amount;
              loanName = loanName ? `${loanName}, ${loan.name}` : loan.name;
            }
          });

        const empClaims = claims.filter((c) => c.user_id === e.employeeId && !c.paid_period_id);
        const claimAmount = empClaims.reduce((sum, c) => sum + c.amount, 0);

        // Bonus pre-fills from the engine's synthetic BONUS line, which already
        // reflects any persisted override (build() reads overrides for both the
        // preview and the run). The overrides list gives us the override's id
        // (so the Clear affordance can show) and the amount to fall back on when
        // an override of 0 cancels the bonus, leaving no BONUS line to read.
        const bonusOv = bonusOverrides.find((o) => o.user_id === e.employeeId);
        const bonusLine = p?.lines.find((l) => l.code === "BONUS");

        return {
          userId: e.employeeId,
          name: `${e.firstName} ${e.lastName}`,
          code: e.employeeCode ?? "",
          currency: p?.currency ?? "PKR",
          basic: p?.basic_salary ?? 0,
          cells,
          loanName,
          loanInstallment,
          claimAmount,
          claimCount: empClaims.length,
          bonusOverrideId: bonusOv?.bonus_override_id ?? null,
          bonusAmount: bonusLine ? Math.abs(bonusLine.amount) : (bonusOv?.amount ?? 0),
          bonusDirty: false,
          net: p?.net_salary ?? 0,
          dirty: false,
          saving: false,
          error: null,
        };
      });
      setReviewRows(rows);
      setReviewLoadedFor(pid);
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't load the review grid.");
    } finally {
      setLoadingReview(false);
    }
  };

  // Reload the grid whenever we land on Review/Confirm for a draft period
  // that hasn't been loaded yet.
  useEffect(() => {
    if ((activeStep === 2 || activeStep === 3) && selectedPeriod && isDraft(selectedPeriod)) {
      if (reviewLoadedFor !== periodId && employees.length > 0 && !loadingReview) {
        loadReviewGrid(periodId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep, selectedPeriod, periodId, employees.length]);

  const updateCell = (userId: string, componentId: string, value: number) => {
    setReviewRows((rows) =>
      rows.map((r) =>
        r.userId === userId
          ? {
              ...r,
              dirty: true,
              cells: {
                ...r.cells,
                [componentId]: { ...r.cells[componentId], amount: value, dirty: true },
              },
            }
          : r,
      ),
    );
  };

  const updateBonus = (userId: string, value: number) => {
    setReviewRows((rows) =>
      rows.map((r) => (r.userId === userId ? { ...r, dirty: true, bonusDirty: true, bonusAmount: value } : r)),
    );
  };

  // Clears a persisted bonus override, reverting the employee to the configured
  // rule for this run, then re-previews so the cell and Net Pay reflect the rule
  // value again. Any other unsaved cell edits on the row stay dirty.
  const clearBonusOverride = async (userId: string) => {
    const row = reviewRows.find((r) => r.userId === userId);
    if (!row || !row.bonusOverrideId) return;
    setReviewRows((rows) => rows.map((r) => (r.userId === userId ? { ...r, saving: true, error: null } : r)));
    try {
      await bonusOverridesApi.remove(row.bonusOverrideId);
      const refreshed = await payslipsApi.preview({ user_id: userId, period_id: periodId });
      const bonusLine = refreshed.lines.find((l) => l.code === "BONUS");
      setReviewRows((rows) =>
        rows.map((r) => {
          if (r.userId !== userId) return r;
          const cellsDirty = Object.values(r.cells).some((c) => c.dirty);
          return {
            ...r,
            saving: false,
            bonusOverrideId: null,
            bonusDirty: false,
            dirty: cellsDirty,
            net: refreshed.net_salary,
            bonusAmount: bonusLine ? Math.abs(bonusLine.amount) : 0,
          };
        }),
      );
      toast.showSuccess("Bonus override cleared — reverted to the configured rule.");
    } catch (err) {
      setReviewRows((rows) =>
        rows.map((r) =>
          r.userId === userId
            ? { ...r, saving: false, error: err instanceof Error ? err.message : "Couldn't clear the bonus override." }
            : r,
        ),
      );
    }
  };

  // Persists only the cells the user actually edited for one row, as
  // period-scoped EmployeeOverrides (their effective window is the period being
  // run), then re-previews that person so Net Pay reflects the change.
  // Untouched cells are never written, so a component that's normally a
  // formula/percentage keeps its own calculation instead of being frozen to a
  // fixed figure — and the edit that is made applies to this month only.
  const saveRow = async (userId: string) => {
    const row = reviewRows.find((r) => r.userId === userId);
    if (!row || !selectedPeriod) return;
    const window = {
      effective_from: dateOnly(selectedPeriod.period_start),
      effective_to: dateOnly(selectedPeriod.period_end),
    };
    setReviewRows((rows) => rows.map((r) => (r.userId === userId ? { ...r, saving: true, error: null } : r)));
    try {
      const newOverrideIds: Record<string, string> = {};
      for (const col of reviewColumns) {
        const cell = row.cells[col.component_id];
        if (!cell || !cell.dirty) continue;
        if (cell.overrideId) {
          await salaryStructuresApi.updateOverride(cell.overrideId, {
            override_calculation_type: "fixed",
            override_amount: cell.amount,
            ...window,
          });
        } else {
          const created = await salaryStructuresApi.createOverride({
            user_id: userId,
            component_id: col.component_id,
            override_calculation_type: "fixed",
            override_amount: cell.amount,
            ...window,
          });
          newOverrideIds[col.component_id] = created.override_id;
        }
      }
      let newBonusOverrideId: string | null = null;
      if (row.bonusDirty) {
        // One manual bonus per (employee, period): upsert covers the first edit
        // and every later one, and stores an explicit 0 (which cancels the rule
        // bonus for this run). No effective window — the period is the key. To
        // revert to the rule, the row's Clear affordance deletes the override.
        const saved = await bonusOverridesApi.upsert({
          user_id: userId,
          period_id: periodId,
          amount: row.bonusAmount,
        });
        newBonusOverrideId = saved.bonus_override_id;
      }
      const refreshed = await payslipsApi.preview({ user_id: userId, period_id: periodId });
      setReviewRows((rows) =>
        rows.map((r) => {
          if (r.userId !== userId) return r;
          const cells: Record<string, ReviewCell> = {};
          reviewColumns.forEach((col) => {
            const line = refreshed.lines.find((l) => l.component_id === col.component_id);
            const prev = r.cells[col.component_id];
            cells[col.component_id] = {
              component_id: col.component_id,
              amount: line ? Math.abs(line.amount) : (prev?.amount ?? 0),
              overrideId: prev?.overrideId ?? newOverrideIds[col.component_id] ?? null,
              dirty: false,
            };
          });
          const bonusLine = refreshed.lines.find((l) => l.code === "BONUS");
          return {
            ...r,
            dirty: false,
            bonusDirty: false,
            saving: false,
            net: refreshed.net_salary,
            cells,
            bonusOverrideId: newBonusOverrideId ?? r.bonusOverrideId,
            bonusAmount: bonusLine ? Math.abs(bonusLine.amount) : 0,
          };
        }),
      );
    } catch (err) {
      setReviewRows((rows) =>
        rows.map((r) =>
          r.userId === userId
            ? { ...r, saving: false, error: err instanceof Error ? err.message : "Couldn't save." }
            : r,
        ),
      );
      throw err;
    }
  };

  const saveAllDirty = async () => {
    setSavingAll(true);
    try {
      for (const row of reviewRows.filter((r) => r.dirty)) {
        await saveRow(row.userId).catch(() => {});
      }
      toast.showSuccess("Changes saved.");
    } finally {
      setSavingAll(false);
    }
  };

  const clearConfirmAndAdvance = () => {
    setConfirmCleared(true);
    advanceTo(4);
  };

  // ---- Step 4 (Generate) actions ----
  const runGenerate = async () => {
    if (!periodId) return;
    setGenerating(true);
    try {
      const res = await payrollPeriodsApi.process(periodId);
      setRunResult(res.run);
      setPeriods((prev) => prev.map((p) => (p.period_id === periodId ? res.period : p)));
      toast.showSuccess(`Generated ${res.run.generated} payslip${res.run.generated === 1 ? "" : "s"}.`);
      setReviewCleared(true);
      setConfirmCleared(true);
      advanceTo(5);
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't process the period.");
    } finally {
      setGenerating(false);
      setConfirmGenerate(false);
    }
  };

  // ---- Step 4 actions ----
  const doApprove = async () => {
    if (!periodId) return;
    setApproving(true);
    try {
      const updated = await payrollPeriodsApi.approve(periodId);
      setPeriods((prev) => prev.map((p) => (p.period_id === periodId ? updated : p)));
      toast.showSuccess("Run approved.");
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't approve this run.");
    } finally {
      setApproving(false);
    }
  };

  const doLock = async () => {
    if (!periodId) return;
    setLocking(true);
    try {
      const updated = await payrollPeriodsApi.lock(periodId);
      setPeriods((prev) => prev.map((p) => (p.period_id === periodId ? updated : p)));
      toast.showSuccess("Period locked — payslips are now frozen.");
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't lock this period.");
    } finally {
      setLocking(false);
    }
  };

  const downloadWorkbook = async () => {
    if (!selectedPeriod) return;
    setDownloading(true);
    try {
      await payslipsApi.downloadWorkbook(selectedPeriod.period_id, registerFilename(selectedPeriod.name));
      toast.showSuccess("Excel register downloaded.");
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't build the Excel file.");
    } finally {
      setDownloading(false);
    }
  };

  // ---- Derived step state ----
  const setupReady = !!setup?.ready;
  const step1Done = setupReady && !!selectedPeriod;
  const step4Done = isProcessed(selectedPeriod);
  const step2Done = reviewCleared || step4Done;
  const step3Done = confirmCleared || step4Done;
  const step5Done = selectedPeriod?.status === "locked" || selectedPeriod?.status === "paid";

  const step2Locked = !step1Done;
  const step3Locked = !step1Done;
  const step4Locked = !step1Done;
  const step5Locked = !step4Done;

  const doneMap: Record<StepKey, boolean> = {
    1: step1Done,
    2: step2Done,
    3: step3Done,
    4: step4Done,
    5: step5Done,
  };
  const lockedMap: Record<StepKey, boolean> = {
    1: false,
    2: step2Locked,
    3: step3Locked,
    4: step4Locked,
    5: step5Locked,
  };

  const toCreate = quickPreview ? quickPreview.items.filter((i) => i.action === "create") : [];
  const toSkip = quickPreview ? quickPreview.items.filter((i) => i.action === "skip") : [];
  const requiredDone = setup ? setup.checks.filter((c) => c.required && c.passed).length : 0;
  const requiredTotal = setup ? setup.checks.filter((c) => c.required).length : 0;
  const missingChecks = setup ? setup.checks.filter((c) => c.required && !c.passed) : [];

  return (
    <PayrollLayout activeTab="/payroll/run">
      <BackendStatusBanner status={status} />

      <div className="mb-5">
        <h1 className="text-lg font-semibold text-gray-900">Run Payroll</h1>
        <p className="mt-1 text-sm text-gray-500">
          Five quick steps: start, review, confirm, generate, then approve and share the payslips.
        </p>
      </div>

      <StepRail activeStep={activeStep} doneMap={doneMap} lockedMap={lockedMap} onSelect={goToStep} />

      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-gray-900">{STEP_TITLES[activeStep]}</h2>
          <p className="mt-0.5 text-sm text-gray-500">{STEP_BLURBS[activeStep]}</p>
        </div>

        {/* Step 1 — Start: setup gate + pick a period */}
        {activeStep === 1 && (
          <div>
            {loadingSetup ? (
              <div className="space-y-2 py-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded-xl bg-gray-100" />
                ))}
              </div>
            ) : !setup ? (
              <p className="flex items-center gap-2 py-3 text-sm font-medium text-rose-600">
                <AlertTriangle size={16} /> Setup status is unavailable.
              </p>
            ) : !setup.ready ? (
              <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                  <AlertTriangle size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">A few required things are missing</p>
                  <p className="mt-0.5 text-xs text-gray-600">
                    Payroll can't run yet — finish these before continuing.
                  </p>
                  <ul className="mt-2 space-y-1">
                    {missingChecks.map((c) => (
                      <li key={c.key} className="text-xs text-gray-600">
                        • {c.label}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={openQuickPreview}
                      disabled={previewingQuick}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Wand2 size={14} />
                      {previewingQuick ? "Checking…" : "Set up automatically"}
                    </button>
                    <Link
                      to="/payroll/setup"
                      className="inline-flex items-center gap-1 text-sm font-semibold text-brand-dark hover:underline"
                    >
                      <Settings2 size={14} /> Open Configuration <ArrowRight size={13} />
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <ShieldCheck size={16} />
                </span>
                <p className="text-sm text-emerald-800">
                  Configuration is ready — {requiredDone} of {requiredTotal} required items done.
                </p>
              </div>
            )}

            <div className="mt-5">
              <p className="mb-2 text-xs font-medium text-gray-500">
                {periods.length ? "Choose a pay period" : "No pay periods yet"}
              </p>
              {loadingPeriods ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100" />
                  ))}
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {periods.slice(0, 6).map((p) => (
                      <button
                        key={p.period_id}
                        type="button"
                        onClick={() => selectPeriod(p.period_id)}
                        className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                          p.period_id === periodId
                            ? "border-brand bg-brand-light/40"
                            : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <CalendarRange size={16} className="shrink-0 text-gray-400" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-gray-900">{p.name}</span>
                          <span className="block text-xs text-gray-500">
                            {shortDate(p.period_start)} – {shortDate(p.period_end)}
                          </span>
                        </span>
                        <StatusBadge status={p.status} />
                      </button>
                    ))}
                    {periods.length === 0 && (
                      <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                        No pay periods yet — start one below.
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowNewPeriod(true)}
                    className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-dashed border-gray-300 px-4 text-sm font-semibold text-gray-600 transition hover:border-brand/60 hover:text-brand-dark"
                  >
                    <Plus size={15} /> Start a new pay period
                  </button>
                </>
              )}
            </div>

            <StepFooter
              continueSlot={
                <button
                  type="button"
                  onClick={() => advanceTo(2)}
                  disabled={!step1Done}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Continue <ChevronRight size={15} />
                </button>
              }
            />
          </div>
        )}

        {/* Step 2 — Review: editable, Excel-style grid, one row per employee */}
        {activeStep === 2 && selectedPeriod && (
          <div>
            {!isDraft(selectedPeriod) ? (
              <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-4">
                <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
                <p className="text-sm text-emerald-800">
                  This period has already been processed — its status is{" "}
                  <span className="font-semibold">{selectedPeriod.status.replace(/_/g, " ")}</span>.
                </p>
              </div>
            ) : (
              <ReviewGrid
                rows={reviewRows}
                columns={reviewColumns}
                editable
                loading={loadingReview}
                savingAll={savingAll}
                onCellChange={updateCell}
                onBonusChange={updateBonus}
                onClearBonus={clearBonusOverride}
                onSaveRow={(userId) => saveRow(userId).catch(() => {})}
                onSaveAll={saveAllDirty}
              />
            )}

            <StepFooter
              onBack={() => goToStep(1)}
              continueSlot={
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={clearReviewAndAdvance}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-gray-200 px-4 text-sm font-semibold text-gray-600 transition hover:border-gray-300 hover:text-gray-900"
                  >
                    Skip
                  </button>
                  <button
                    type="button"
                    onClick={clearReviewAndAdvance}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
                  >
                    Continue <ChevronRight size={15} />
                  </button>
                </div>
              }
            />
          </div>
        )}

        {/* Step 3 — Confirm: the same grid, frozen, right before generating */}
        {activeStep === 3 && selectedPeriod && (
          <div>
            {!isDraft(selectedPeriod) ? (
              <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-4">
                <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
                <p className="text-sm text-emerald-800">
                  This period has already been processed — its status is{" "}
                  <span className="font-semibold">{selectedPeriod.status.replace(/_/g, " ")}</span>.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-brand-light/40 px-4 py-3">
                  <ClipboardCheck size={16} className="shrink-0 text-brand-dark" />
                  <p className="text-sm text-gray-700">
                    This is what will be used to generate payslips. Nothing here is editable — go back to
                    Review if something needs to change.
                  </p>
                </div>
                <ReviewGrid
                  rows={reviewRows}
                  columns={reviewColumns}
                  editable={false}
                  loading={loadingReview}
                  savingAll={false}
                />
              </>
            )}

            <StepFooter
              onBack={() => goToStep(2)}
              continueSlot={
                isDraft(selectedPeriod) ? (
                  <button
                    type="button"
                    onClick={clearConfirmAndAdvance}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
                  >
                    Confirm & continue <ChevronRight size={15} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => advanceTo(4)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
                  >
                    Continue <ChevronRight size={15} />
                  </button>
                )
              }
            />
          </div>
        )}

        {/* Step 4 — Generate: create payslips for everyone */}
        {activeStep === 4 && selectedPeriod && (
          <div>
            {!isDraft(selectedPeriod) ? (
              <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-4">
                <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
                <p className="text-sm text-emerald-800">
                  Payslips have already been generated for this period — its status is{" "}
                  <span className="font-semibold">{selectedPeriod.status.replace(/_/g, " ")}</span>.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-4 rounded-xl bg-gray-50 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    Ready to create payslips for {selectedPeriod.name}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    This creates one payslip for every active employee in this period, using each
                    person's own salary and structure.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmGenerate(true)}
                  disabled={generating}
                  className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand-dark px-5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <PlayCircle size={16} /> {generating ? "Generating…" : "Generate Payslips"}
                </button>
              </div>
            )}

            <StepFooter
              onBack={() => goToStep(3)}
              continueSlot={
                !isDraft(selectedPeriod) ? (
                  <button
                    type="button"
                    onClick={() => advanceTo(5)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
                  >
                    Continue <ChevronRight size={15} />
                  </button>
                ) : undefined
              }
            />
          </div>
        )}

        {/* Step 5 — Approve & Share */}
        {activeStep === 5 && selectedPeriod && (
          <div>
            {runResult && (
              <div className="mb-4 rounded-xl bg-emerald-50 p-4">
                <p className="text-sm text-emerald-800">
                  <span className="font-semibold">{runResult.generated}</span> payslip
                  {runResult.generated === 1 ? "" : "s"} generated
                  {runResult.skipped > 0 && (
                    <>
                      {" · "}
                      <span className="font-semibold">{runResult.skipped}</span> skipped
                    </>
                  )}
                  .
                </p>
                {runResult.warnings.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {runResult.warnings.map((w, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
                        <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {w}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5">
              {selectedPeriod.status === "pending_approval" && (
                <button
                  type="button"
                  onClick={doApprove}
                  disabled={!canApprove || approving}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircle2 size={15} /> {approving ? "Approving…" : "Approve run"}
                </button>
              )}
              {selectedPeriod.status === "pending_approval" && !canApprove && (
                <span className="flex items-center gap-1.5 text-xs text-gray-400">
                  <ShieldAlert size={13} /> Waiting on an Administrator to approve.
                </span>
              )}
              {selectedPeriod.status === "approved" && (
                <button
                  type="button"
                  onClick={doLock}
                  disabled={locking}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Lock size={15} /> {locking ? "Locking…" : "Lock period"}
                </button>
              )}
              <button
                type="button"
                onClick={downloadWorkbook}
                disabled={downloading}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-gray-200 px-4 text-sm font-semibold text-gray-700 transition hover:border-brand/60 hover:text-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileSpreadsheet size={15} /> {downloading ? "Building…" : "Download Excel register"}
              </button>
              <a
                href={`/payroll/payslips?period=${selectedPeriod.period_id}`}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-gray-200 px-4 text-sm font-semibold text-gray-700 transition hover:border-brand/60 hover:text-brand-dark"
              >
                <ReceiptText size={15} /> View payslips
              </a>
            </div>

            {step4Done && (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                <Sparkles size={15} /> This run is complete — the period is locked and payslips are ready
                to share.
              </div>
            )}

            <StepFooter onBack={() => goToStep(4)} />
          </div>
        )}
      </div>

      {/* New period modal */}
      <Modal
        open={showNewPeriod}
        onClose={() => setShowNewPeriod(false)}
        title="Start a new pay period"
        description="This becomes the period you process payroll for."
      >
        <form onSubmit={submitNewPeriod}>
          {periodFormError && (
            <p className="mb-4 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">
              <AlertTriangle size={15} /> {periodFormError}
            </p>
          )}
          <FormField
            label="Period name"
            placeholder="e.g. August 2026"
            value={newPeriod.name}
            onChange={(e) => setNewPeriod((f) => ({ ...f, name: e.target.value }))}
          />
          <label className="mb-5 block">
            <span className="mb-2 block text-[15px] font-medium text-gray-900">Frequency</span>
            <select
              className={inputClass}
              value={newPeriod.frequency}
              onChange={(e) => setNewPeriod((f) => ({ ...f, frequency: e.target.value as PayrollFrequency }))}
            >
              {PAYROLL_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f[0].toUpperCase() + f.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              label="Start date"
              type="date"
              value={newPeriod.period_start}
              onChange={(e) => setNewPeriod((f) => ({ ...f, period_start: e.target.value }))}
            />
            <FormField
              label="End date"
              type="date"
              value={newPeriod.period_end}
              onChange={(e) => setNewPeriod((f) => ({ ...f, period_end: e.target.value }))}
            />
          </div>
          <FormField
            label={<>Pay date <span className="font-normal text-gray-400">(optional)</span></>}
            type="date"
            value={newPeriod.pay_date}
            onChange={(e) => setNewPeriod((f) => ({ ...f, pay_date: e.target.value }))}
          />
          <PrimaryButton type="submit" loading={creatingPeriod}>
            Create period
          </PrimaryButton>
        </form>
      </Modal>

      {/* Quick setup review */}
      <Modal
        open={!!quickPreview}
        onClose={() => setQuickPreview(null)}
        title="Set up payroll automatically"
        description={
          toCreate.length
            ? `${toCreate.length} item${toCreate.length === 1 ? "" : "s"} will be created. Anything already configured is left as-is.`
            : "Nothing is missing — configuration is already complete."
        }
      >
        <div className="space-y-4">
          {toCreate.length > 0 && (
            <ul className="space-y-2">
              {toCreate.map((item) => (
                <li key={item.key} className="flex items-start gap-3 rounded-xl bg-emerald-50 px-4 py-3">
                  <Plus size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{item.label}</p>
                    <p className="mt-0.5 text-xs text-gray-600">{item.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {toSkip.length > 0 && (
            <ul className="space-y-1.5">
              {toSkip.map((item) => (
                <li key={item.key} className="flex items-start gap-2.5 px-1">
                  <X size={13} className="mt-1 shrink-0 text-gray-300" />
                  <span className="text-sm text-gray-500">{item.label} — already set up</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col-reverse gap-2.5 xs:flex-row">
            <button
              type="button"
              onClick={() => setQuickPreview(null)}
              className="min-h-11 flex-1 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <div className="flex-1">
              <PrimaryButton type="button" onClick={runQuickSetup} loading={runningQuick} disabled={toCreate.length === 0}>
                {toCreate.length === 0 ? "Nothing to create" : `Create ${toCreate.length} item${toCreate.length === 1 ? "" : "s"}`}
              </PrimaryButton>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmGenerate}
        title={`Generate payslips for "${selectedPeriod?.name}"?`}
        description="This creates a payslip for every active employee in the period. You can still preview individuals first."
        confirmLabel="Generate"
        loading={generating}
        onConfirm={runGenerate}
        onCancel={() => setConfirmGenerate(false)}
      />
    </PayrollLayout>
  );
}