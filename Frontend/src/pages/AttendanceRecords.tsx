import { useEffect, useState, type FormEvent } from "react";
import { CalendarClock, Pencil } from "lucide-react";
import DashboardLayout from "../components/dashboard/DashboardLayout";
import DataTable, { type DataTableColumn } from "../components/DataTable";
import Modal from "../components/Modal";
import StatusBadge from "../components/StatusBadge";
import { PrimaryButton } from "../components/FormField";
import BackendStatusBanner from "../components/BackendStatusBanner";
import { useBackendStatus } from "../hooks/useBackendStatus";
import { useToast } from "../lib/ToastContext";
import { adminAttendanceApi, type AdminAttendanceRecord, type AdminAttendanceStatus } from "../lib/adminOpsApi";
import { departmentsApi, type Department } from "../lib/settingsApi";

const STATUS_OPTIONS: AdminAttendanceStatus[] = ["Present", "Late", "Absent", "Leave", "Holiday"];

type FormState = { checkIn: string; checkOut: string; status: AdminAttendanceStatus };

export default function AttendanceRecordsPage() {
  const status = useBackendStatus();
  const toast = useToast();

  const [rows, setRows] = useState<AdminAttendanceRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<AdminAttendanceStatus | "">("");
  const [dateFilter, setDateFilter] = useState("");

  const [departments, setDepartments] = useState<Department[]>([]);

  const [editing, setEditing] = useState<AdminAttendanceRecord | null>(null);
  const [form, setForm] = useState<FormState>({ checkIn: "", checkOut: "", status: "Present" });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    adminAttendanceApi
      .list({ search, page, pageSize, departmentId: departmentFilter, status: statusFilter, date: dateFilter })
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
  }, [search, page, pageSize, departmentFilter, statusFilter, dateFilter]);

  useEffect(() => setPage(1), [search, pageSize, departmentFilter, statusFilter, dateFilter]);

  useEffect(() => {
    departmentsApi.listAll().then((res) => setDepartments(res.data)).catch(() => undefined);
  }, []);

  const openCorrect = (record: AdminAttendanceRecord) => {
    setEditing(record);
    setForm({ checkIn: record.checkIn ?? "", checkOut: record.checkOut ?? "", status: record.status });
    setFormError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;

    const needsTimes = form.status === "Present" || form.status === "Late";
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
    { key: "department", label: "Department", render: (r) => r.departmentName, hideBelow: "md" },
    {
      key: "date",
      label: "Date",
      render: (r) => new Date(r.attendanceDate).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }),
    },
    { key: "checkIn", label: "Check-in", render: (r) => r.checkIn ?? "—", hideBelow: "lg" },
    { key: "checkOut", label: "Check-out", render: (r) => r.checkOut ?? "—", hideBelow: "lg" },
    { key: "hours", label: "Hours", render: (r) => (r.workingHours != null ? r.workingHours.toFixed(1) : "—"), hideBelow: "xl" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <DashboardLayout title="Attendance Records" activeKey="attendance-records">
      <BackendStatusBanner status={status} />

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
        toolbarRight={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="min-h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/60"
              aria-label="Filter by date"
            />
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="min-h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/60"
              aria-label="Filter by department"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.departmentId} value={d.departmentId}>
                  {d.name}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AdminAttendanceStatus | "")}
              className="min-h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/60"
              aria-label="Filter by status"
            >
              <option value="">All Status</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
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

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Correct Attendance Record"
        description={editing ? `${editing.employeeName} · ${new Date(editing.attendanceDate).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}` : undefined}
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

          {(form.status === "Present" || form.status === "Late") && (
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
