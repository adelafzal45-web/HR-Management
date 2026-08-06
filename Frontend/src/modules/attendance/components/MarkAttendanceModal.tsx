// HR/Admin "Mark Attendance" dialog. One modal, two modes:
//
// • Single — pick one employee, a date, a status and (for working statuses)
// check-in/out times. Posts through adminAttendanceApi.markFor.
// • Bulk — mark every active employee, a whole department, or a hand-picked
// set for one date/status. Posts through adminAttendanceApi.bulkMark and
// shows the per-employee result (marked vs skipped) returned by the server.
//
// Times are optional here: an HR user marking a roster of "Absent" or
// "On Leave" days has no stamps to enter, and the working statuses simply
// validate that check-out is after check-in when both are given.

import { useMemo, useState, type FormEvent } from "react";
import { Users, User, Check, X, type LucideIcon } from "lucide-react";
import Modal from "@/components/dialogs/Modal";
import { PrimaryButton } from "@/components/forms/FormField";
import { useToast } from "@/app/providers/ToastContext";
import {
 adminAttendanceApi,
 type AdminAttendanceStatus,
 type BulkMarkResult,
} from "@/modules/settings/api/adminOpsApi";
import type { Department } from "@/modules/settings/api/settingsApi";
import type { Employee } from "@/modules/employees/api/employeeApi";

const STATUS_OPTIONS: AdminAttendanceStatus[] = ["Present", "Late", "Half-Day", "Absent", "On Leave", "Holiday"];
const WORKING_STATUSES: AdminAttendanceStatus[] = ["Present", "Late", "Half-Day"];

type Mode = "single" | "bulk";
type BulkScope = "all" | "department" | "selected";

const todayIso = () => new Date().toISOString().slice(0, 10);

const fieldClass =
 "w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60";
const labelClass = "mb-1.5 block text-sm font-medium text-gray-900";

