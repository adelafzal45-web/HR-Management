// Payslips (spec §14) — the org-wide payslip register for HR/Admin. Read-only:
// payslips are produced by processing a period (see ProcessPayrollV2), so this
// screen lists, filters, inspects and exports them, but never creates them.
//
// payslipsApi.list() takes optional periodId/userId server-side filters and
// returns a BARE ARRAY, so we refetch when those dropdowns change and search by
// name/code client-side. Each row's frozen calculation_json snapshot is the
// source for both the breakdown modal and the PDF — the payslip renders the same
// way forever, even after the rules that produced it change.

import { useEffect, useMemo, useState } from "react";
import { ReceiptText, Eye, Download } from "lucide-react";
import PayrollLayout from "./PayrollLayout";
import DataTable, { type DataTableColumn } from "@/components/tables/DataTable";
import Modal from "@/components/dialogs/Modal";
import StatusBadge from "@/components/common/StatusBadge";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import { useBranding } from "@/app/providers/BrandingContext";
import {
  payslipsApi,
  type Payslip,
  type ComputedLine,
} from "@/modules/payroll/api/payslipsApi";
import { payrollPeriodsApi, type PayrollPeriod } from "@/modules/payroll/api/payrollPeriodsApi";
import { employeesApi, type Employee } from "@/modules/employees/api/employeeApi";
import { money, humanize } from "@/modules/payroll/utils/format";
import {
  downloadPayslipPdf,
  resolveLogoDataUrl,
  type PayslipPdfInput,
} from "@/modules/payroll/utils/payslipPdf";

const selectClass =
  "min-h-10 rounded-full border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/60";

// A payslip's display fields prefer its own frozen snapshot; fall back to the
// live period/employee lookups for the rare row without a calculation_json.
function employeeName(p: Payslip, byId: Map<string, Employee>): string {
  if (p.calculation_json?.employee_name) return p.calculation_json.employee_name;
  const e = byId.get(p.user_id);
  return e ? `${e.firstName} ${e.lastName}`.trim() : "Employee";
}

function employeeCode(p: Payslip, byId: Map<string, Employee>): string {
  return p.calculation_json?.employee_code ?? byId.get(p.user_id)?.employeeCode ?? "";
}

function periodName(p: Payslip, byId: Map<string, PayrollPeriod>): string {
  return p.calculation_json?.period_name ?? byId.get(p.period_id)?.name ?? "—";
}

function splitLines(p: Payslip): { earnings: ComputedLine[]; deductions: ComputedLine[] } {
  const lines = p.calculation_json?.lines ?? p.lines ?? [];
  return {
    earnings: lines.filter((l) => l.type === "earning"),
    deductions: lines.filter((l) => l.type === "deduction"),
  };
}

