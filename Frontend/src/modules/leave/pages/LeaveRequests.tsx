import { useEffect, useState, type FormEvent } from "react";
import { CalendarX2, Check, X } from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import DataTable, { type DataTableColumn } from "@/components/tables/DataTable";
import Modal from "@/components/dialogs/Modal";
import { PrimaryButton } from "@/components/forms/FormField";
import StatusBadge from "@/components/common/StatusBadge";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import SectionTabs from "@/components/common/SectionTabs";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import { useAuth } from "@/app/providers/AuthContext";
import { getLeaveTabs } from "@/config/featureTabs";
import { adminLeaveApi, type AdminLeaveRequest, type AdminLeaveStatus } from "@/modules/settings/api/adminOpsApi";
import { departmentsApi, type Department } from "@/modules/settings/api/settingsApi";
import { employeesApi, type Employee } from "@/modules/employees/api/employeeApi";

type Decision = { request: AdminLeaveRequest; action: "approve" | "reject" };

export default function LeaveRequestsPage() {
 const status = useBackendStatus();
 const toast = useToast();
 const { user } = useAuth();
 const sectionTabs = getLeaveTabs(user?.role);

 const [rows, setRows] = useState<AdminLeaveRequest[]>([]);
 const [total, setTotal] = useState(0);
 const [loading, setLoading] = useState(true);
 const [search, setSearch] = useState("");
 const [page, setPage] = useState(1);
 const [pageSize, setPageSize] = useState(10);
 const [departmentFilter, setDepartmentFilter] = useState("");
 const [employeeFilter, setEmployeeFilter] = useState("");
 const [statusFilter, setStatusFilter] = useState<AdminLeaveStatus | "">("Pending");

 const [departments, setDepartments] = useState<Department[]>([]);
 const [employees, setEmployees] = useState<Employee[]>([]);
 const [decision, setDecision] = useState<Decision | null>(null);
 const [deciding, setDeciding] = useState(false);
 const [decisionReason, setDecisionReason] = useState("");
 const [decisionError, setDecisionError] = useState<string | null>(null);

 const tabs: Array<AdminLeaveStatus | ""> = ["", "Pending", "Approved", "Rejected"];

 const load = () => {
 setLoading(true);
 adminLeaveApi
 .list({ search, page, pageSize, departmentId: departmentFilter, employeeId: employeeFilter, status: statusFilter })
 .then((res) => {
 setRows(res.data);
 setTotal(res.total);
 })
 .catch(() => toast.showError("Couldn't load leave requests."))
 .finally(() => setLoading(false));
 };

 useEffect(() => {
 load();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [search, page, pageSize, departmentFilter, employeeFilter, statusFilter]);

 useEffect(() => setPage(1), [search, pageSize, departmentFilter, employeeFilter, statusFilter]);

 useEffect(() => {
 departmentsApi.listAll().then((res) => setDepartments(res.data)).catch(() => undefined);
 employeesApi.list({ pageSize: 200 }).then((res) => setEmployees(res.data)).catch(() => undefined);
 }, []);

 const openDecision = (request: AdminLeaveRequest, action: Decision["action"]) => {
 setDecision({ request, action });
 setDecisionReason("");
 setDecisionError(null);
 };

 // The note is required by the backend (it's what the employee reads in the
 // approval/rejection notification), so it's validated here too rather than
 // letting the request come back as a 400.
 const handleDecide = async (e: FormEvent) => {
 e.preventDefault();
 if (!decision) return;

 const reason = decisionReason.trim();
 if (!reason) {
 setDecisionError(
 decision.action === "approve"
 ? "Please give a reason for approving this request."
 : "Please give a reason for rejecting this request.",
 );
 return;
 }

 setDeciding(true);
 setDecisionError(null);
 try {
 if (decision.action === "approve") {
 await adminLeaveApi.approve(decision.request.leaveId, reason);
 toast.showSuccess("Leave request approved.");
 } else {
 await adminLeaveApi.reject(decision.request.leaveId, reason);
 toast.showSuccess("Leave request rejected.");
 }
 setDecision(null);
 load();
 } catch (err) {
 setDecisionError(err instanceof Error ? err.message : "Couldn't update the request.");
 } finally {
 setDeciding(false);
 }
 };

 const columns: DataTableColumn<AdminLeaveRequest>[] = [
 {
 key: "employee",
 label: "Employee",
 render: (r) => (
 <div className="min-w-0">
 <p className="truncate font-medium text-gray-900">{r.employeeName}</p>
 <p className="truncate text-xs text-gray-400">{r.departmentName}</p>
 </div>
 ),
 },
 { key: "type", label: "Type", render: (r) => r.leaveTypeName, hideBelow: "md" },
 {
 key: "dates",
 label: "Dates",
 render: (r) => (
 <>
 {new Date(r.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })} –{" "}
 {new Date(r.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
 </>
 ),
 },
 { key: "days", label: "Days", render: (r) => r.totalDays, hideBelow: "lg" },
 { key: "reason", label: "Reason", render: (r) => <span className="line-clamp-1 max-w-[200px]">{r.reason}</span>, hideBelow: "xl" },
 { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
 ];

 return (
 <DashboardLayout title="Leave Requests" activeKey="leave">
 <BackendStatusBanner status={status} />
 <SectionTabs tabs={sectionTabs} active="leave-requests" />

 <div className="mb-4 inline-flex flex-wrap rounded-full bg-gray-100 p-1 text-sm font-medium">
 {tabs.map((t) => (
 <button
 key={t || "all"}
 type="button"
 onClick={() => setStatusFilter(t)}
 className={`min-h-9 rounded-full px-3.5 py-1.5 transition ${
 statusFilter === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-400"
 }`}
 >
 {t || "All"}
 </button>
 ))}
 </div>

 <DataTable
 columns={columns}
 rows={rows}
 rowKey={(r) => r.leaveId}
 loading={loading}
 search={search}
 onSearchChange={setSearch}
 searchPlaceholder="Search by employee…"
 emptyIcon={CalendarX2}
 emptyTitle="No leave requests found"
 emptyDescription="Try adjusting your filters."
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
 value={employeeFilter}
 onChange={(e) => setEmployeeFilter(e.target.value)}
 className="min-h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/60"
 aria-label="Filter by employee"
 >
 <option value="">All Employees</option>
 {employees.map((e) => (
 <option key={e.employeeId} value={e.employeeId}>
 {e.firstName} {e.lastName}
 </option>
 ))}
 </select>
 </div>
 }
 actions={(r) =>
 r.status === "Pending" ? (
 <div className="flex items-center justify-end gap-1.5">
 <button
 type="button"
 onClick={() => openDecision(r, "approve")}
 aria-label={`Approve ${r.employeeName}'s leave`}
 className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-emerald-500 transition hover:bg-emerald-50 hover:text-emerald-600"
 >
 <Check size={16} />
 </button>
 <button
 type="button"
 onClick={() => openDecision(r, "reject")}
 aria-label={`Reject ${r.employeeName}'s leave`}
 className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-rose-400 transition hover:bg-rose-50 hover:text-rose-600"
 >
 <X size={16} />
 </button>
 </div>
 ) : (
 <span className="block text-right text-xs text-gray-400">Decided</span>
 )
 }
 />

 <Modal
 open={!!decision}
 title={
 decision?.action === "approve"
 ? `Approve ${decision.request.employeeName}'s leave`
 : `Reject ${decision?.request.employeeName}'s leave`
 }
 description={
 decision
 ? `${decision.request.leaveTypeName} · ${decision.request.totalDays} day(s) · ${new Date(decision.request.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${new Date(decision.request.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
 : undefined
 }
 onClose={() => setDecision(null)}
 maxWidth="max-w-md"
 >
 <form onSubmit={handleDecide}>
 {decision?.request.reason && (
 <div className="mb-4 rounded-lg bg-gray-50 px-4 py-3">
 <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
 Employee's reason
 </p>
 <p className="mt-1 text-sm text-gray-700">{decision.request.reason}</p>
 </div>
 )}

 <label className="mb-4 block">
 <span className="mb-2 block text-sm font-medium text-gray-900">
 {decision?.action === "approve" ? "Approval note" : "Rejection note"}{" "}
 <span className="text-rose-600">*</span>
 </span>
 <textarea
 value={decisionReason}
 onChange={(e) => setDecisionReason(e.target.value)}
 rows={3}
 required
 autoFocus
 placeholder={
 decision?.action === "approve"
 ? "e.g. Cover arranged with the rest of the team."
 : "e.g. Two people are already off that week."
 }
 className="w-full resize-none rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
 />
 <span className="mt-1.5 block text-xs text-gray-500">
 {decision?.action === "approve"
 ? "Approving deducts the working days in this range from the employee's balance."
 : "The employee sees this note in their notification. No days are deducted."}
 </span>
 </label>

 {decisionError && <p className="mb-4 text-sm text-rose-600">{decisionError}</p>}

 <div className="flex gap-3">
 <button
 type="button"
 onClick={() => setDecision(null)}
 className="min-h-11 flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
 >
 Cancel
 </button>
 <div className="flex-1">
 <PrimaryButton type="submit" loading={deciding}>
 {decision?.action === "approve" ? "Approve" : "Reject"}
 </PrimaryButton>
 </div>
 </div>
 </form>
 </Modal>
 </DashboardLayout>
 );
}
