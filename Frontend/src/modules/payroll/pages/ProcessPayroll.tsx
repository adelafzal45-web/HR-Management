import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Banknote, CheckSquare, Square, Download, Wallet, Users, FileCheck2, Clock3 } from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import StatusBadge from "@/components/common/StatusBadge";
import EmptyState from "@/components/common/EmptyState";
import Modal from "@/components/dialogs/Modal";
import { PrimaryButton } from "@/components/forms/FormField";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import { useBranding } from "@/app/providers/BrandingContext";
import { adminPayrollApi, type AdminPayrollRecord } from "@/modules/settings/api/adminOpsApi";
import { employeesApi, type Employee } from "@/modules/employees/api/employeeApi";
import { departmentsApi, type Department } from "@/modules/settings/api/settingsApi";
import { standardPayrollComponents } from "@/modules/payroll/api/payrollAdapter";
import { monthLabel } from "@/api/hrApi";
import { useAuth } from "@/app/providers/AuthContext";
import { downloadPayslipPdf, resolveLogoDataUrl, formatEmploymentType, formatJoiningDate } from "@/modules/payroll/utils/payslipPdf";

function money(n: number) {
  return `PKR ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);
const now = new Date();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 3 + i);

type BulkMode = "standard" | "custom";

export default function ProcessPayrollPage() {
  const status = useBackendStatus();
  const toast = useToast();
  const { branding } = useBranding();
  const { user } = useAuth();
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>();

  useEffect(() => {
    let active = true;
    resolveLogoDataUrl(branding.logoUrl).then((url) => active && setLogoDataUrl(url));
    return () => {
      active = false;
    };
  }, [branding.logoUrl]);

  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [periodRecords, setPeriodRecords] = useState<AdminPayrollRecord[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingPeriod, setLoadingPeriod] = useState(true);

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [singleTarget, setSingleTarget] = useState<Employee | null>(null);
  const [singleForm, setSingleForm] = useState({ basic: 0, allowance: 0, bonus: 0, deduction: 0, tax: 0, markPaid: false });
  const [singleError, setSingleError] = useState<string | null>(null);
  const [singleSubmitting, setSingleSubmitting] = useState(false);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<BulkMode>("standard");
  const [bulkCustom, setBulkCustom] = useState({ allowance: 0, bonus: 0, deduction: 0, tax: 0 });
  const [bulkMarkPaid, setBulkMarkPaid] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  // ---- Load employees + departments once ---------------------------------
  useEffect(() => {
    employeesApi
      .list({ pageSize: 500, status: "active" })
      .then((res) => setEmployees(res.data))
      .catch(() => toast.showError("Couldn't load employees."))
      .finally(() => setLoadingEmployees(false));
    departmentsApi
      .listAll()
      .then((res) => setDepartments(res.data))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Reload payroll rows for the selected period ------------------------
  const loadPeriod = () => {
    setLoadingPeriod(true);
    adminPayrollApi
      .list({ month, year, pageSize: 1000 })
      .then((res) => setPeriodRecords(res.data))
      .catch(() => toast.showError("Couldn't load payroll for this period."))
      .finally(() => setLoadingPeriod(false));
  };

  useEffect(() => {
    loadPeriod();
    setSelected(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year]);

  const recordByEmployee = useMemo(() => {
    const map = new Map<string, AdminPayrollRecord>();
    periodRecords.forEach((r) => map.set(r.employeeId, r));
    return map;
  }, [periodRecords]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      const matchesDept = !departmentFilter || e.departmentId === departmentFilter;
      const matchesSearch =
        !q ||
        `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
        e.employeeCode.toLowerCase().includes(q) ||
        e.departmentName.toLowerCase().includes(q);
      return matchesDept && matchesSearch;
    });
  }, [employees, search, departmentFilter]);

  const processedCount = filteredEmployees.filter((e) => recordByEmployee.get(e.employeeId)?.status === "Generated").length;
  const pendingCount = filteredEmployees.length - processedCount;
  const totalPayout = filteredEmployees.reduce((sum, e) => sum + (recordByEmployee.get(e.employeeId)?.netSalary ?? 0), 0);

  const selectableIds = filteredEmployees.filter((e) => !recordByEmployee.get(e.employeeId)).map((e) => e.employeeId);
  const allSelectableChecked = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const toggleAll = () => {
    setSelected(() => {
      if (allSelectableChecked) return new Set();
      return new Set(selectableIds);
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ---- Single processing ---------------------------------------------------
  const openSingle = (employee: Employee) => {
    const std = standardPayrollComponents(employee.salary);
    setSingleTarget(employee);
    setSingleForm({ basic: employee.salary, allowance: std.allowance, bonus: 0, deduction: std.deduction, tax: std.tax, markPaid: false });
    setSingleError(null);
  };

  const submitSingle = async (e: FormEvent) => {
    e.preventDefault();
    if (!singleTarget) return;
    setSingleError(null);
    if (singleForm.basic <= 0) {
      setSingleError("Basic salary must be greater than zero.");
      return;
    }
    if (recordByEmployee.get(singleTarget.employeeId)) {
      setSingleError("A payslip for this employee and period has already been generated.");
      return;
    }
    setSingleSubmitting(true);
    try {
      const paymentDate = singleForm.markPaid ? new Date(year, month - 1, 6).toISOString().slice(0, 10) : null;
      await adminPayrollApi.generate(singleTarget.employeeId, {
        month,
        year,
        basicSalary: singleForm.basic,
        allowance: singleForm.allowance,
        bonus: singleForm.bonus,
        deduction: singleForm.deduction,
        tax: singleForm.tax,
        paymentDate,
      });
      toast.showSuccess(`Payslip generated for ${singleTarget.firstName} ${singleTarget.lastName}.`);
      setSingleTarget(null);
      loadPeriod();
    } catch (err) {
      setSingleError(err instanceof Error ? err.message : "Couldn't generate the payslip.");
    } finally {
      setSingleSubmitting(false);
    }
  };

  // ---- Bulk processing -------------------------------------------------------
  const openBulk = () => {
    setBulkMode("standard");
    setBulkCustom({ allowance: 0, bonus: 0, deduction: 0, tax: 0 });
    setBulkMarkPaid(false);
    setBulkOpen(true);
  };

  const submitBulk = async () => {
    const targets = employees.filter((e) => selected.has(e.employeeId) && !recordByEmployee.get(e.employeeId));
    if (targets.length === 0) {
      setBulkOpen(false);
      return;
    }
    setBulkSubmitting(true);
    setBulkProgress({ done: 0, total: targets.length });
    let succeeded = 0;
    let failed = 0;
    const paymentDate = bulkMarkPaid ? new Date(year, month - 1, 6).toISOString().slice(0, 10) : null;

    for (const emp of targets) {
      const comp = bulkMode === "standard" ? standardPayrollComponents(emp.salary) : bulkCustom;
      try {
        await adminPayrollApi.generate(emp.employeeId, {
          month,
          year,
          basicSalary: emp.salary,
          allowance: comp.allowance,
          bonus: bulkMode === "standard" ? 0 : bulkCustom.bonus,
          deduction: comp.deduction,
          tax: comp.tax,
          paymentDate,
        });
        succeeded += 1;
      } catch {
        failed += 1;
      }
      setBulkProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }

    setBulkSubmitting(false);
    setBulkProgress(null);
    setBulkOpen(false);
    setSelected(new Set());
    loadPeriod();

    if (failed === 0) {
      toast.showSuccess(`Payroll processed for ${succeeded} employee${succeeded === 1 ? "" : "s"}.`);
    } else {
      toast.showError(`${succeeded} processed, ${failed} failed. Try the failed ones individually.`);
    }
  };

  // ---- Download ---------------------------------------------------------------
  const downloadRow = (employee: Employee, r: AdminPayrollRecord) => {
    const generatedAt = new Date().toLocaleString();
    downloadPayslipPdf(
      {
        company: {
          name: branding.companyName || "TechnoCues HRMS",
          address: branding.address,
          email: branding.email,
          phone: branding.phone,
          website: branding.website,
          logoDataUrl,
        },
        employee: {
          name: `${employee.firstName} ${employee.lastName}`.trim(),
          code: employee.employeeCode,
          department: employee.departmentName,
          designation: employee.designationName,
          email: employee.email,
          shift: employee.shiftName,
          employmentType: formatEmploymentType(employee.employmentType),
          joiningDate: formatJoiningDate(employee.joiningDate),
        },
        period: monthLabel(r.payrollMonth, r.payrollYear),
        status: r.status,
        paymentDate: r.paymentDate,
        generatedDate: r.paymentDate ?? new Date().toISOString().slice(0, 10),
        earnings: [
          { label: "Basic Salary", amount: r.basicSalary },
          { label: "Allowance", amount: r.allowance },
          ...(r.bonus > 0 ? [{ label: "Bonus", amount: r.bonus }] : []),
        ],
        deductions: [
          { label: "Deduction", amount: r.deduction },
          { label: "Tax", amount: r.tax },
        ],
        netSalary: r.netSalary,
        payslipId: r.payrollId,
        generatedBy: user ? `${user.firstName} ${user.lastName}`.trim() : "HR System",
        generatedAt,
        verificationUrl: `${window.location.origin}/payroll?verify=${encodeURIComponent(r.payrollId)}`,
      },
      `payslip-${employee.employeeCode}-${r.payrollYear}-${String(r.payrollMonth).padStart(2, "0")}.pdf`,
    );
  };

  const loading = loadingEmployees || loadingPeriod;
  const bulkTargetCount = employees.filter((e) => selected.has(e.employeeId) && !recordByEmployee.get(e.employeeId)).length;
  const bulkPreviewTotal = employees
    .filter((e) => selected.has(e.employeeId) && !recordByEmployee.get(e.employeeId))
    .reduce((sum, e) => {
      const comp = bulkMode === "standard" ? standardPayrollComponents(e.salary) : bulkCustom;
      const bonus = bulkMode === "standard" ? 0 : bulkCustom.bonus;
      return sum + e.salary + comp.allowance + bonus - comp.deduction - comp.tax;
    }, 0);

  return (
    <DashboardLayout title="Process Payroll" activeKey="process-payroll">
      <BackendStatusBanner status={status} />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xl font-semibold tracking-tight text-brand-dark xs:text-2xl sm:text-3xl">{filteredEmployees.length}</span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-500 sm:h-11 sm:w-11">
              <Users size={20} />
            </span>
          </div>
          <p className="mt-2.5 text-xs font-medium text-gray-500 sm:mt-3.5 sm:text-sm">Employees in view</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xl font-semibold tracking-tight text-brand-dark xs:text-2xl sm:text-3xl">{processedCount}</span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-500 sm:h-11 sm:w-11">
              <FileCheck2 size={20} />
            </span>
          </div>
          <p className="mt-2.5 text-xs font-medium text-gray-500 sm:mt-3.5 sm:text-sm">Processed · {monthLabel(month, year)}</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xl font-semibold tracking-tight text-brand-dark xs:text-2xl sm:text-3xl">{pendingCount}</span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-500 sm:h-11 sm:w-11">
              <Clock3 size={20} />
            </span>
          </div>
          <p className="mt-2.5 text-xs font-medium text-gray-500 sm:mt-3.5 sm:text-sm">Pending</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 truncate text-xl font-semibold tracking-tight text-brand-dark xs:text-2xl sm:text-3xl">{money(totalPayout)}</span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-500 sm:h-11 sm:w-11">
              <Wallet size={20} />
            </span>
          </div>
          <p className="mt-2.5 text-xs font-medium text-gray-500 sm:mt-3.5 sm:text-sm">Net payout so far</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              aria-label="Payroll month"
              className="min-h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/60"
            >
              {MONTH_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m, year).split(" ")[0]}
                </option>
              ))}
            </select>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              aria-label="Payroll year"
              className="min-h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/60"
            >
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee…"
              aria-label="Search employee"
              className="min-h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60 sm:w-48"
            />
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              aria-label="Filter by department"
              className="min-h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/60"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.departmentId} value={d.departmentId}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={openBulk}
            disabled={selected.size === 0}
            className="flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Banknote size={16} /> Process Selected ({selected.size})
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-3 p-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={Wallet} title="No employees found" description="Try adjusting your search or department filter." />
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className="w-10 px-4 py-3.5">
                      <button
                        type="button"
                        onClick={toggleAll}
                        disabled={selectableIds.length === 0}
                        aria-label={allSelectableChecked ? "Clear selection" : "Select all unprocessed"}
                        className="flex items-center text-gray-400 hover:text-brand-dark disabled:opacity-30"
                      >
                        {allSelectableChecked ? <CheckSquare size={17} /> : <Square size={17} />}
                      </button>
                    </th>
                    <th className="px-4 py-3.5 font-semibold">Employee</th>
                    <th className="px-4 py-3.5 font-semibold">Department</th>
                    <th className="px-4 py-3.5 font-semibold">Basic Salary</th>
                    <th className="px-4 py-3.5 font-semibold">Status</th>
                    <th className="px-4 py-3.5 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map((emp, i) => {
                    const record = recordByEmployee.get(emp.employeeId);
                    return (
                      <tr
                        key={emp.employeeId}
                        className={`border-b border-gray-50 transition-colors last:border-0 hover:bg-brand-light/20 ${i % 2 === 1 ? "bg-gray-50/40" : "bg-white"}`}
                      >
                        <td className="px-4 py-3.5 align-middle">
                          <button
                            type="button"
                            onClick={() => toggleOne(emp.employeeId)}
                            disabled={!!record}
                            aria-label={selected.has(emp.employeeId) ? `Deselect ${emp.firstName}` : `Select ${emp.firstName}`}
                            className="flex items-center text-gray-400 hover:text-brand-dark disabled:opacity-30"
                          >
                            {selected.has(emp.employeeId) ? <CheckSquare size={17} /> : <Square size={17} />}
                          </button>
                        </td>
                        <td className="px-4 py-3.5 align-middle">
                          <p className="truncate font-medium text-gray-900">
                            {emp.firstName} {emp.lastName}
                          </p>
                          <p className="truncate text-xs text-gray-400">{emp.employeeCode}</p>
                        </td>
                        <td className="px-4 py-3.5 align-middle text-gray-700">{emp.departmentName}</td>
                        <td className="px-4 py-3.5 align-middle text-gray-700">{money(emp.salary)}</td>
                        <td className="px-4 py-3.5 align-middle">
                          <StatusBadge status={record?.status ?? "Pending"} />
                        </td>
                        <td className="px-4 py-3.5 text-right align-middle">
                          <div className="flex justify-end gap-1">
                            {record?.status === "Generated" ? (
                              <button
                                type="button"
                                onClick={() => downloadRow(emp, record)}
                                aria-label={`Download payslip PDF for ${emp.firstName} ${emp.lastName}`}
                                className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                              >
                                <Download size={16} />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openSingle(emp)}
                                className="flex min-h-9 items-center gap-1 rounded-full border border-gray-200 px-3 text-xs font-semibold text-gray-600 transition hover:border-brand hover:text-brand-dark"
                              >
                                <Banknote size={13} /> Process
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="divide-y divide-gray-50 sm:hidden">
              {filteredEmployees.map((emp) => {
                const record = recordByEmployee.get(emp.employeeId);
                return (
                  <div key={emp.employeeId} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => toggleOne(emp.employeeId)}
                        disabled={!!record}
                        aria-label={selected.has(emp.employeeId) ? `Deselect ${emp.firstName}` : `Select ${emp.firstName}`}
                        className="mt-0.5 flex shrink-0 items-center text-gray-400 disabled:opacity-30"
                      >
                        {selected.has(emp.employeeId) ? <CheckSquare size={17} /> : <Square size={17} />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-gray-900">
                          {emp.firstName} {emp.lastName}
                        </p>
                        <p className="truncate text-xs text-gray-400">
                          {emp.employeeCode} · {emp.departmentName}
                        </p>
                      </div>
                      <StatusBadge status={record?.status ?? "Pending"} />
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm text-gray-600">{money(emp.salary)}</span>
                      {record?.status === "Generated" ? (
                        <button
                          type="button"
                          onClick={() => downloadRow(emp, record)}
                          className="flex min-h-9 items-center gap-1 rounded-full border border-gray-200 px-3 text-xs font-semibold text-gray-600"
                        >
                          <Download size={13} /> PDF
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openSingle(emp)}
                          className="flex min-h-9 items-center gap-1 rounded-full border border-gray-200 px-3 text-xs font-semibold text-gray-600"
                        >
                          <Banknote size={13} /> Process
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Single-employee modal */}
      <Modal
        open={!!singleTarget}
        title="Process Payroll"
        description={singleTarget ? `${singleTarget.firstName} ${singleTarget.lastName} · ${monthLabel(month, year)}` : undefined}
        onClose={() => setSingleTarget(null)}
      >
        {singleTarget && (
          <form onSubmit={submitSingle}>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Basic Salary</span>
                <input
                  type="number"
                  value={singleForm.basic}
                  onChange={(e) => setSingleForm((f) => ({ ...f, basic: Number(e.target.value) }))}
                  className="w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Allowance</span>
                <input
                  type="number"
                  value={singleForm.allowance}
                  onChange={(e) => setSingleForm((f) => ({ ...f, allowance: Number(e.target.value) }))}
                  className="w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
                />
              </label>
            </div>
            <div className="mb-4 grid grid-cols-3 gap-3">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Bonus</span>
                <input
                  type="number"
                  value={singleForm.bonus}
                  onChange={(e) => setSingleForm((f) => ({ ...f, bonus: Number(e.target.value) }))}
                  className="w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Deduction</span>
                <input
                  type="number"
                  value={singleForm.deduction}
                  onChange={(e) => setSingleForm((f) => ({ ...f, deduction: Number(e.target.value) }))}
                  className="w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Tax</span>
                <input
                  type="number"
                  value={singleForm.tax}
                  onChange={(e) => setSingleForm((f) => ({ ...f, tax: Number(e.target.value) }))}
                  className="w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
                />
              </label>
            </div>
            <label className="mb-4 flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={singleForm.markPaid}
                onChange={(e) => setSingleForm((f) => ({ ...f, markPaid: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300"
              />
              Mark as paid (sets a payment date)
            </label>
            <div className="mb-5 flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
              <span className="text-sm font-semibold text-gray-900">Net Salary</span>
              <span className="text-base font-semibold text-brand-dark">
                {money(singleForm.basic + singleForm.allowance + singleForm.bonus - singleForm.deduction - singleForm.tax)}
              </span>
            </div>
            {singleError && <p className="mb-4 text-sm text-rose-600">{singleError}</p>}
            <PrimaryButton type="submit" loading={singleSubmitting}>
              Generate Payslip
            </PrimaryButton>
          </form>
        )}
      </Modal>

      {/* Bulk modal */}
      <Modal
        open={bulkOpen}
        title="Process Payroll — Bulk"
        description={`${bulkTargetCount} employee${bulkTargetCount === 1 ? "" : "s"} selected · ${monthLabel(month, year)}`}
        onClose={() => !bulkSubmitting && setBulkOpen(false)}
      >
        <div>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setBulkMode("standard")}
              className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                bulkMode === "standard" ? "border-brand bg-brand-light/40 text-brand-dark" : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              <span className="block font-semibold">Standard formula</span>
              <span className="mt-0.5 block text-xs opacity-80">Allowance 10% · Deduction 2% · Tax 8% of each employee's basic salary</span>
            </button>
            <button
              type="button"
              onClick={() => setBulkMode("custom")}
              className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                bulkMode === "custom" ? "border-brand bg-brand-light/40 text-brand-dark" : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              <span className="block font-semibold">Custom amounts</span>
              <span className="mt-0.5 block text-xs opacity-80">Apply the same flat amounts to every selected employee</span>
            </button>
          </div>

          {bulkMode === "custom" && (
            <div className="mb-4 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Allowance</span>
                <input
                  type="number"
                  value={bulkCustom.allowance}
                  onChange={(e) => setBulkCustom((f) => ({ ...f, allowance: Number(e.target.value) }))}
                  className="w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Bonus</span>
                <input
                  type="number"
                  value={bulkCustom.bonus}
                  onChange={(e) => setBulkCustom((f) => ({ ...f, bonus: Number(e.target.value) }))}
                  className="w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Deduction</span>
                <input
                  type="number"
                  value={bulkCustom.deduction}
                  onChange={(e) => setBulkCustom((f) => ({ ...f, deduction: Number(e.target.value) }))}
                  className="w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Tax</span>
                <input
                  type="number"
                  value={bulkCustom.tax}
                  onChange={(e) => setBulkCustom((f) => ({ ...f, tax: Number(e.target.value) }))}
                  className="w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
                />
              </label>
            </div>
          )}

          <label className="mb-4 flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={bulkMarkPaid}
              onChange={(e) => setBulkMarkPaid(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Mark all as paid (sets a payment date)
          </label>

          <div className="mb-5 flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
            <span className="text-sm font-semibold text-gray-900">Estimated Total Payout</span>
            <span className="text-base font-semibold text-brand-dark">{money(bulkPreviewTotal)}</span>
          </div>

          {bulkSubmitting && bulkProgress && (
            <div className="mb-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand to-brand-dark transition-all"
                  style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Processing {bulkProgress.done} of {bulkProgress.total}…
              </p>
            </div>
          )}

          <PrimaryButton type="button" onClick={submitBulk} loading={bulkSubmitting} disabled={bulkTargetCount === 0}>
            Process {bulkTargetCount} Payslip{bulkTargetCount === 1 ? "" : "s"}
          </PrimaryButton>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
