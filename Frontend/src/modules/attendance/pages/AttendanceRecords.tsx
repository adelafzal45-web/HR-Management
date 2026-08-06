import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarClock, Pencil, Plus, Download } from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import DataTable, { type DataTableColumn } from "@/components/tables/DataTable";
import Modal from "@/components/dialogs/Modal";
import StatusBadge from "@/components/common/StatusBadge";
import SectionTabs from "@/components/common/SectionTabs";
import { PrimaryButton } from "@/components/forms/FormField";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import { useAuth } from "@/app/providers/AuthContext";
import { getAttendanceTabs } from "@/config/featureTabs";
import { adminAttendanceApi, type AdminAttendanceRecord, type AdminAttendanceStatus } from "@/modules/settings/api/adminOpsApi";
import { departmentsApi, type Department } from "@/modules/settings/api/settingsApi";
import { employeesApi, type Employee } from "@/modules/employees/api/employeeApi";
import AttendanceSummaryCards from "@/modules/attendance/components/AttendanceSummaryCards";
import MarkAttendanceModal from "@/modules/attendance/components/MarkAttendanceModal";
import { punctualityBadges, punctualityText } from "@/modules/attendance/utils/punctuality";

const STATUS_OPTIONS: AdminAttendanceStatus[] = ["Present", "Late", "Half-Day", "Absent", "On Leave", "Leave", "Holiday"];
const WORKING_STATUSES: AdminAttendanceStatus[] = ["Present", "Late", "Half-Day"];

type FormState = { checkIn: string; checkOut: string; status: AdminAttendanceStatus };

const PUNCT_TONE: Record<"warn" | "info" | "muted", string> = {
 warn: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
 info: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
 muted: "bg-gray-100 text-gray-600",
};

const fmtDate = (iso: string) =>
 new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

