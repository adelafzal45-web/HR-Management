import { useEffect, useState } from "react";
import type { ElementType, ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
 Pencil,
 Mail,
 Phone,
 MapPin,
 Cake,
 Wallet,
 Building2,
 IdCard,
 Clock,
 Tags,
 UserCog,
 UserX,
 ShieldAlert,
 History,
 KeyRound,
 Send,
} from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import BackButton from "@/components/common/BackButton";
import EmptyState from "@/components/common/EmptyState";
import StatusBadge from "@/components/common/StatusBadge";
import EmployeeAvatar from "@/modules/employees/components/EmployeeAvatar";
import EmployeeAttendanceTab from "@/modules/employees/components/EmployeeAttendanceTab";
import EmployeeLeaveTab from "@/modules/employees/components/EmployeeLeaveTab";
import EmployeePayrollTab from "@/modules/employees/components/EmployeePayrollTab";
import EmployeeDocumentsTab from "@/modules/employees/components/EmployeeDocumentsTab";
import { useAuth } from "@/app/providers/AuthContext";
import { useToast } from "@/app/providers/ToastContext";
import { employeesApi, type Employee } from "@/modules/employees/api/employeeApi";
import { adminPasswordResetApi, type PasswordResetLinkHistoryEntry } from "@/modules/auth/api";
import SendResetLinksDialog, { type ResetLinkTarget } from "@/modules/employees/components/SendResetLinksDialog";

type TabKey = "profile" | "attendance" | "leave" | "payroll" | "documents" | "reset-links";

const RESET_LINK_STATUS_STYLES: Record<PasswordResetLinkHistoryEntry["status"], string> = {
 used: "bg-emerald-50 text-emerald-700",
 expired: "bg-gray-100 text-gray-600",
 superseded: "bg-amber-50 text-amber-700",
 pending: "bg-blue-50 text-blue-700",
};

const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
 full_time: "Full-Time",
 part_time: "Part-Time",
 contract: "Contract",
 intern: "Intern",
};

function formatDateTime(iso: string) {
 return new Date(iso).toLocaleString(undefined, {
 year: "numeric",
 month: "short",
 day: "numeric",
 hour: "numeric",
 minute: "2-digit",
 });
}

function DetailRow({ icon: Icon, label, value }: { icon: ElementType; label: string; value: ReactNode }) {
 return (
 <div className="flex items-start gap-3 py-2.5">
 <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-400">
 <Icon size={15} />
 </span>
 <div className="min-w-0">
 <p className="text-xs text-gray-400">{label}</p>
 <p className="truncate text-sm font-medium text-gray-800">{value || "—"}</p>
 </div>
 </div>
 );
}

function DetailSkeleton() {
 return (
 <div className="space-y-6">
 <div className="flex items-center gap-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
 <div className="h-16 w-16 animate-pulse rounded-full bg-gray-100" />
 <div className="space-y-2">
 <div className="h-4 w-40 animate-pulse rounded bg-gray-100" />
 <div className="h-3 w-24 animate-pulse rounded bg-gray-100" />
 </div>
 </div>
 {[...Array(3)].map((_, i) => (
 <div key={i} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
 <div className="mb-4 h-4 w-32 animate-pulse rounded bg-gray-100" />
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 {[...Array(4)].map((__, j) => (
 <div key={j} className="h-10 animate-pulse rounded-lg bg-gray-100" style={{ animationDelay: `${j * 40}ms` }} />
 ))}
 </div>
 </div>
 ))}
 </div>
 );
}

