import { useEffect, useState, type ElementType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
 X,
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
 ShieldAlert,
 Briefcase,
 Boxes,
 CalendarDays,
 User,
 Pencil,
 ExternalLink,
} from "lucide-react";
import StatusBadge from "@/components/common/StatusBadge";
import { formatDisplayDate } from "@/utils/formatDate";
import type { Employee } from "@/modules/employees/api/employeeApi";
import EmployeeAvatar from "@/modules/employees/components/EmployeeAvatar";
import EmployeeAttendanceTab from "@/modules/employees/components/EmployeeAttendanceTab";
import EmployeeLeaveTab from "@/modules/employees/components/EmployeeLeaveTab";
import EmployeePayrollTab from "@/modules/employees/components/EmployeePayrollTab";

type Props = {
 open: boolean;
 employee: Employee | null;
 onClose: () => void;
};

type TabKey = "profile" | "attendance" | "leave" | "payroll";

const TABS: { key: TabKey; label: string }[] = [
 { key: "profile", label: "Profile" },
 { key: "attendance", label: "Attendance" },
 { key: "leave", label: "Leave" },
 { key: "payroll", label: "Payroll" },
];

const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
 full_time: "Full-Time",
 part_time: "Part-Time",
 contract: "Contract",
 intern: "Intern",
};

function InfoRow({ icon: Icon, label, value }: { icon: ElementType; label: string; value: ReactNode }) {
 return (
 <div className="flex items-start gap-3 py-2.5">
 <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-gray-400 ring-1 ring-gray-100">
 <Icon size={15} />
 </span>
 <div className="min-w-0">
 <p className="text-xs text-gray-400">{label}</p>
 <p className="truncate text-sm font-medium text-gray-800">{value || "—"}</p>
 </div>
 </div>
 );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
 return (
 <div className="mb-6 last:mb-0">
 <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h3>
 <div className="rounded-2xl bg-gray-50/60 p-4">
 <div className="divide-y divide-gray-100">{children}</div>
 </div>
 </div>
 );
}

