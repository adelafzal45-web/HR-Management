import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Pencil, Check, X, Download } from "lucide-react";
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
import { leaveEntitlementAssignmentApi } from "@/modules/leave/api/leaveEntitlementAssignmentApi";
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

// Inline edits (Total Entitlement / Status) always apply to the current
// year's entitlement — matching the Leave Entitlements assignment page.
const CURRENT_YEAR = new Date().getFullYear();

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

  // Inline edit (Total Entitlement + Status) for a single row at a time —
  // editingRowKey mirrors DataTable's rowKey (`${userId}:${leaveTypeId}`).
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const [editEntitlement, setEditEntitlement] = useState("");
  const [editStatus, setEditStatus] = useState<LeaveBalanceStatus>("active");
  const [savingRowKey, setSavingRowKey] = useState<string | null>(null);

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
    leaveTypesApi.list({ pageSize: 1000 }).then((res) => setLeaveTypes(res.data)).catch(() => undefined);
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

  // Leaving a row mid-edit whenever the page/filters change under it — the
  // row on screen may no longer be the one the inputs refer to.
  useEffect(
    () => setEditingRowKey(null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, page, pageSize, departmentFilter, leaveTypeFilter, employeeFilter, statusFilter, minRemaining, sortKey, sortDir],
  );

  const rowKeyOf = (r: LeaveBalanceRow) => `${r.userId}:${r.leaveTypeId}`;

  const startEdit = (r: LeaveBalanceRow) => {
    setEditingRowKey(rowKeyOf(r));
    setEditEntitlement(String(r.totalEntitlement));
    setEditStatus(r.status);
  };

  const cancelEdit = () => setEditingRowKey(null);

  // Saves whichever of Total Entitlement / Status actually changed. The
  // entitlement is written via the same "set" assignment the Leave
  // Entitlements page uses (targeting this one employee), so it lands as a
  // proper ledger entry rather than a silent overwrite; status is a plain
  // employee-record update.
  const handleSaveRow = async (r: LeaveBalanceRow) => {
    const key = rowKeyOf(r);
    const nextEntitlement = Number(editEntitlement);
    if (!Number.isFinite(nextEntitlement) || nextEntitlement < 0) {
      toast.showError("Enter a valid, non-negative entitlement.");
      return;
    }

    const entitlementChanged = nextEntitlement !== r.totalEntitlement;
    const statusChanged = editStatus !== r.status;
    if (!entitlementChanged && !statusChanged) {
      setEditingRowKey(null);
      return;
    }

    setSavingRowKey(key);
    try {
      const tasks: Promise<unknown>[] = [];
      if (entitlementChanged) {
        tasks.push(
          leaveEntitlementAssignmentApi.assign({
            leaveTypeId: r.leaveTypeId,
            year: CURRENT_YEAR,
            target: { userId: r.userId },
            mode: "set",
            days: nextEntitlement,
            note: "Updated from Employee Leaves table",
          }),
        );
      }
      if (statusChanged) {
        tasks.push(employeesApi.setStatus(r.userId, editStatus));
      }
      await Promise.all(tasks);
      toast.showSuccess("Leave balance updated.");
      setEditingRowKey(null);
      load();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't save changes.");
    } finally {
      setSavingRowKey(null);
    }
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

  // Rows sort by employee name by default, so each employee's leave-type
  // rows land contiguously — this marks only the first row per employee,
  // which the "employee" column uses to blank out the repeats.
  const firstRowKeyByEmployee = useMemo(() => {
    const seenUsers = new Set<string>();
    const firstKeys = new Set<string>();
    for (const r of rows) {
      if (!seenUsers.has(r.userId)) {
        seenUsers.add(r.userId);
        firstKeys.add(rowKeyOf(r));
      }
    }
    return firstKeys;
  }, [rows]);

  const columns: DataTableColumn<LeaveBalanceRow>[] = [
    {
      key: "employee",
      label: "Employee",
      sortable: true,
      sortKey: "employee_name",
      render: (r) =>
        firstRowKeyByEmployee.has(rowKeyOf(r)) ? (
          <div className="min-w-0">
            <p className="truncate font-medium text-gray-900">{r.employeeName}</p>
            <p className="truncate text-xs text-gray-400">{r.employeeCode}</p>
          </div>
        ) : null,
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
      // No hideBelow here (unlike the other secondary columns): this field
      // is editable, so it needs to stay visible whenever a row is being
      // edited, on every desktop width.
      render: (r) =>
        editingRowKey === rowKeyOf(r) ? (
          <input
            type="number"
            min={0}
            step={0.5}
            value={editEntitlement}
            onChange={(e) => setEditEntitlement(e.target.value)}
            className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-right text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/60"
            aria-label={`Total entitlement for ${r.employeeName}`}
          />
        ) : (
          r.totalEntitlement
        ),
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
      render: (r) =>
        editingRowKey === rowKeyOf(r) ? (
          <select
            value={editStatus}
            onChange={(e) => setEditStatus(e.target.value as LeaveBalanceStatus)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/60"
            aria-label={`Status for ${r.employeeName}`}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : (
          <StatusBadge status={r.status} />
        ),
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
        rowGroupKey={(r) => r.userId}
        actions={(r) => {
          const key = rowKeyOf(r);
          const isEditing = editingRowKey === key;
          const isSaving = savingRowKey === key;
          if (!isEditing) {
            return (
              <button
                type="button"
                onClick={() => startEdit(r)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:border-brand/60 hover:text-brand-dark"
              >
                <Pencil size={13} /> Edit
              </button>
            );
          }
          return (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSaveRow(r)}
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand to-brand-dark px-2.5 py-1.5 text-xs font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:opacity-50"
              >
                <Check size={13} /> {isSaving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={cancelEdit}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
              >
                <X size={13} /> Cancel
              </button>
            </div>
          );
        }}
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
          <button
            type="button"
            disabled={exporting}
            onClick={() => handleExport("csv", "all")}
            title="Export CSV"
            aria-label="Export CSV"
            className="flex items-center justify-center rounded-lg border border-gray-200 bg-white p-2.5 text-gray-600 transition hover:border-brand/60 hover:text-brand-dark disabled:opacity-50"
          >
            <Download size={16} />
          </button>
        }
      />
    </DashboardLayout>
  );
}
