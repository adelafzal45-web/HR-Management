import { useEffect, useState, type FormEvent } from "react";
import { Plus, CalendarX2, Check, X } from "lucide-react";
import StatusBadge from "@/components/common/StatusBadge";
import EmptyState from "@/components/common/EmptyState";
import Modal from "@/components/dialogs/Modal";
import { PrimaryButton } from "@/components/forms/FormField";
import { useToast } from "@/app/providers/ToastContext";
import { adminLeaveApi, type AdminLeaveRequest, type AdminLeaveStatus } from "@/modules/settings/api/adminOpsApi";
import { leaveApi, type LeaveType } from "@/api/hrApi";

const STATUS_OPTIONS: AdminLeaveStatus[] = ["Pending", "Approved", "Rejected"];

type Decision = { request: AdminLeaveRequest; action: "approve" | "reject" };

export default function EmployeeLeaveTab({ employeeId }: { employeeId: string }) {
 const toast = useToast();

 const [rows, setRows] = useState<AdminLeaveRequest[]>([]);
 const [loading, setLoading] = useState(true);
 const [statusFilter, setStatusFilter] = useState<AdminLeaveStatus | "">("");

 const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
 const [modalOpen, setModalOpen] = useState(false);
 const [leaveTypeName, setLeaveTypeName] = useState("");
 const [startDate, setStartDate] = useState("");
 const [endDate, setEndDate] = useState("");
 const [reason, setReason] = useState("");
 const [formError, setFormError] = useState<string | null>(null);
 const [submitting, setSubmitting] = useState(false);

 const [decision, setDecision] = useState<Decision | null>(null);
 const [deciding, setDeciding] = useState(false);
 const [decisionReason, setDecisionReason] = useState("");
 const [decisionError, setDecisionError] = useState<string | null>(null);

 const load = () => {
 setLoading(true);
 adminLeaveApi
 .list({ employeeId, status: statusFilter, pageSize: 500 })
 .then((res) => setRows(res.data))
 .catch(() => toast.showError("Couldn't load leave requests."))
 .finally(() => setLoading(false));
 };

 useEffect(() => {
 load();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [employeeId, statusFilter]);

 useEffect(() => {
 leaveApi.getLeaveTypes().then(setLeaveTypes).catch(() => undefined);
 }, []);

 const openModal = () => {
 setLeaveTypeName(leaveTypes[0]?.leaveTypeName ?? "");
 setStartDate("");
 setEndDate("");
 setReason("");
 setFormError(null);
 setModalOpen(true);
 };

 const handleSubmit = async (e: FormEvent) => {
 e.preventDefault();
 setFormError(null);
 if (!leaveTypeName || !startDate || !endDate || !reason.trim()) {
 setFormError("Please fill in all fields.");
 return;
 }
 if (endDate < startDate) {
 setFormError("End date can't be before the start date.");
 return;
 }
 setSubmitting(true);
 try {
 await adminLeaveApi.applyFor(employeeId, { leaveTypeName, startDate, endDate, reason: reason.trim() });
 toast.showSuccess("Leave request filed.");
 setModalOpen(false);
 load();
 } catch (err) {
 setFormError(err instanceof Error ? err.message : "Couldn't submit the leave request.");
 } finally {
 setSubmitting(false);
 }
 };

 const openDecision = (request: AdminLeaveRequest, action: Decision["action"]) => {
 setDecision({ request, action });
 setDecisionReason("");
 setDecisionError(null);
 };

 // The backend requires a note for Approved/Rejected — it's what the employee
 // reads in the notification — so it's collected and validated here rather
 // than letting the PATCH come back as a 400.
 const handleDecide = async (e: FormEvent) => {
 e.preventDefault();
 if (!decision) return;

 const note = decisionReason.trim();
 if (!note) {
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
 await adminLeaveApi.approve(decision.request.leaveId, note);
 toast.showSuccess("Leave request approved.");
 } else {
 await adminLeaveApi.reject(decision.request.leaveId, note);
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

 return (
 <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
 <div className="flex flex-wrap items-center justify-between gap-3">
 <h3 className="text-sm font-semibold text-gray-900">Leave Requests</h3>
 <div className="flex flex-wrap items-center gap-2">
 <select
 value={statusFilter}
 onChange={(e) => setStatusFilter(e.target.value as AdminLeaveStatus | "")}
 className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/50"
 aria-label="Filter by status"
 >
 <option value="">All Status</option>
 {STATUS_OPTIONS.map((s) => (
 <option key={s} value={s}>
 {s}
 </option>
 ))}
 </select>
 <button
 type="button"
 onClick={openModal}
 className="flex min-h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
 >
 <Plus size={14} /> File Leave
 </button>
 </div>
 </div>

 <div className="mt-5 overflow-x-auto">
 {loading ? (
 <div className="space-y-2">
 {[...Array(4)].map((_, i) => (
 <div key={i} className="h-11 animate-pulse rounded-lg bg-gray-100" />
 ))}
 </div>
 ) : rows.length === 0 ? (
 <EmptyState icon={CalendarX2} title="No leave requests found" description="Requests filed for this employee will show up here." />
 ) : (
 <table className="w-full min-w-[560px] text-left text-sm">
 <thead>
 <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
 <th className="pb-3 font-medium">Type</th>
 <th className="pb-3 font-medium">Dates</th>
 <th className="pb-3 font-medium">Days</th>
 <th className="pb-3 font-medium">Reason</th>
 <th className="pb-3 font-medium">Status</th>
 <th className="pb-3 font-medium text-right">Actions</th>
 </tr>
 </thead>
 <tbody>
 {rows.map((r) => (
 <tr key={r.leaveId} className="border-b border-gray-50 align-top last:border-0">
 <td className="py-3 font-medium text-gray-900">{r.leaveTypeName}</td>
 <td className="py-3 text-gray-600">
 {new Date(r.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })} –{" "}
 {new Date(r.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
 </td>
 <td className="py-3 text-gray-600">{r.totalDays}</td>
 <td className="max-w-[200px] truncate py-3 text-gray-600" title={r.reason}>
 {r.reason}
 </td>
 <td className="py-3">
 <StatusBadge status={r.status} />
 </td>
 <td className="py-3 text-right">
 {r.status === "Pending" ? (
 <div className="flex items-center justify-end gap-1.5">
 <button
 type="button"
 onClick={() => openDecision(r, "approve")}
 aria-label={`Approve leave ${r.leaveId}`}
 className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-emerald-500 transition hover:bg-emerald-50 hover:text-emerald-600"
 >
 <Check size={16} />
 </button>
 <button
 type="button"
 onClick={() => openDecision(r, "reject")}
 aria-label={`Reject leave ${r.leaveId}`}
 className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-rose-400 transition hover:bg-rose-50 hover:text-rose-600"
 >
 <X size={16} />
 </button>
 </div>
 ) : (
 <span className="text-xs text-gray-400">Decided</span>
 )}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 )}
 </div>

 <Modal open={modalOpen} title="File a Leave Request" onClose={() => setModalOpen(false)}>
 <form onSubmit={handleSubmit}>
 <label className="mb-4 block">
 <span className="mb-2 block text-sm font-medium text-gray-900">Leave Type</span>
 <select
 value={leaveTypeName}
 onChange={(e) => setLeaveTypeName(e.target.value)}
 className="w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
 >
 {leaveTypes.map((lt) => (
 <option key={lt.leaveTypeId} value={lt.leaveTypeName}>
 {lt.leaveTypeName}
 </option>
 ))}
 </select>
 </label>

 <div className="mb-4 grid grid-cols-1 gap-3 xs:grid-cols-2">
 <label className="block">
 <span className="mb-2 block text-sm font-medium text-gray-900">Start Date</span>
 <input
 type="date"
 value={startDate}
 onChange={(e) => setStartDate(e.target.value)}
 className="w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
 />
 </label>
 <label className="block">
 <span className="mb-2 block text-sm font-medium text-gray-900">End Date</span>
 <input
 type="date"
 value={endDate}
 min={startDate || undefined}
 onChange={(e) => setEndDate(e.target.value)}
 className="w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
 />
 </label>
 </div>

 <label className="mb-5 block">
 <span className="mb-2 block text-sm font-medium text-gray-900">Reason</span>
 <textarea
 value={reason}
 onChange={(e) => setReason(e.target.value)}
 rows={3}
 placeholder="Briefly describe the reason for this leave"
 className="w-full resize-none rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
 />
 </label>

 {formError && <p className="mb-4 text-sm text-rose-600">{formError}</p>}

 <PrimaryButton type="submit" loading={submitting}>
 Submit Request
 </PrimaryButton>
 </form>
 </Modal>

 <Modal
 open={!!decision}
 title={decision?.action === "approve" ? "Approve leave request" : "Reject leave request"}
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
 <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Employee's reason</p>
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
 </div>
 );
}
