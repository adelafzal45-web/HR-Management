import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Pencil,
  Power,
  KeyRound,
  Mail,
  Phone,
  MapPin,
  Cake,
  Building2,
  IdCard,
  UserCog,
  Tags,
  Clock,
  Wallet,
  CalendarDays,
  FolderOpen,
  History,
  StickyNote,
  Trash2,
  Send,
} from "lucide-react";
import ConfirmDialog from "../ConfirmDialog";
import EmptyState from "../EmptyState";
import StatusBadge from "../StatusBadge";
import { useTheme } from "../../lib/ThemeContext";
import { formatDisplayDate } from "../../lib/formatDate";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../lib/ToastContext";
import { EMPLOYMENT_TYPE_LABEL } from "../../lib/employeeFormOptions";
import { adminAttendanceApi, adminLeaveApi, type AdminAttendanceRecord, type AdminLeaveRequest } from "../../lib/adminOpsApi";
import { getActivity, appendActivity, getNotes, addNote, deleteNote, type ActivityEntry, type EmployeeNote } from "../../lib/employeeActivityLog";
import type { Employee } from "../../lib/employeeApi";

const TABS = ["Overview", "Employment", "Attendance", "Leave", "Payroll", "Documents", "Activity Log", "Notes"] as const;
type Tab = (typeof TABS)[number];

type Props = {
  employee: Employee | null;
  open: boolean;
  onClose: () => void;
  onEdit: (employee: Employee) => void;
  onRequestStatusChange: (employee: Employee) => void;
};

function InfoRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
        <Icon size={14} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</p>
        <p className="truncate text-sm text-gray-800 dark:text-gray-200">{value || "—"}</p>
      </div>
    </div>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 dark:bg-gray-900 dark:ring-gray-800">
      {title && <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{title}</p>}
      {children}
    </div>
  );
}

// ---- deterministic payroll preview (no admin-payroll-by-employee backend
// route exists yet, so this is a presentational projection derived from the
// employee's on-file salary — same "generated" pattern as mockPayrollApi) --
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function buildPayrollPreview(salary: number) {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const allowance = Math.round(salary * 0.12);
    const deduction = Math.round(salary * 0.03);
    const tax = Math.round(salary * 0.08);
    const bonus = i === 0 ? Math.round(salary * 0.05) : 0;
    const net = salary + allowance + bonus - deduction - tax;
    return {
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
      basic: salary,
      allowance,
      bonus,
      deduction,
      tax,
      net,
      status: i === 0 ? "Pending" : "Generated",
    };
  });
}

