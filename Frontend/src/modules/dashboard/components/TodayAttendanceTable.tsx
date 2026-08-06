import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import Can from "@/components/permission/Can";
import DataTable, { type DataTableColumn } from "@/components/tables/DataTable";
import StatusBadge from "@/components/common/StatusBadge";
import { adminAttendanceApi, type AdminAttendanceRecord, type AdminAttendanceStatus } from "@/modules/settings/api/adminOpsApi";
import { departmentsApi, type Department } from "@/modules/settings/api/settingsApi";

const STATUS_OPTIONS: AdminAttendanceStatus[] = ["Present", "Late", "Half-Day", "Absent", "On Leave", "Leave", "Holiday"];

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function TodayAttendanceTable() {
  const [rows, setRows] = useState<AdminAttendanceRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<AdminAttendanceStatus | "">("");
  const [departments, setDepartments] = useState<Department[]>([]);

  const load = () => {
    setLoading(true);
    adminAttendanceApi
      .list({ search, page, pageSize, departmentId: departmentFilter, status: statusFilter, date: todayIso() })
      .then((res) => {
        setRows(res.data);
        setTotal(res.total);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page, pageSize, departmentFilter, statusFilter]);

  useEffect(() => setPage(1), [search, pageSize, departmentFilter, statusFilter]);

  useEffect(() => {
    departmentsApi.listAll().then((res) => setDepartments(res.data)).catch(() => undefined);
  }, []);

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
    { key: "shift", label: "Shift", render: (r) => r.shiftName || "—", hideBelow: "lg" },
    { key: "checkIn", label: "Check-in", render: (r) => r.checkIn ?? "—" },
    { key: "checkOut", label: "Check-out", render: (r) => r.checkOut ?? "—" },
    { key: "hours", label: "Hours", render: (r) => (r.workingHours != null ? r.workingHours.toFixed(1) : "—"), hideBelow: "xl" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <Can permission="attendance.view">
      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-gray-900 sm:text-lg">Today's Attendance</h3>
          <span className="rounded-full bg-brand-light px-3 py-1 text-xs font-semibold text-brand-dark">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          </span>
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.attendanceId}
          loading={loading}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by employee…"
          emptyIcon={CalendarClock}
          emptyTitle="No attendance records for today"
          emptyDescription="Check back once check-ins start coming in."
          page={page}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[10, 25, 50]}
          total={total}
          onPageChange={setPage}
          toolbarRight={
            <div className="flex flex-wrap items-center gap-2">
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
        />
      </section>
    </Can>
  );
}