// Proper RFC-4180-ish CSV: comma-separated, newline-delimited, quotes doubled.
// (The shared utils/csv.ts uses a space-delimited variant tuned to the
// employees import round-trip, which Excel won't open as rows.)
function buildCsv(headers: string[], rows: string[][]): string {
 const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
 return [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

function downloadCsv(filename: string, csv: string) {
 // Prepend a BOM so Excel reads UTF-8 correctly.
 const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
 const url = URL.createObjectURL(blob);
 const link = document.createElement("a");
 link.href = url;
 link.download = filename;
 document.body.appendChild(link);
 link.click();
 document.body.removeChild(link);
 URL.revokeObjectURL(url);
}

export default function AttendanceRecordsPage() {
 const status = useBackendStatus();
 const toast = useToast();
 const { user } = useAuth();
 const tabs = getAttendanceTabs(user?.role);

 const [rows, setRows] = useState<AdminAttendanceRecord[]>([]);
 const [total, setTotal] = useState(0);
 const [loading, setLoading] = useState(true);
 const [search, setSearch] = useState("");
 const [page, setPage] = useState(1);
 const [pageSize, setPageSize] = useState(10);
 const [departmentFilter, setDepartmentFilter] = useState("");
 const [employeeFilter, setEmployeeFilter] = useState("");
 const [statusFilter, setStatusFilter] = useState<AdminAttendanceStatus | "">("");
 const [dateFilter, setDateFilter] = useState("");

 const [departments, setDepartments] = useState<Department[]>([]);
 const [employees, setEmployees] = useState<Employee[]>([]);

 const [editing, setEditing] = useState<AdminAttendanceRecord | null>(null);
 const [form, setForm] = useState<FormState>({ checkIn: "", checkOut: "", status: "Present" });
 const [formError, setFormError] = useState<string | null>(null);
 const [saving, setSaving] = useState(false);

 const [markOpen, setMarkOpen] = useState(false);
 const [exporting, setExporting] = useState(false);

 const listParams = useMemo(
 () => ({
 search,
 departmentId: departmentFilter,
 employeeId: employeeFilter,
 status: statusFilter,
 date: dateFilter,
 }),
 [search, departmentFilter, employeeFilter, statusFilter, dateFilter],
 );

 const load = () => {
 setLoading(true);
 adminAttendanceApi
 .list({ ...listParams, page, pageSize })
 .then((res) => {
 setRows(res.data);
 setTotal(res.total);
 })
 .catch(() => toast.showError("Couldn't load attendance records."))
 .finally(() => setLoading(false));
 };

 useEffect(() => {
 load();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [search, page, pageSize, departmentFilter, employeeFilter, statusFilter, dateFilter]);

 useEffect(() => setPage(1), [search, pageSize, departmentFilter, employeeFilter, statusFilter, dateFilter]);

 useEffect(() => {
 departmentsApi.listAll().then((res) => setDepartments(res.data)).catch(() => undefined);
 employeesApi.list({ pageSize: 200 }).then((res) => setEmployees(res.data)).catch(() => undefined);
 }, []);

 // The DataTable's unified filter is keyed by column key; map that record to
 // and from the page's individual filter state.
 const columnFilters = useMemo(
 () => ({ department: departmentFilter, employee: employeeFilter, status: statusFilter }),
 [departmentFilter, employeeFilter, statusFilter],
 );

 const handleFiltersChange = (next: Record<string, string>) => {
 setDepartmentFilter(next.department ?? "");
 setEmployeeFilter(next.employee ?? "");
 setStatusFilter((next.status ?? "") as AdminAttendanceStatus | "");
 };

 const clearExtraFilters = () => setDateFilter("");
 const extraFilterCount = dateFilter ? 1 : 0;

 const openCorrect = (record: AdminAttendanceRecord) => {
 setEditing(record);
 setForm({ checkIn: record.checkIn ?? "", checkOut: record.checkOut ?? "", status: record.status });
 setFormError(null);
 };

 const handleSubmit = async (e: FormEvent) => {
 e.preventDefault();
 if (!editing) return;

 const needsTimes = WORKING_STATUSES.includes(form.status);
 if (needsTimes && (!form.checkIn || !form.checkOut)) {
 setFormError("Check-in and check-out are required for Present/Late records.");
 return;
 }
 if (form.checkIn && form.checkOut && form.checkOut <= form.checkIn) {
 setFormError("Check-out must be after check-in.");
 return;
 }

 setSaving(true);
 setFormError(null);
 try {
 await adminAttendanceApi.correct(editing.attendanceId, {
 checkIn: needsTimes ? form.checkIn : null,
 checkOut: needsTimes ? form.checkOut : null,
 status: form.status,
 });
 toast.showSuccess("Attendance record updated.");
 setEditing(null);
 load();
 } catch (err) {
 setFormError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
 } finally {
 setSaving(false);
 }
 };

 // Export every row matching the current filters (not just the visible page):
 // fetch with pageSize 0 so the API returns the full filtered set.
 const handleExport = async () => {
 setExporting(true);
 try {
 const res = await adminAttendanceApi.list({ ...listParams, page: 1, pageSize: 0 });
 if (res.data.length === 0) {
 toast.showError("No records to export for the current filters.");
 return;
 }
 const headers = [
 "Employee",
 "Employee Code",
 "Department",
 "Shift",
 "Date",
 "Check-in",
 "Check-out",
 "Working Hours",
 "Status",
 "Punctuality",
 ];
 const body = res.data.map((r) => [
 r.employeeName,
 r.employeeCode,
 r.departmentName,
 r.shiftName ?? "",
 r.attendanceDate,
 r.checkIn ?? "",
 r.checkOut ?? "",
 r.workingHours != null ? r.workingHours.toFixed(2) : "",
 r.status,
 punctualityText(r),
 ]);
 const stamp = new Date().toISOString().slice(0, 10);
 downloadCsv(`attendance-records-${stamp}.csv`, buildCsv(headers, body));
 toast.showSuccess(`Exported ${res.data.length} record${res.data.length === 1 ? "" : "s"}.`);
 } catch {
 toast.showError("Couldn't export attendance records.");
 } finally {
 setExporting(false);
 }
 };

 const columns: DataTableColumn<AdminAttendanceRecord>[] = [
 {
 key: "employee",
 label: "Employee",
 render: (r) => (
 <div className="min-w-0">
 <p className="truncate font-medium text-gray-900">{r.employeeName}</p>
 <p className="truncate text-xs text-gray-400">{r.employeeCode}</p>
 </div>
 ),
 },
 {
 key: "department",
 label: "Department",
 render: (r) => r.departmentName,
 hideBelow: "md",
 filterable: true,
 filterOptions: departments.map((d) => ({ value: d.departmentId, label: d.name })),
 filterPlaceholder: "All departments",
 },
 {
 key: "date",
 label: "Date",
 render: (r) => fmtDate(r.attendanceDate),
 },
 { key: "checkIn", label: "Check-in", render: (r) => r.checkIn ?? "—", hideBelow: "lg" },
 { key: "checkOut", label: "Check-out", render: (r) => r.checkOut ?? "—", hideBelow: "lg" },
 { key: "hours", label: "Hours", render: (r) => (r.workingHours != null ? r.workingHours.toFixed(1) : "—"), hideBelow: "xl" },
 {
 key: "status",
 label: "Status",
 render: (r) => {
 const badges = punctualityBadges(r);
 return (
 <div className="flex flex-col items-start gap-1">
 <StatusBadge status={r.status} />
 {badges.map((b) => (
 <span
 key={b.label}
 title={b.title}
 className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${PUNCT_TONE[b.tone]}`}
 >
 {b.label}
 </span>
 ))}
 </div>
 );
 },
 },
 ];

 // The employee dropdown lives in the unified filter's extraFilters slot (it
 // has no matching table column), so pass the columns straight through.

 return (
 <DashboardLayout title="Attendance Records" activeKey="attendance">
 <BackendStatusBanner status={status} />
 <SectionTabs tabs={tabs} active="employee-attendance" />

 <AttendanceSummaryCards departmentId={departmentFilter} employeeId={employeeFilter} />

 <DataTable
 columns={columns}
 rows={rows}
 rowKey={(r) => r.attendanceId}
 loading={loading}
 search={search}
 onSearchChange={setSearch}
 searchPlaceholder="Search by employee…"
 emptyIcon={CalendarClock}
 emptyTitle="No attendance records found"
 emptyDescription="Try adjusting your filters."
 page={page}
 pageSize={pageSize}
 onPageSizeChange={setPageSize}
 pageSizeOptions={[10, 25, 50]}
 total={total}
 onPageChange={setPage}
 unifiedFilter
 filters={columnFilters}
 onFiltersChange={handleFiltersChange}
 extraFilterCount={extraFilterCount}
 onClearExtraFilters={clearExtraFilters}
 extraFilters={
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 <label className="block">
 <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">Employee</span>
 <select
 value={employeeFilter}
 onChange={(e) => setEmployeeFilter(e.target.value)}
 className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/60"
 >
 <option value="">All employees</option>
 {employees.map((e) => (
 <option key={e.employeeId} value={e.employeeId}>
 {e.firstName} {e.lastName}
 </option>
 ))}
 </select>
 </label>
 <label className="block">
 <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">Date</span>
 <input
 type="date"
 value={dateFilter}
 onChange={(e) => setDateFilter(e.target.value)}
 className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/60"
 />
 </label>
 </div>
 }
 toolbarRight={
 <>
 <button
 type="button"
 onClick={handleExport}
 disabled={exporting}
 className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-brand/60 hover:text-brand-dark disabled:opacity-50"
 >
 <Download size={15} />
 {exporting ? "Exporting…" : "Export CSV"}
 </button>
 <button
 type="button"
 onClick={() => setMarkOpen(true)}
 className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-brand to-brand-dark px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
 >
 <Plus size={15} />
 Mark Attendance
 </button>
 </>
 }
 actions={(r) => (
 <div className="flex items-center justify-end">
 <button
 type="button"
 onClick={() => openCorrect(r)}
 aria-label={`Correct attendance for ${r.employeeName} on ${r.attendanceDate}`}
 className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
 >
 <Pencil size={15} />
 </button>
 </div>
 )}
 />

 <MarkAttendanceModal
 open={markOpen}
 onClose={() => setMarkOpen(false)}
 onMarked={load}
 departments={departments}
 employees={employees}
 />

 <Modal
 open={!!editing}
 onClose={() => setEditing(null)}
 title="Correct Attendance Record"
 description={editing ? `${editing.employeeName} · ${fmtDate(editing.attendanceDate)}` : undefined}
 >
 <form onSubmit={handleSubmit}>
 <label className="mb-5 block">
 <span className="mb-2 block text-[15px] font-medium text-gray-900">Status</span>
 <select
 value={form.status}
 onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as AdminAttendanceStatus }))}
 className="w-full rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
 >
 {STATUS_OPTIONS.map((s) => (
 <option key={s} value={s}>
 {s}
 </option>
 ))}
 </select>
 </label>

 {WORKING_STATUSES.includes(form.status) && (
 <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
 <label className="mb-5 block">
 <span className="mb-2 block text-[15px] font-medium text-gray-900">Check-in</span>
 <input
 type="time"
 value={form.checkIn}
 onChange={(e) => setForm((f) => ({ ...f, checkIn: e.target.value }))}
 className="w-full rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
 />
 </label>
 <label className="mb-5 block">
 <span className="mb-2 block text-[15px] font-medium text-gray-900">Check-out</span>
 <input
 type="time"
 value={form.checkOut}
 onChange={(e) => setForm((f) => ({ ...f, checkOut: e.target.value }))}
 className="w-full rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
 />
 </label>
 </div>
 )}

 {formError && <p className="mb-4 text-sm text-red-500">{formError}</p>}

 <div className="flex flex-col-reverse gap-2.5 xs:flex-row">
 <button
 type="button"
 onClick={() => setEditing(null)}
 className="min-h-11 flex-1 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
 >
 Cancel
 </button>
 <div className="flex-1">
 <PrimaryButton type="submit" loading={saving}>
 Save Correction
 </PrimaryButton>
 </div>
 </div>
 </form>
 </Modal>
 </DashboardLayout>
 );
}