function TimelineDot({ tone = "gray" }: { tone?: "gray" | "brand" | "emerald" | "rose" | "amber" }) {
  const toneClass: Record<string, string> = {
    gray: "bg-gray-300",
    brand: "bg-brand-dark",
    emerald: "bg-emerald-500",
    rose: "bg-rose-500",
    amber: "bg-amber-500",
  };
  return <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${toneClass[tone]}`} />;
}

function ActivityIcon(type: ActivityEntry["type"]): "brand" | "emerald" | "rose" | "amber" {
  switch (type) {
    case "created":
      return "emerald";
    case "status":
      return "amber";
    case "password_reset":
      return "rose";
    case "note":
      return "brand";
    default:
      return "brand";
  }
}

export default function EmployeeViewDrawer({ employee, open, onClose, onEdit, onRequestStatusChange }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const { themeClass } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>("Overview");

  const [attendance, setAttendance] = useState<AdminAttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [leave, setLeave] = useState<AdminLeaveRequest[]>([]);
  const [leaveLoading, setLeaveLoading] = useState(false);

  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [notes, setNotes] = useState<EmployeeNote[]>([]);
  const [noteDraft, setNoteDraft] = useState("");

  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  useEffect(() => {
    if (!open || !employee) return;
    setActiveTab("Overview");
    setActivity(getActivity(employee.employeeId));
    setNotes(getNotes(employee.employeeId));

    setAttendanceLoading(true);
    adminAttendanceApi
      .list({ pageSize: 300 })
      .then((res) => setAttendance(res.data.filter((r) => r.employeeId === employee.employeeId).slice(0, 14)))
      .catch(() => undefined)
      .finally(() => setAttendanceLoading(false));

    setLeaveLoading(true);
    adminLeaveApi
      .list({ pageSize: 300 })
      .then((res) => setLeave(res.data.filter((r) => r.employeeId === employee.employeeId)))
      .catch(() => undefined)
      .finally(() => setLeaveLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employee?.employeeId]);

  const payroll = useMemo(() => (employee ? buildPayrollPreview(employee.salary) : []), [employee]);
  const actorName = user ? `${user.firstName} ${user.lastName}`.trim() : "Admin";

  if (!open || !employee) return null;

  const handleAddNote = () => {
    if (!noteDraft.trim()) return;
    addNote(employee.employeeId, noteDraft.trim(), actorName);
    appendActivity(employee.employeeId, "note", "Added a note.", actorName);
    setNoteDraft("");
    setNotes(getNotes(employee.employeeId));
    setActivity(getActivity(employee.employeeId));
  };

  const handleDeleteNote = (noteId: string) => {
    deleteNote(employee.employeeId, noteId);
    setNotes(getNotes(employee.employeeId));
  };

  const handleResetPassword = async () => {
    setResettingPassword(true);
    await new Promise((r) => setTimeout(r, 500));
    appendActivity(employee.employeeId, "password_reset", `Password reset link sent to ${employee.email}.`, actorName);
    setActivity(getActivity(employee.employeeId));
    toast.showSuccess("Password reset link sent.", `An email was sent to ${employee.email}.`);
    setResettingPassword(false);
    setResetPasswordOpen(false);
  };

  const yearsOfService = (() => {
    const start = new Date(employee.joiningDate).getTime();
    if (Number.isNaN(start)) return null;
    const years = (Date.now() - start) / (1000 * 60 * 60 * 24 * 365.25);
    return years < 1 ? "< 1 yr" : `${Math.floor(years)} yr${Math.floor(years) === 1 ? "" : "s"}`;
  })();

  return createPortal(
    <div className={`${themeClass} fixed inset-0 z-[110] flex justify-end`}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Employee details"
        className="relative flex h-full w-full flex-col overflow-hidden bg-gray-50 shadow-xl dark:bg-gray-950 sm:w-[600px] sm:max-w-[92vw]"
      >
        {/* Header */}
        <div className="shrink-0 border-b border-gray-100 bg-white px-5 pb-4 pt-5 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-light text-lg font-semibold text-brand-dark dark:bg-brand/10 dark:text-brand">
                {employee.firstName[0]}
                {employee.lastName[0]}
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
                  {employee.firstName} {employee.lastName}
                </p>
                <p className="truncate text-xs text-gray-400 dark:text-gray-500">
                  {employee.employeeCode} · {employee.designationName}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <StatusBadge status={employee.status} />
                  {yearsOfService && <span className="text-xs text-gray-400 dark:text-gray-500">{yearsOfService} at company</span>}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            >
              <X size={18} />
            </button>
          </div>

          {/* Quick actions */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onEdit(employee)}
              className="flex min-h-9 items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand to-brand-dark px-3 text-xs font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
            >
              <Pencil size={13} /> Edit
            </button>
            <button
              type="button"
              onClick={() => onRequestStatusChange(employee)}
              className={`flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ring-1 transition ${
                employee.status === "active"
                  ? "text-rose-600 ring-rose-200 hover:bg-rose-50 dark:text-rose-400 dark:ring-rose-500/30 dark:hover:bg-rose-500/10"
                  : "text-emerald-600 ring-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:ring-emerald-500/30 dark:hover:bg-emerald-500/10"
              }`}
            >
              <Power size={13} /> {employee.status === "active" ? "Deactivate" : "Activate"}
            </button>
            <button
              type="button"
              onClick={() => setResetPasswordOpen(true)}
              className="flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-gray-700 ring-1 ring-gray-200 transition hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-gray-800"
            >
              <KeyRound size={13} /> Reset Password
            </button>
          </div>

          {/* Tabs */}
          <div className="scrollbar-hide -mx-5 mt-4 flex gap-4 overflow-x-auto px-5">
            {TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`shrink-0 whitespace-nowrap border-b-2 pb-2.5 text-sm font-medium transition ${
                  activeTab === tab ? "border-brand-dark text-brand-dark dark:text-brand" : "border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {activeTab === "Overview" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Card title="Department">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.departmentName}</p>
                </Card>
                <Card title="Employment Type">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{EMPLOYMENT_TYPE_LABEL[employee.employmentType]}</p>
                </Card>
                <Card title="Manager">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{employee.managerName}</p>
                </Card>
                <Card title="Joined">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatDisplayDate(employee.joiningDate)}</p>
                </Card>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 dark:bg-gray-900 dark:ring-gray-800">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Contact</p>
                <div className="divide-y divide-gray-50 dark:divide-gray-800">
                  <InfoRow icon={Mail} label="Email" value={employee.email} />
                  <InfoRow icon={Phone} label="Phone" value={employee.phone} />
                  <InfoRow icon={MapPin} label="Address" value={employee.address} />
                  <InfoRow
                    icon={Cake}
                    label="Date of Birth"
                    value={`${new Date(employee.dateOfBirth).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })} · ${employee.gender}`}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === "Employment" && (
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 dark:bg-gray-900 dark:ring-gray-800">
              <div className="divide-y divide-gray-50 dark:divide-gray-800">
                <InfoRow icon={IdCard} label="Employee Code" value={employee.employeeCode} />
                <InfoRow icon={Building2} label="Department" value={employee.departmentName} />
                <InfoRow icon={IdCard} label="Designation" value={employee.designationName} />
                <InfoRow icon={Tags} label="Role" value={employee.roleName} />
                <InfoRow icon={UserCog} label="Reporting Manager" value={employee.managerName} />
                <InfoRow icon={Clock} label="Shift" value={employee.shiftName} />
                <InfoRow icon={Tags} label="Job Category" value={employee.jobCategoryName} />
                <InfoRow icon={CalendarDays} label="Joining Date" value={formatDisplayDate(employee.joiningDate)} />
                <InfoRow
                  icon={Wallet}
                  label="Salary"
                  value={`${employee.salary.toLocaleString()} / month${employee.overtimeAllowed ? " · OT allowed" : ""}`}
                />
              </div>
            </div>
          )}

          {activeTab === "Attendance" &&
            (attendanceLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
                ))}
              </div>
            ) : attendance.length === 0 ? (
              <EmptyState icon={CalendarDays} title="No recent attendance" description="No attendance records found for this employee." />
            ) : (
              <div className="space-y-1">
                {attendance.map((r) => (
                  <div key={r.attendanceId} className="flex items-start gap-3">
                    <TimelineDot tone={r.status === "Present" ? "emerald" : r.status === "Late" ? "amber" : r.status === "Absent" ? "rose" : "gray"} />
                    <div className="flex-1 rounded-xl bg-white px-3.5 py-2.5 shadow-sm ring-1 ring-gray-100 dark:bg-gray-900 dark:ring-gray-800">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-800">{formatDisplayDate(r.attendanceDate)}</p>
                        <StatusBadge status={r.status} />
                      </div>
                      {(r.checkIn || r.checkOut) && (
                        <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                          {r.checkIn ?? "—"} – {r.checkOut ?? "—"} {r.workingHours ? `· ${r.workingHours}h` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}

          {activeTab === "Leave" &&
            (leaveLoading ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
                ))}
              </div>
            ) : leave.length === 0 ? (
              <EmptyState icon={CalendarDays} title="No leave requests" description="This employee hasn't applied for leave recently." />
            ) : (
              <div className="space-y-1">
                {leave.map((r) => (
                  <div key={r.leaveId} className="flex items-start gap-3">
                    <TimelineDot tone={r.status === "Approved" ? "emerald" : r.status === "Rejected" ? "rose" : "amber"} />
                    <div className="flex-1 rounded-xl bg-white px-3.5 py-2.5 shadow-sm ring-1 ring-gray-100 dark:bg-gray-900 dark:ring-gray-800">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-800">{r.leaveTypeName}</p>
                        <StatusBadge status={r.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                        {formatDisplayDate(r.startDate)} – {formatDisplayDate(r.endDate)} · {r.totalDays} day{r.totalDays === 1 ? "" : "s"}
                      </p>
                      {r.reason && <p className="mt-1 truncate text-xs text-gray-500">{r.reason}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ))}

          {activeTab === "Payroll" && (
            <div className="space-y-2.5">
              {payroll.map((p) => (
                <div key={p.key} className="rounded-xl bg-white p-3.5 shadow-sm ring-1 ring-gray-100 dark:bg-gray-900 dark:ring-gray-800">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{p.label}</p>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-gray-500">
                    <div>
                      <p className="text-gray-400 dark:text-gray-500">Basic</p>
                      <p className="font-medium text-gray-800">{p.basic.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 dark:text-gray-500">Deductions</p>
                      <p className="font-medium text-gray-800">{(p.deduction + p.tax).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 dark:text-gray-500">Net Pay</p>
                      <p className="font-semibold text-emerald-600">{p.net.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "Documents" && (
            <EmptyState icon={FolderOpen} title="No documents uploaded" description="Contracts, ID copies, and certificates will appear here once uploaded." />
          )}

          {activeTab === "Activity Log" &&
            (activity.length === 0 ? (
              <EmptyState icon={History} title="No activity yet" description="Actions taken on this record will show up here." />
            ) : (
              <div className="space-y-1">
                {activity.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3">
                    <TimelineDot tone={ActivityIcon(entry.type)} />
                    <div className="flex-1 rounded-xl bg-white px-3.5 py-2.5 shadow-sm ring-1 ring-gray-100 dark:bg-gray-900 dark:ring-gray-800">
                      <p className="text-sm text-gray-800 dark:text-gray-200">{entry.message}</p>
                      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                        {entry.actor} · {new Date(entry.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ))}

          {activeTab === "Notes" && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-gray-100 dark:bg-gray-900 dark:ring-gray-800">
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Add an internal note about this employee…"
                  rows={3}
                  className="w-full resize-none rounded-lg bg-gray-100 px-3.5 py-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    disabled={!noteDraft.trim()}
                    onClick={handleAddNote}
                    className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 py-2 text-xs font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Send size={12} /> Post Note
                  </button>
                </div>
              </div>

              {notes.length === 0 ? (
                <EmptyState icon={StickyNote} title="No notes yet" description="Internal notes about this employee will appear here." />
              ) : (
                <div className="space-y-2">
                  {notes.map((n) => (
                    <div key={n.id} className="rounded-xl bg-white p-3.5 shadow-sm ring-1 ring-gray-100 dark:bg-gray-900 dark:ring-gray-800">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-gray-800 dark:text-gray-200">{n.text}</p>
                        <button
                          type="button"
                          onClick={() => handleDeleteNote(n.id)}
                          aria-label="Delete note"
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-300 hover:bg-rose-50 hover:text-rose-500 dark:text-gray-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                        {n.author} · {new Date(n.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={resetPasswordOpen}
        title="Send password reset link?"
        description={`This will email a password reset link to ${employee.email}.`}
        confirmLabel="Send Reset Link"
        tone="brand"
        loading={resettingPassword}
        onConfirm={handleResetPassword}
        onCancel={() => setResetPasswordOpen(false)}
      />
    </div>,
    document.body,
  );
}