export default function PayslipsPage() {
  const status = useBackendStatus();
  const toast = useToast();
  const { branding } = useBranding();

  const [rows, setRows] = useState<Payslip[]>([]);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Server-side filters (trigger a refetch); search is client-side.
  const [periodId, setPeriodId] = useState("");
  const [userId, setUserId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [selected, setSelected] = useState<Payslip | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const employeeById = useMemo(
    () => new Map(employees.map((e) => [e.employeeId, e])),
    [employees],
  );
  const periodById = useMemo(
    () => new Map(periods.map((p) => [p.period_id, p])),
    [periods],
  );

  // Filter dropdown sources + PDF logo, loaded once.
  useEffect(() => {
    payrollPeriodsApi.list().then(setPeriods).catch(() => setPeriods([]));
    employeesApi
      .list({ pageSize: 500 })
      .then((r) => setEmployees(r.data))
      .catch(() => setEmployees([]));
    resolveLogoDataUrl(branding.logoUrl).then(setLogoDataUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch whenever a server-side filter changes.
  useEffect(() => {
    let active = true;
    setLoading(true);
    payslipsApi
      .list({ periodId: periodId || undefined, userId: userId || undefined })
      .then((r) => active && setRows(r))
      .catch(() => active && toast.showError("Couldn't load payslips."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId, userId]);

  useEffect(() => setPage(1), [search, periodId, userId, pageSize]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((p) => {
      const name = employeeName(p, employeeById).toLowerCase();
      const code = employeeCode(p, employeeById).toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }, [rows, search, employeeById]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  useEffect(() => setTotal(filtered.length), [filtered]);

  const buildPdfInput = (p: Payslip): PayslipPdfInput => {
    const { earnings, deductions } = splitLines(p);
    const snap = p.calculation_json;
    const emp = employeeById.get(p.user_id);
    const currency = snap?.currency ?? "PKR";
    return {
      company: {
        name: branding.companyName || "TechnoCues HRMS",
        address: branding.address,
        email: branding.email,
        phone: branding.phone,
        website: branding.website,
        logoDataUrl,
      },
      employee: {
        name: employeeName(p, employeeById),
        code: employeeCode(p, employeeById),
        designation: emp?.designationName,
        department: emp?.departmentName,
        email: emp?.email,
      },
      period: periodName(p, periodById),
      status: p.status === "paid" ? "Generated" : humanize(p.status),
      paymentDate: p.payment_date,
      currency,
      earnings: earnings.map((l) => ({ label: l.label, amount: l.amount })),
      deductions: deductions.map((l) => ({ label: l.label, amount: Math.abs(l.amount) })),
      netSalary: p.net_salary,
      payroll: {
        workingDays: p.working_days,
        presentDays: p.present_days,
        absentDays: p.absent_days,
        paidLeave: p.paid_leave_days,
        unpaidLeave: p.unpaid_leave_days,
        overtimeHours: p.overtime_hours,
      },
      payslipId: p.payslip_id,
      generatedAt: new Date().toLocaleString(),
    };
  };

  const handleDownload = async (p: Payslip) => {
    setDownloadingId(p.payslip_id);
    try {
      const code = employeeCode(p, employeeById) || p.user_id.slice(0, 8);
      await downloadPayslipPdf(buildPdfInput(p), `payslip-${code}-${periodName(p, periodById)}`);
    } catch {
      toast.showError("Couldn't generate the payslip PDF.");
    } finally {
      setDownloadingId(null);
    }
  };

  const columns: DataTableColumn<Payslip>[] = [
    {
      key: "employee",
      label: "Employee",
      render: (p) => (
        <div className="min-w-0">
          <span className="block font-medium text-gray-900">{employeeName(p, employeeById)}</span>
          <span className="block font-mono text-xs text-gray-400">
            {employeeCode(p, employeeById) || "—"}
          </span>
        </div>
      ),
    },
    {
      key: "period",
      label: "Period",
      render: (p) => <span className="text-gray-600">{periodName(p, periodById)}</span>,
      hideBelow: "md",
    },
    {
      key: "net_salary",
      label: "Net Pay",
      render: (p) => (
        <span className="font-semibold text-gray-900 tabular-nums">
          {money(p.net_salary, p.calculation_json?.currency ?? "PKR")}
        </span>
      ),
      align: "right",
    },
    {
      key: "status",
      label: "Status",
      render: (p) => <StatusBadge status={p.status} />,
      align: "center",
    },
  ];

  return (
    <PayrollLayout activeTab="/payroll/payslips">
      <BackendStatusBanner status={status} />

      <DataTable
        columns={columns}
        rows={paged}
        rowKey={(p) => p.payslip_id}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name or code…"
        emptyIcon={ReceiptText}
        emptyTitle="No payslips yet"
        emptyDescription="Process a pay period to generate payslips — they'll appear here for the whole organization."
        page={page}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[10, 25, 50]}
        total={total}
        onPageChange={setPage}
        toolbarRight={
          <div className="flex flex-wrap items-center gap-2">
            <select
              className={selectClass}
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
              aria-label="Filter by period"
            >
              <option value="">All periods</option>
              {periods.map((p) => (
                <option key={p.period_id} value={p.period_id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              className={selectClass}
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              aria-label="Filter by employee"
            >
              <option value="">All employees</option>
              {employees.map((e) => (
                <option key={e.employeeId} value={e.employeeId}>
                  {e.firstName} {e.lastName}
                </option>
              ))}
            </select>
          </div>
        }
        actions={(p) => (
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setSelected(p)}
              aria-label="View payslip"
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <Eye size={15} />
            </button>
            <button
              type="button"
              onClick={() => handleDownload(p)}
              disabled={downloadingId === p.payslip_id}
              aria-label="Download payslip"
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-brand-light hover:text-brand-dark disabled:opacity-50"
            >
              <Download size={15} />
            </button>
          </div>
        )}
      />

      {/* Breakdown modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? employeeName(selected, employeeById) : ""}
        description={
          selected
            ? `${periodName(selected, periodById)} · ${humanize(selected.status)}`
            : undefined
        }
        maxWidth="max-w-lg"
      >
        {selected && (
          <div>
            {(() => {
              const { earnings, deductions } = splitLines(selected);
              const currency = selected.calculation_json?.currency ?? "PKR";
              return (
                <>
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <div>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                        Earnings
                      </h4>
                      {earnings.length === 0 ? (
                        <p className="text-sm text-gray-400">None</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {earnings.map((l) => (
                            <li key={`${l.component_id}-${l.label}`} className="flex justify-between text-sm">
                              <span className="text-gray-600">{l.label}</span>
                              <span className="font-medium text-emerald-700 tabular-nums">
                                {money(l.amount, currency)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-600">
                        Deductions
                      </h4>
                      {deductions.length === 0 ? (
                        <p className="text-sm text-gray-400">None</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {deductions.map((l) => (
                            <li key={`${l.component_id}-${l.label}`} className="flex justify-between text-sm">
                              <span className="text-gray-600">{l.label}</span>
                              <span className="font-medium text-rose-600 tabular-nums">
                                −{money(Math.abs(l.amount), currency)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4">
                    <span className="text-sm font-semibold text-gray-900">Net Payable</span>
                    <span className="text-lg font-semibold text-brand-dark">
                      {money(selected.net_salary, currency)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDownload(selected)}
                    disabled={downloadingId === selected.payslip_id}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand-dark py-3 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:opacity-50"
                  >
                    <Download size={16} />
                    {downloadingId === selected.payslip_id ? "Preparing…" : "Download Payslip"}
                  </button>
                </>
              );
            })()}
          </div>
        )}
      </Modal>
    </PayrollLayout>
  );
}
