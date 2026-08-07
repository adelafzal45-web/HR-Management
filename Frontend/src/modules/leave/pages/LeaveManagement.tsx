import { useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import DataTable, { type DataTableColumn, type SortDirection } from "@/components/tables/DataTable";
import StatusBadge from "@/components/common/StatusBadge";
import SectionTabs from "@/components/common/SectionTabs";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import { useAuth } from "@/app/providers/AuthContext";
import { getLeaveTabs } from "@/config/featureTabs";
import { exportExcel } from "@/utils/exportUtils";
import {
  leaveEntitlementsApi,
  type LeaveBalanceRow,
  type LeaveBalanceStatus,
} from "@/modules/leave/api/leaveEntitlementsApi";
import { departmentsApi, type Department } from "@/modules/settings/api/settingsApi";
import { leaveTypesApi } from "@/modules/settings/api/settingsApi";
import { employeesApi, type Employee } from "@/modules/employees/api/employeeApi";

type LeaveTypeOption = { leaveTypeId: string; leaveTypeName: string };

const STATUS_OPTIONS: { value: LeaveBalanceStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const EXPORT_COLUMNS = [
  { key: "employeeCode", label: "Employee Code" },
  { key: "employeeName", label: "Employee Name" },
  { key: "departmentName", label: "Department" },
  { key: "designationName", label: "Designation" },
  { key: "leaveTypeName", label: "Leave Type" },
  { key: "totalEntitlement", label: "Total Entitlement" },
  { key: "usedLeave", label: "Used Leave" },
  { key: "remainingLeave", label: "Remaining Leave" },
  { key: "pendingRequests", label: "Pending Requests" },
  { key: "status", label: "Status" },
];

// Proper RFC-4180-ish CSV: comma-separated, newline-delimited, quotes
// doubled. (utils/csv.ts's toCSV() is a space-delimited variant tuned to the
// employees import round-trip, which Excel won't open as rows.)
function buildCsv(columns: { key: string; label: string }[], rows: Array<Record<string, unknown>>): string {
  const esc = (v: unknown) => {
    const str = String(v ?? "");
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [columns.map((c) => esc(c.label)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => esc(row[c.key])).join(","));
  }
  return lines.join("\n");
}

function downloadCsv(filename: string, csv: string) {
  // Prepend a BOM so Excel reads UTF-8 correctly.
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// The backend caps `limit` at 100 per page — pulling "all filtered rows" for
// export means paging through until a page comes back short, capped so a
// runaway filter (or a very large org) can't loop indefinitely.
const EXPORT_PAGE_SIZE = 100;
const EXPORT_MAX_PAGES = 50;

export default function LeaveManagementPage() {
  const status = useBackendStatus();
  const toast = useToast();
  const { user } = useAuth();
  const tabs = getLeaveTabs(user?.role);

  const [rows, setRows] = useState<LeaveBalanceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [departmentFilter, setDepartmentFilter] = useState("");
  const [leaveTypeFilter, setLeaveTypeFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeaveBalanceStatus | "">("");
  const [minRemaining, setMinRemaining] = useState("");

  const [sortKey, setSortKey] = useState<string | null>("employee_name");
  const [sortDir, setSortDir] = useState<SortDirection>("ASC");

  const [departments, setDepartments] = useState<Department[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeOption[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [exporting, setExporting] = useState(false);

  const listParams = useMemo(
    () => ({
      search,
      departmentId: departmentFilter,
      leaveTypeId: leaveTypeFilter,
      employeeId: employeeFilter,
      status: statusFilter,
      sortBy: (sortKey ?? undefined) as
        | "employee_name"
        | "department"
        | "leave_type"
        | "remaining"
        | "status"
        | undefined,
      sortOrder: sortDir,
    }),
    [search, departmentFilter, leaveTypeFilter, employeeFilter, statusFilter, sortKey, sortDir],
  );

  const load = () => {
    setLoading(true);
    leaveEntitlementsApi
      .list({ ...listParams, page, pageSize })
      .then((res) => {
        // Remaining-balance floor has no server-side filter — applied here,
        // against the already-paged rows, so it composes with everything
        // else without a backend change.
        const filtered = minRemaining ? res.data.filter((r) => r.remainingLeave <= Number(minRemaining)) : res.data;
        setRows(filtered);
        setTotal(minRemaining ? filtered.length : res.total);
      })
      .catch(() => toast.showError("Couldn't load employee leave balances."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page, pageSize, departmentFilter, leaveTypeFilter, employeeFilter, statusFilter, minRemaining, sortKey, sortDir]);

  useEffect(
    () => setPage(1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, pageSize, departmentFilter, leaveTypeFilter, employeeFilter, statusFilter, minRemaining],
  );

  useEffect(() => {
    departmentsApi.listAll().then((res) => setDepartments(res.data)).catch(() => undefined);
    leaveTypesApi.listAll().then(setLeaveTypes).catch(() => undefined);
    employeesApi.list({ pageSize: 1000 }).then((res) => setEmployees(res.data)).catch(() => undefined);
  }, []);

  const columnFilters = useMemo(
    () => ({ department: departmentFilter, leaveType: leaveTypeFilter, status: statusFilter }),
    [departmentFilter, leaveTypeFilter, statusFilter],
  );

  const handleFiltersChange = (next: Record<string, string>) => {
    setDepartmentFilter(next.department ?? "");
    setLeaveTypeFilter(next.leaveType ?? "");
    setStatusFilter((next.status ?? "") as LeaveBalanceStatus | "");
  };

  const clearExtraFilters = () => {
    setEmployeeFilter("");
    setMinRemaining("");
  };
  const extraFilterCount = (employeeFilter ? 1 : 0) + (minRemaining ? 1 : 0);

  const handleSortChange = (key: string, dir: SortDirection) => {
    setSortKey(key);
    setSortDir(dir);
  };

  // Pull every row matching the current filters (paging through the
  // 100-row-max backend limit) rather than just the visible page.
  const fetchAllFiltered = async (): Promise<LeaveBalanceRow[]> => {
    const all: LeaveBalanceRow[] = [];
    for (let p = 1; p <= EXPORT_MAX_PAGES; p++) {
      const res = await leaveEntitlementsApi.list({ ...listParams, page: p, pageSize: EXPORT_PAGE_SIZE });
      all.push(...res.data);
      if (res.data.length < EXPORT_PAGE_SIZE || all.length >= res.total) break;
    }
    return minRemaining ? all.filter((r) => r.remainingLeave <= Number(minRemaining)) : all;
  };

  const handleExport = async (format: "csv" | "excel" | "json", scope: "page" | "all") => {
    setExporting(true);
    try {
      const exportRows = scope === "page" ? rows : await fetchAllFiltered();
      if (exportRows.length === 0) {
        toast.showError("No records to export for the current filters.");
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === "csv") {
        downloadCsv(`employee-leave-management-${stamp}.csv`, buildCsv(EXPORT_COLUMNS, exportRows));
      } else if (format === "excel") {
        exportExcel(`employee-leave-management-${stamp}`, EXPORT_COLUMNS, exportRows);
      } else {
        const blob = new Blob([JSON.stringify(exportRows, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `employee-leave-management-${stamp}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
      toast.showSuccess(`Exported ${exportRows.length} record${exportRows.length === 1 ? "" : "s"}.`);
    } catch {
      toast.showError("Couldn't export leave balances.");
    } finally {
      setExporting(false);
    }
  };

  const columns: DataTableColumn<LeaveBalanceRow>[] = [
    {
      key: "employee",
      label: "Employee",
      sortable: true,
      sortKey: "employee_name",
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
      sortable: true,
      hideBelow: "md",
      render: (r) => r.departmentName,
      filterable: true,
      filterOptions: departments.map((d) => ({ value: d.departmentId, label: d.name })),
      filterPlaceholder: "All departments",
    },
    { key: "designation", label: "Designation", hideBelow: "lg", render: (r) => r.designationName },
    {
      key: "leaveType",
      label: "Leave Type",
      sortable: true,
      sortKey: "leave_type",
      render: (r) => r.leaveTypeName,
      filterable: true,
      filterOptions: leaveTypes.map((t) => ({ value: t.leaveTypeId, label: t.leaveTypeName })),
      filterPlaceholder: "All leave types",
    },
    {
      key: "totalEntitlement",
      label: "Total Entitlement",
      align: "right",
      hideBelow: "lg",
      render: (r) => r.totalEntitlement,
    },
    { key: "usedLeave", label: "Used Leave", align: "right", hideBelow: "xl", render: (r) => r.usedLeave },
    {
      key: "remainingLeave",
      label: "Remaining Leave",
      align: "right",
      sortable: true,
      sortKey: "remaining",
      render: (r) => <span className="font-medium text-gray-900">{r.remainingLeave}</span>,
    },
    {
      key: "pendingRequests",
      label: "Pending Requests",
      align: "right",
      hideBelow: "xl",
      render: (r) =>
        r.pendingRequests > 0 ? (
          <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-brand text-white px-2 py-0.5 text-xs font-semibold">
            {r.pendingRequests}
          </span>
        ) : (
          <span className="text-gray-400">0</span>
        ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (r) => <StatusBadge status={r.status} />,
      filterable: true,
      filterOptions: STATUS_OPTIONS,
      filterPlaceholder: "All statuses",
    },
  ];

  return (
    <DashboardLayout title="Employee Leave Management" activeKey="leave">
      <BackendStatusBanner status={status} />
      <SectionTabs tabs={tabs} active="leave-management" />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => `${r.userId}:${r.leaveTypeId}`}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by employee, department, leave type…"
        emptyIcon={CalendarClock}
        emptyTitle="No leave balances found"
        emptyDescription="Try adjusting your search or filters."
        page={page}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[10, 25, 50, 100]}
        total={total}
        onPageChange={setPage}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={handleSortChange}
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
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                Remaining balance ≤
              </span>
              <input
                type="number"
                min={0}
                value={minRemaining}
                onChange={(e) => setMinRemaining(e.target.value)}
                placeholder="e.g. 2"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/60"
              />
            </label>
          </div>
        }
        toolbarRight={
          <div className="flex items-center gap-2">
            {(["csv", "excel", "json"] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                disabled={exporting}
                onClick={() => handleExport(fmt, "all")}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-brand/60 hover:text-brand-dark disabled:opacity-50"
              >
                {exporting ? "Exporting…" : fmt === "excel" ? "Export Excel" : `Export ${fmt.toUpperCase()}`}
              </button>
            ))}
          </div>
        }
      />
    </DashboardLayout>
  );
}