// Quick-look side panel opened from a grid row/name/avatar click — a
// lighter-weight alternative to navigating away to the full View Details
// page. Surfaces every field the existing Employee API/model actually
// returns (nothing fabricated — e.g. there's no distinct "team" or "work
// location" field on the Employee record today, only department,
// designation and manager, so those are what's shown). Slides in from the
// right, is fully keyboard/overlay dismissible, scrolls independently of
// the page behind it, and hands off to the existing View Details / Edit
// routes — reusing the same employee data and routes, nothing duplicated.
export default function EmployeeDetailsDrawer({ open, employee, onClose }: Props) {
 const navigate = useNavigate();
 // Keep the panel mounted for one extra tick after `open` flips to false so
 // the slide-out transition can play, instead of unmounting instantly.
 const [mounted, setMounted] = useState(open);
 const [visible, setVisible] = useState(false);
 const [tab, setTab] = useState<TabKey>("profile");

 useEffect(() => {
 if (open) {
 setMounted(true);
 // Mount off-screen first, then flip to visible on the next frame so
 // the transform transition actually animates instead of snapping in.
 const raf = requestAnimationFrame(() => setVisible(true));
 return () => cancelAnimationFrame(raf);
 }
 setVisible(false);
 const timeout = setTimeout(() => setMounted(false), 300);
 return () => clearTimeout(timeout);
 }, [open]);

 // Always land back on Profile when the drawer is opened for a (possibly
 // different) employee, rather than keeping whatever tab was left selected.
 useEffect(() => {
 if (open) setTab("profile");
 }, [open, employee?.employeeId]);

 useEffect(() => {
 if (!open) return;
 const onKeyDown = (e: KeyboardEvent) => {
 if (e.key === "Escape") onClose();
 };
 document.addEventListener("keydown", onKeyDown);
 const previousOverflow = document.body.style.overflow;
 document.body.style.overflow = "hidden";
 return () => {
 document.removeEventListener("keydown", onKeyDown);
 document.body.style.overflow = previousOverflow;
 };
 }, [open, onClose]);

 if (!mounted || !employee) return null;

 const dob = employee.dateOfBirth
 ? `${formatDisplayDate(employee.dateOfBirth)}${employee.gender ? ` · ${employee.gender}` : ""}`
 : employee.gender;

 return createPortal(
 <div className="fixed inset-0 z-[110] flex justify-end">
 <div
 className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
 onClick={onClose}
 aria-hidden
 />
 <div
 role="dialog"
 aria-modal="true"
 aria-label={`${employee.firstName} ${employee.lastName} — employee details`}
 className={`relative flex h-full w-full flex-col overflow-hidden bg-white shadow-xl transition-transform duration-300 ease-out sm:max-w-lg lg:max-w-2xl ${
 visible ? "translate-x-0" : "translate-x-full"
 }`}
 >
 <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-4 py-3 sm:px-5 sm:py-4">
 <h2 className="text-base font-semibold text-gray-900">Employee Details</h2>
 <button
 type="button"
 onClick={onClose}
 aria-label="Close employee details"
 className="flex min-h-9 min-w-9 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
 >
 <X size={18} />
 </button>
 </div>

 <div className="border-b border-gray-100 px-4 py-3 sm:px-5">
 <div className="flex items-center gap-1 rounded-full bg-gray-100 p-1">
 {TABS.map(({ key, label }) => (
 <button
 key={key}
 type="button"
 onClick={() => setTab(key)}
 className={`min-h-8 flex-1 rounded-full px-2 text-xs font-semibold transition sm:px-4 sm:text-sm ${
 tab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
 }`}
 >
 {label}
 </button>
 ))}
 </div>
 </div>

 <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
 {tab === "attendance" ? (
 <EmployeeAttendanceTab employeeId={employee.employeeId} />
 ) : tab === "leave" ? (
 <EmployeeLeaveTab employeeId={employee.employeeId} />
 ) : tab === "payroll" ? (
 <EmployeePayrollTab employee={employee} />
 ) : (
 <>
 {/* Profile photo + name */}
 <div className="mb-6 flex flex-col items-center gap-3 text-center">
 <EmployeeAvatar
 firstName={employee.firstName}
 lastName={employee.lastName}
 photo={employee.profileImageUrl}
 thumb={employee.profileImageThumbUrl}
 size={80}
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
 <StatusBadge status={employee.status} />
 </div>

 <Section title="Employment">
 <InfoRow icon={IdCard} label="Employee ID" value={employee.employeeCode} />
 <InfoRow icon={Building2} label="Department" value={employee.departmentName} />
 <InfoRow icon={Tags} label="Designation" value={employee.designationName} />
 <InfoRow icon={UserCog} label="Team Lead" value={employee.managerName} />
 <InfoRow icon={Boxes} label="Job Category" value={employee.jobCategoryName} />
 <InfoRow icon={Briefcase} label="Employment Type" value={EMPLOYMENT_TYPE_LABEL[employee.employmentType] ?? employee.employmentType} />
 <InfoRow icon={Clock} label="Shift" value={employee.shiftName} />
 <InfoRow icon={CalendarDays} label="Joining Date" value={formatDisplayDate(employee.joiningDate)} />
 </Section>

 <Section title="Contact Information">
 <InfoRow icon={Mail} label="Email" value={employee.email} />
 <InfoRow icon={Phone} label="Phone" value={employee.phone} />
 <InfoRow icon={MapPin} label="Address" value={employee.address} />
 </Section>

 <Section title="Personal Information">
 <InfoRow icon={Cake} label="Date of Birth" value={dob} />
 <InfoRow icon={User} label="Gender" value={employee.gender} />
 </Section>

 <Section title="Compensation & Access">
 <InfoRow
 icon={Wallet}
 label="Salary"
 value={employee.salary ? `${employee.salary.toLocaleString()} / month${employee.overtimeAllowed ? " · OT allowed" : ""}` : undefined}
 />
 <InfoRow icon={ShieldAlert} label="Role" value={employee.roleName} />
 </Section>
 </>
 )}
 </div>

 <div className="flex items-center gap-2 border-t border-gray-100 px-4 py-3 sm:gap-2.5 sm:px-5 sm:py-4">
 <button
 type="button"
 onClick={() => {
 onClose();
 navigate(`/employees/${employee.employeeId}/edit`);
 }}
 className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full border border-gray-200 px-2 text-xs font-medium text-gray-600 transition hover:bg-gray-50 sm:px-4 sm:text-sm"
 >
 <Pencil size={14} className="shrink-0" /> <span className="truncate">Edit Employee</span>
 </button>
 <button
 type="button"
 onClick={() => {
 onClose();
 navigate(`/employees/${employee.employeeId}`);
 }}
 className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-2 text-xs font-semibold text-gray-900 shadow-sm transition hover:brightness-95 sm:px-4 sm:text-sm"
 >
 <span className="truncate">View Full Profile</span> <ExternalLink size={14} className="shrink-0" />
 </button>
 </div>
 </div>
 </div>,
 document.body,
 );
}