export default function ViewEmployeePage() {
 const { employeeId } = useParams<{ employeeId: string }>();
 const navigate = useNavigate();
 const toast = useToast();

 const [employee, setEmployee] = useState<Employee | null>(null);
 const [loading, setLoading] = useState(true);
 const [notFound, setNotFound] = useState(false);
 const [tab, setTab] = useState<TabKey>("profile");
 const [resetHistory, setResetHistory] = useState<PasswordResetLinkHistoryEntry[]>([]);
 const [resetHistoryLoading, setResetHistoryLoading] = useState(false);
 const [sendResetOpen, setSendResetOpen] = useState(false);
 const { hasPermission } = useAuth();

 const canSendReset = hasPermission("employees.password.reset");
 const canViewDocuments = hasPermission("employees.documents.view");

 // Per-employee reset history is a separate fetch from the profile record:
 // the page renders fast without it, and it is only requested when the tab
 // that shows it actually opens.
 useEffect(() => {
 if (!employeeId || tab !== "reset-links") return;
 setResetHistoryLoading(true);
 adminPasswordResetApi
 .history(employeeId)
 .then(setResetHistory)
 .catch((err) => {
 setResetHistory([]);
 toast.showError(err instanceof Error ? err.message : "Couldn't load the reset history.");
 })
 .finally(() => setResetHistoryLoading(false));
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [employeeId, tab]);

 useEffect(() => {
 if (!employeeId) return;
 setLoading(true);
 setNotFound(false);
 employeesApi
 .getById(employeeId)
 .then((emp) => setEmployee(emp))
 .catch(() => {
 setNotFound(true);
 toast.showError("Couldn't load that employee.");
 })
 .finally(() => setLoading(false));
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [employeeId]);

 return (
 <DashboardLayout title="Employee Details" activeKey="employees">
 <div className="mb-5 flex items-center justify-between gap-3">
 <BackButton fallback="/employees" label="Back to Employees" />
 {employee && (
 <div className="flex items-center gap-2">
 {canSendReset && (
 <button
 type="button"
 onClick={() => setSendResetOpen(true)}
 className="flex min-h-9 items-center gap-1.5 rounded-full border border-gray-200 px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
 >
 <Send size={14} /> Send Reset Link
 </button>
 )}
 <button
 type="button"
 onClick={() => navigate(`/employees/${employee.employeeId}/edit`)}
 className="flex min-h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
 >
 <Pencil size={14} /> Edit
 </button>
 </div>
 )}
 </div>

 {loading ? (
 <DetailSkeleton />
 ) : notFound || !employee ? (
 <EmptyState icon={UserX} title="Employee not found" description="This employee record may have been deleted or the link is out of date." />
 ) : (
 <div className="space-y-6">
 <div className="flex flex-col items-start gap-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 sm:flex-row sm:items-center sm:justify-between">
 <div className="flex items-center gap-4">
 <EmployeeAvatar
 firstName={employee.firstName}
 lastName={employee.lastName}
 photo={employee.profileImageUrl}
 thumb={employee.profileImageThumbUrl}
 size={64}
 />
 <div>
 <p className="text-lg font-semibold text-gray-900">
 {employee.firstName} {employee.lastName}
 </p>
 <p className="text-sm text-gray-400">{employee.employeeCode}</p>
 <p className="mt-1 text-sm text-gray-500">
 {employee.designationName} · {employee.departmentName}
 </p>
 </div>
 </div>
 <StatusBadge status={employee.status} />
 </div>

 {/* Tabs */}
 <div className="flex items-center gap-1 rounded-full bg-gray-100 p-1 sm:w-fit">
 <button
 type="button"
 onClick={() => setTab("profile")}
 className={`min-h-9 flex-1 rounded-full px-5 text-sm font-semibold transition sm:flex-none ${
 tab === "profile" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
 }`}
 >
 Profile
 </button>
 <button
 type="button"
 onClick={() => setTab("attendance")}
 className={`min-h-9 flex-1 rounded-full px-5 text-sm font-semibold transition sm:flex-none ${
 tab === "attendance" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
 }`}
 >
 Attendance
 </button>
 <button
 type="button"
 onClick={() => setTab("leave")}
 className={`min-h-9 flex-1 rounded-full px-5 text-sm font-semibold transition sm:flex-none ${
 tab === "leave" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
 }`}
 >
 Leave
 </button>
 <button
 type="button"
 onClick={() => setTab("payroll")}
 className={`min-h-9 flex-1 rounded-full px-5 text-sm font-semibold transition sm:flex-none ${
 tab === "payroll" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
 }`}
 >
 Payroll
 </button>
 {canViewDocuments && (
 <button
 type="button"
 onClick={() => setTab("documents")}
 className={`min-h-9 flex-1 rounded-full px-5 text-sm font-semibold transition sm:flex-none ${
 tab === "documents" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
 }`}
 >
 Documents
 </button>
 )}
 {canSendReset && (
 <button
 type="button"
 onClick={() => setTab("reset-links")}
 className={`min-h-9 flex-1 rounded-full px-5 text-sm font-semibold transition sm:flex-none ${
 tab === "reset-links" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
 }`}
 >
 Reset Links
 </button>
 )}
 </div>

 {tab === "attendance" ? (
 <EmployeeAttendanceTab employeeId={employee.employeeId} />
 ) : tab === "leave" ? (
 <EmployeeLeaveTab employeeId={employee.employeeId} />
 ) : tab === "payroll" ? (
 <EmployeePayrollTab employee={employee} />
 ) : tab === "documents" && canViewDocuments ? (
 <EmployeeDocumentsTab employeeId={employee.employeeId} employeeCode={employee.employeeCode} />
 ) : tab === "reset-links" && canSendReset ? (
 <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
 <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
 <div>
 <h3 className="text-sm font-semibold text-gray-900">Password reset links</h3>
 <p className="mt-1 text-xs leading-relaxed text-gray-400">
 Each link is single-use and expires 60 minutes after it is sent. Issuing a new
 one invalidates any link this employee has not used yet.
 </p>
 </div>
 <button
 type="button"
 onClick={() => setSendResetOpen(true)}
 className="flex min-h-9 shrink-0 items-center gap-1.5 self-start rounded-full bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark"
 >
 <KeyRound size={14} /> Send new link
 </button>
 </div>

 {resetHistoryLoading ? (
 <div className="space-y-2">
 {[...Array(3)].map((_, i) => (
 <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100" />
 ))}
 </div>
 ) : resetHistory.length === 0 ? (
 <EmptyState
 icon={History}
 title="No reset links yet"
 description="No password reset link has been issued for this employee."
 />
 ) : (
 <ul className="divide-y divide-gray-50">
 {resetHistory.map((entry) => (
 <li key={entry.password_reset_token_id} className="flex items-start justify-between gap-3 py-3">
 <div className="min-w-0">
 <p className="truncate text-sm font-medium text-gray-900">{entry.delivery_email}</p>
 <p className="mt-0.5 text-xs text-gray-400">
 Sent {formatDateTime(entry.created_at)}
 {/* The address is recorded per link, so a later email change
     doesn't rewrite where an earlier link actually went. */}
 {entry.created_by_user_id ? " by an administrator" : " on request"}
 </p>
 <p className="mt-0.5 text-xs text-gray-400">
 {entry.used_at
 ? `Used ${formatDateTime(entry.used_at)}`
 : `Expires ${formatDateTime(entry.expires_at)}`}
 </p>
 </div>
 <span
 className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
 RESET_LINK_STATUS_STYLES[entry.status]
 }`}
 >
 {entry.status}
 </span>
 </li>
 ))}
 </ul>
 )}
 </div>
 ) : (
 <div className="space-y-6">
 <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
 <h3 className="mb-1 text-sm font-semibold text-gray-900">Contact & Personal</h3>
 <div className="grid grid-cols-1 gap-x-6 divide-y divide-gray-50 sm:grid-cols-2 sm:divide-y-0">
 <DetailRow icon={Mail} label="Email" value={employee.email} />
 <DetailRow icon={Phone} label="Phone" value={employee.phone} />
 <DetailRow
 icon={Cake}
 label="Date of Birth"
 value={`${new Date(employee.dateOfBirth).toLocaleDateString(undefined, {
 year: "numeric",
 month: "short",
 day: "numeric",
 })} · ${employee.gender}`}
 />
 <DetailRow icon={MapPin} label="Address" value={employee.address} />
 </div>
 </div>

 <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
 <h3 className="mb-1 text-sm font-semibold text-gray-900">Employment</h3>
 <div className="grid grid-cols-1 gap-x-6 divide-y divide-gray-50 sm:grid-cols-2 sm:divide-y-0">
 <DetailRow icon={Building2} label="Department" value={employee.departmentName} />
 <DetailRow icon={IdCard} label="Designation" value={employee.designationName} />
 <DetailRow icon={UserCog} label="Team Lead" value={employee.managerName} />
 <DetailRow icon={Tags} label="Job Category / Type" value={`${employee.jobCategoryName} · ${EMPLOYMENT_TYPE_LABEL[employee.employmentType]}`} />
 <DetailRow icon={Clock} label="Shift" value={employee.shiftName} />
 <DetailRow
 icon={Cake}
 label="Joined"
 value={new Date(employee.joiningDate).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
 />
 </div>
 </div>

 <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
 <h3 className="mb-1 text-sm font-semibold text-gray-900">Payroll & Access</h3>
 <div className="grid grid-cols-1 gap-x-6 divide-y divide-gray-50 sm:grid-cols-2 sm:divide-y-0">
 <DetailRow
 icon={Wallet}
 label="Salary"
 value={`${employee.salary.toLocaleString()} / month${employee.overtimeAllowed ? " · OT allowed" : ""}`}
 />
 <DetailRow icon={ShieldAlert} label="Role" value={employee.roleName} />
 </div>
 </div>
 </div>
 )}

 {/* Outside the tab conditional on purpose: the dialog is opened from both
     the page header and the Reset Links tab, so nesting it inside the
     profile branch would make it unopenable from either of those. */}
 <SendResetLinksDialog
 open={sendResetOpen}
 targets={[
 {
 userId: employee.employeeId,
 name: `${employee.firstName} ${employee.lastName}`.trim(),
 email: employee.email,
 } satisfies ResetLinkTarget,
 ]}
 onClose={() => setSendResetOpen(false)}
 onCompleted={() => {
 // Refresh the history so a link just issued appears, and the one it
 // superseded flips out of `pending`.
 if (tab === "reset-links") {
 adminPasswordResetApi.history(employee.employeeId).then(setResetHistory).catch(() => undefined);
 }
 }}
 />
 </div>
 )}
 </DashboardLayout>
 );
}