export default function MarkAttendanceModal({
 open,
 onClose,
 onMarked,
 departments,
 employees,
}: {
 open: boolean;
 onClose: () => void;
 onMarked: () => void;
 departments: Department[];
 employees: Employee[];
}) {
 const toast = useToast();

 const [mode, setMode] = useState<Mode>("single");
 const [date, setDate] = useState(todayIso());
 const [status, setStatus] = useState<AdminAttendanceStatus>("Present");
 const [checkIn, setCheckIn] = useState("09:00");
 const [checkOut, setCheckOut] = useState("17:00");

 // Single
 const [employeeId, setEmployeeId] = useState("");

 // Bulk
 const [scope, setScope] = useState<BulkScope>("all");
 const [bulkDepartment, setBulkDepartment] = useState("");
 const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
 const [empSearch, setEmpSearch] = useState("");

 const [error, setError] = useState<string | null>(null);
 const [saving, setSaving] = useState(false);
 const [result, setResult] = useState<BulkMarkResult | null>(null);

 const needsTimes = WORKING_STATUSES.includes(status);

 const filteredEmployees = useMemo(() => {
 const q = empSearch.trim().toLowerCase();
 if (!q) return employees;
 return employees.filter(
 (e) =>
 `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
 e.employeeCode.toLowerCase().includes(q),
 );
 }, [employees, empSearch]);

 const resetAndClose = () => {
 setResult(null);
 setError(null);
 onClose();
 };

 const validateTimes = () => {
 if (needsTimes && checkIn && checkOut && checkOut <= checkIn) {
 setError("Check-out must be after check-in.");
 return false;
 }
 return true;
 };

 const submitSingle = async () => {
 if (!employeeId) {
 setError("Please choose an employee.");
 return;
 }
 if (!validateTimes()) return;
 setSaving(true);
 setError(null);
 try {
 await adminAttendanceApi.markFor(employeeId, {
 attendanceDate: date,
 status,
 checkIn: needsTimes ? checkIn : null,
 checkOut: needsTimes ? checkOut : null,
 });
 toast.showSuccess("Attendance marked.");
 onMarked();
 resetAndClose();
 } catch (err) {
 setError(err instanceof Error ? err.message : "Couldn't mark attendance.");
 } finally {
 setSaving(false);
 }
 };

 const submitBulk = async () => {
 if (scope === "department" && !bulkDepartment) {
 setError("Please choose a department.");
 return;
 }
 if (scope === "selected" && selectedIds.size === 0) {
 setError("Please select at least one employee.");
 return;
 }
 if (!validateTimes()) return;
 setSaving(true);
 setError(null);
 try {
 const res = await adminAttendanceApi.bulkMark({
 attendanceDate: date,
 status,
 checkIn: needsTimes ? checkIn : null,
 checkOut: needsTimes ? checkOut : null,
 allActive: scope === "all",
 departmentId: scope === "department" ? bulkDepartment : undefined,
 employeeIds: scope === "selected" ? [...selectedIds] : undefined,
 });
 setResult(res);
 toast.showSuccess(`Marked ${res.marked} of ${res.total} employees.`);
 onMarked();
 } catch (err) {
 setError(err instanceof Error ? err.message : "Couldn't mark attendance.");
 } finally {
 setSaving(false);
 }
 };

 const handleSubmit = (e: FormEvent) => {
 e.preventDefault();
 if (mode === "single") void submitSingle();
 else void submitBulk();
 };

 const toggleSelected = (id: string) => {
 setSelectedIds((prev) => {
 const next = new Set(prev);
 if (next.has(id)) next.delete(id);
 else next.add(id);
 return next;
 });
 };

 return (
 <Modal
 open={open}
 onClose={resetAndClose}
 title="Mark Attendance"
 description="Record attendance for a single employee or many at once."
 maxWidth="max-w-xl"
 >
 {result ? (
 <BulkResultView result={result} onDone={resetAndClose} />
 ) : (
 <form onSubmit={handleSubmit}>
 {/* Mode switch */}
 <div className="mb-5 inline-flex rounded-full bg-gray-100 p-1">
 <ModeButton active={mode === "single"} onClick={() => setMode("single")} icon={User} label="Single Employee" />
 <ModeButton active={mode === "bulk"} onClick={() => setMode("bulk")} icon={Users} label="Multiple / All" />
 </div>

 {mode === "single" ? (
 <label className="mb-4 block">
 <span className={labelClass}>Employee</span>
 <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={fieldClass}>
 <option value="">Select an employee…</option>
 {employees.map((e) => (
 <option key={e.employeeId} value={e.employeeId}>
 {e.firstName} {e.lastName} ({e.employeeCode})
 </option>
 ))}
 </select>
 </label>
 ) : (
 <div className="mb-4 space-y-3">
 <div>
 <span className={labelClass}>Who to mark</span>
 <div className="grid grid-cols-3 gap-2">
 <ScopeButton active={scope === "all"} onClick={() => setScope("all")} label="All active" />
 <ScopeButton active={scope === "department"} onClick={() => setScope("department")} label="Department" />
 <ScopeButton active={scope === "selected"} onClick={() => setScope("selected")} label="Pick some" />
 </div>
 </div>

 {scope === "department" && (
 <label className="block">
 <span className={labelClass}>Department</span>
 <select value={bulkDepartment} onChange={(e) => setBulkDepartment(e.target.value)} className={fieldClass}>
 <option value="">Select a department…</option>
 {departments.map((d) => (
 <option key={d.departmentId} value={d.departmentId}>
 {d.name}
 </option>
 ))}
 </select>
 </label>
 )}

 {scope === "selected" && (
 <div>
 <div className="mb-2 flex items-center justify-between gap-2">
 <span className={labelClass + " mb-0"}>Employees ({selectedIds.size} selected)</span>
 {selectedIds.size > 0 && (
 <button
 type="button"
 onClick={() => setSelectedIds(new Set())}
 className="text-xs font-medium text-gray-500 hover:text-red-600"
 >
 Clear
 </button>
 )}
 </div>
 <input
 type="search"
 value={empSearch}
 onChange={(e) => setEmpSearch(e.target.value)}
 placeholder="Search employees…"
 className="mb-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/60"
 />
 <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-1.5">
 {filteredEmployees.length === 0 ? (
 <p className="px-2 py-3 text-center text-xs text-gray-400">No employees match.</p>
 ) : (
 filteredEmployees.map((e) => (
 <label
 key={e.employeeId}
 className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-gray-50"
 >
 <input
 type="checkbox"
 checked={selectedIds.has(e.employeeId)}
 onChange={() => toggleSelected(e.employeeId)}
 className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/60"
 />
 <span className="min-w-0 flex-1 truncate text-gray-700">
 {e.firstName} {e.lastName}
 </span>
 <span className="shrink-0 text-xs text-gray-400">{e.employeeCode}</span>
 </label>
 ))
 )}
 </div>
 </div>
 )}
 </div>
 )}

 <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
 <label className="block">
 <span className={labelClass}>Date</span>
 <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
 </label>
 <label className="block">
 <span className={labelClass}>Status</span>
 <select value={status} onChange={(e) => setStatus(e.target.value as AdminAttendanceStatus)} className={fieldClass}>
 {STATUS_OPTIONS.map((s) => (
 <option key={s} value={s}>
 {s}
 </option>
 ))}
 </select>
 </label>
 </div>

 {needsTimes && (
 <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
 <label className="block">
 <span className={labelClass}>Check-in</span>
 <input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className={fieldClass} />
 </label>
 <label className="block">
 <span className={labelClass}>Check-out</span>
 <input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className={fieldClass} />
 </label>
 </div>
 )}

 {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

 <div className="mt-6 flex flex-col-reverse gap-2.5 xs:flex-row">
 <button
 type="button"
 onClick={resetAndClose}
 className="min-h-11 flex-1 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
 >
 Cancel
 </button>
 <div className="flex-1">
 <PrimaryButton type="submit" loading={saving}>
 {mode === "single" ? "Mark Attendance" : "Mark Selected"}
 </PrimaryButton>
 </div>
 </div>
 </form>
 )}
 </Modal>
 );
}

function ModeButton({
 active,
 onClick,
 icon: Icon,
 label,
}: {
 active: boolean;
 onClick: () => void;
 icon: LucideIcon;
 label: string;
}) {
 return (
 <button
 type="button"
 onClick={onClick}
 className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition sm:text-sm ${
 active ? "bg-brand text-white shadow-sm" : "text-gray-500 hover:text-gray-800"
 }`}
 aria-pressed={active}
 >
 <Icon size={15} />
 {label}
 </button>
 );
}

function ScopeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
 return (
 <button
 type="button"
 onClick={onClick}
 className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
 active ? "border-brand bg-brand-light/40 text-brand-dark" : "border-gray-200 text-gray-600 hover:border-brand/50"
 }`}
 aria-pressed={active}
 >
 {label}
 </button>
 );
}

function BulkResultView({ result, onDone }: { result: BulkMarkResult; onDone: () => void }) {
 return (
 <div>
 <div className="mb-4 grid grid-cols-3 gap-3">
 <div className="rounded-xl bg-emerald-50 p-3 text-center">
 <p className="text-2xl font-extrabold text-emerald-600">{result.marked}</p>
 <p className="text-xs font-medium text-emerald-700">Marked</p>
 </div>
 <div className="rounded-xl bg-amber-50 p-3 text-center">
 <p className="text-2xl font-extrabold text-amber-600">{result.skipped}</p>
 <p className="text-xs font-medium text-amber-700">Skipped</p>
 </div>
 <div className="rounded-xl bg-gray-100 p-3 text-center">
 <p className="text-2xl font-extrabold text-gray-700">{result.total}</p>
 <p className="text-xs font-medium text-gray-500">Total</p>
 </div>
 </div>

 <div className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-gray-100 p-1.5">
 {result.results.map((r) => (
 <div key={r.employeeId} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm">
 <span
 className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
 r.ok ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
 }`}
 >
 {r.ok ? <Check size={12} /> : <X size={12} />}
 </span>
 <span className="min-w-0 flex-1 truncate text-gray-700">{r.employeeName}</span>
 <span className="shrink-0 text-xs text-gray-400">{r.ok ? "Marked" : r.reason ?? "Skipped"}</span>
 </div>
 ))}
 </div>

 <div className="mt-6">
 <PrimaryButton type="button" onClick={onDone}>
 Done
 </PrimaryButton>
 </div>
 </div>
 );
}
