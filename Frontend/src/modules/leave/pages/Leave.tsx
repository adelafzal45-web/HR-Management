import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, CalendarX2, History } from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import StatusBadge from "@/components/common/StatusBadge";
import EmptyState from "@/components/common/EmptyState";
import ErrorState from "@/components/common/ErrorState";
import Modal from "@/components/dialogs/Modal";
import SectionTabs from "@/components/common/SectionTabs";
import { PrimaryButton } from "@/components/forms/FormField";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useAuth } from "@/app/providers/AuthContext";
import { getLeaveTabs } from "@/config/featureTabs";
import {
 leaveApi,
 type LeaveType,
 type LeaveRequest,
 type LeaveDurationType,
 type MyLeaveBalance,
 type MyLeaveHistoryEntry,
} from "@/api/hrApi";

/** The two things "Leave History" can mean here, kept as an explicit toggle:
 * the employee's own requests, and the ledger that explains their balance. */
type HistoryView = "requests" | "ledger";

/** Ledger entry types, coloured by whether they credit or debit the balance. */
const LEDGER_TONES: Record<string, string> = {
 Entitlement: "bg-emerald-50 text-emerald-700",
 Adjustment: "bg-amber-50 text-amber-700",
 "Leave Taken": "bg-rose-50 text-rose-700",
 "Carry Forward": "bg-sky-50 text-sky-700",
 Expiry: "bg-gray-100 text-gray-600",
};

// The four values the backend's `duration_type` column accepts. Only
// "Multiple Days" spans a range; the other three are single-day, and the two
// half-day options charge 0.5 instead of 1.
const DURATIONS: { value: LeaveDurationType; label: string; hint: string }[] = [
 { value: "Full Day", label: "Full Day", hint: "Charged as 1 day" },
 { value: "First Half", label: "First Half", hint: "Charged as 0.5 day" },
 { value: "Second Half", label: "Second Half", hint: "Charged as 0.5 day" },
 { value: "Multiple Days", label: "Multiple Days", hint: "Working days in range" },
];

const isSingleDay = (d: LeaveDurationType) => d !== "Multiple Days";

/** What the request will cost, mirroring the backend's rule. */
function estimateDays(duration: LeaveDurationType, start: string, end: string): number {
 if (duration === "First Half" || duration === "Second Half") return 0.5;
 if (duration === "Full Day") return 1;
 if (!start || !end) return 0;
 const days = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
 return days > 0 ? days : 0;
}

export default function Leave() {
 const status = useBackendStatus();
 const { user } = useAuth();
 const tabs = getLeaveTabs(user?.role);

 const [balances, setBalances] = useState<MyLeaveBalance[]>([]);
 const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
 const [requests, setRequests] = useState<LeaveRequest[]>([]);
 const [ledger, setLedger] = useState<MyLeaveHistoryEntry[]>([]);
 const [historyView, setHistoryView] = useState<HistoryView>("requests");
 const [loading, setLoading] = useState(true);
 // Each of the four calls in loadAll can fail on its own; a rejection is
 // surfaced in its own region rather than silently rendering as empty.
 const [balancesError, setBalancesError] = useState<unknown>(null);
 const [leaveTypesError, setLeaveTypesError] = useState<unknown>(null);
 const [requestsError, setRequestsError] = useState<unknown>(null);
 const [ledgerError, setLedgerError] = useState<unknown>(null);

 const [modalOpen, setModalOpen] = useState(false);
 const [leaveTypeId, setLeaveTypeId] = useState("");
 const [duration, setDuration] = useState<LeaveDurationType>("Full Day");
 const [startDate, setStartDate] = useState("");
 const [endDate, setEndDate] = useState("");
 const [reason, setReason] = useState("");
 const [formError, setFormError] = useState<string | null>(null);
 const [submitting, setSubmitting] = useState(false);

 // allSettled, not all: the ledger is the newest of the four calls, so a
 // backend that predates /leave-entitlements/me/history would otherwise take
 // the balance cards and request list down with it. Each rejection is kept as
 // that section's own error, so a failure surfaces there instead of blanking
 // the others or reading as an innocuous empty state.
 const loadAll = useCallback(async () => {
 setLoading(true);
 const [b, t, r, h] = await Promise.allSettled([
 leaveApi.getBalance(),
 leaveApi.getLeaveTypes(),
 leaveApi.getMyLeaves(),
 leaveApi.getMyHistory(),
 ]);
 if (b.status === "fulfilled") { setBalances(b.value); setBalancesError(null); }
 else { setBalances([]); setBalancesError(b.reason); }
 if (t.status === "fulfilled") { setLeaveTypes(t.value); setLeaveTypesError(null); }
 else { setLeaveTypes([]); setLeaveTypesError(t.reason); }
 if (r.status === "fulfilled") { setRequests(r.value); setRequestsError(null); }
 else { setRequests([]); setRequestsError(r.reason); }
 if (h.status === "fulfilled") { setLedger(h.value); setLedgerError(null); }
 else { setLedger([]); setLedgerError(h.reason); }
 setLoading(false);
 }, []);

 useEffect(() => {
 loadAll();
 }, [loadAll]);

 const openModal = () => {
 setLeaveTypeId(leaveTypes[0]?.leaveTypeId ?? "");
 setDuration("Full Day");
 setStartDate("");
 setEndDate("");
 setReason("");
 setFormError(null);
 setModalOpen(true);
 };

 // Single-day durations have no separate end date — keep the two in step so
 // the payload always sends a coherent range.
 const changeDuration = (next: LeaveDurationType) => {
 setDuration(next);
 if (isSingleDay(next)) setEndDate(startDate);
 };

 const changeStartDate = (next: string) => {
 setStartDate(next);
 if (isSingleDay(duration)) setEndDate(next);
 else if (endDate && next && new Date(endDate) < new Date(next)) setEndDate(next);
 };

 const estimated = estimateDays(duration, startDate, endDate);
 const selectedType = leaveTypes.find((lt) => lt.leaveTypeId === leaveTypeId);
 const selectedBalance = balances.find((b) => b.leaveTypeId === leaveTypeId);

 const handleSubmit = async (e: FormEvent) => {
 e.preventDefault();
 setFormError(null);

 const effectiveEnd = isSingleDay(duration) ? startDate : endDate;

 if (!leaveTypeId || !startDate || !effectiveEnd) {
 setFormError("Please choose a leave type and the date(s) you'll be away.");
 return;
 }
 // Mandatory, unlike the HR-facing create which allows backfilling without one.
 if (!reason.trim()) {
 setFormError("Please give a reason for your leave request.");
 return;
 }
 if (new Date(effectiveEnd) < new Date(startDate)) {
 setFormError("End date can't be before the start date.");
 return;
 }

 setSubmitting(true);
 try {
 await leaveApi.applyLeave({
 leaveTypeId,
 leaveTypeName: selectedType?.leaveTypeName ?? "Leave",
 startDate,
 endDate: effectiveEnd,
 durationType: duration,
 reason: reason.trim(),
 });
 setModalOpen(false);
 loadAll();
 } catch (err) {
 setFormError(err instanceof Error ? err.message : "Couldn't submit your leave request.");
 } finally {
 setSubmitting(false);
 }
 };

 return (
 <DashboardLayout title="Leave" activeKey="leave">
 <BackendStatusBanner status={status} />
 <SectionTabs tabs={tabs} active="my-leave" />

 <div className="flex flex-wrap items-center justify-between gap-3">
 <h2 className="text-base font-semibold text-gray-900">Leave Balance</h2>
 <button
 type="button"
 onClick={openModal}
 className="flex items-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand-dark px-5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
 >
 <Plus size={16} /> Apply for Leave
 </button>
 </div>

 {!loading && balancesError ? (
 <div className="mt-4">
 <ErrorState error={balancesError} title="Couldn't load your leave balance" onRetry={loadAll} />
 </div>
 ) : !loading && balances.length === 0 ? (
 <div className="mt-4">
 <EmptyState
 icon={CalendarX2}
 title="No leave entitlement yet"
 description="Once HR assigns your yearly entitlement, your balance per leave type will show up here."
 />
 </div>
 ) : (
 <div className="mt-4 grid grid-cols-1 gap-4 xs:grid-cols-2 sm:grid-cols-2 lg:grid-cols-4">
 {loading
 ? [...Array(4)].map((_, i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-100" />)
 : balances.map((b) => {
 // Pending requests aren't deducted until approval, so show them as
 // a claim on the remaining figure rather than silently ignoring
 // them — otherwise the card reads as more available than it is.
 const available = Math.max(0, b.remaining - b.pending);
 const usedPct = b.allocated > 0 ? Math.min(100, (b.used / b.allocated) * 100) : 0;
 const pendingPct = b.allocated > 0 ? Math.min(100 - usedPct, (b.pending / b.allocated) * 100) : 0;
 return (
 <div key={b.leaveTypeId} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
 <p className="truncate text-sm font-medium text-gray-500" title={b.leaveTypeName}>
 {b.leaveTypeName}
 </p>
 <p className="mt-2 text-2xl font-semibold tracking-tight text-brand-dark">
 {b.remaining}
 <span className="text-sm font-normal text-gray-400"> / {b.allocated} days</span>
 </p>

 <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-gray-100">
 <div className="bg-brand-dark" style={{ width: `${usedPct}%` }} />
 <div className="bg-amber-300" style={{ width: `${pendingPct}%` }} />
 </div>

 <p className="mt-2 text-xs text-gray-400">
 {b.used} used
 {b.pending > 0 ? ` · ${b.pending} pending · ${available} available` : ""}
 </p>
 </div>
 );
 })}
 </div>
 )}

 <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
 <div className="flex flex-wrap items-center justify-between gap-3">
 <h2 className="text-base font-semibold text-gray-900">Leave History</h2>
 <div className="inline-flex rounded-full bg-gray-100 p-1 text-sm font-medium">
 {(
 [
 { key: "requests", label: "My Requests" },
 { key: "ledger", label: "Logs" },
 ] as const
 ).map((v) => (
 <button
 key={v.key}
 type="button"
 onClick={() => setHistoryView(v.key)}
 aria-pressed={historyView === v.key}
 className={`min-h-9 rounded-full px-3.5 py-1.5 transition ${
 historyView === v.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-400"
 }`}
 >
 {v.label}
 </button>
 ))}
 </div>
 </div>

 <div className="mt-4 overflow-x-auto">
 {loading ? (
 <div className="space-y-2">
 {[...Array(3)].map((_, i) => (
 <div key={i} className="h-11 animate-pulse rounded-lg bg-gray-100" />
 ))}
 </div>
 ) : historyView === "ledger" ? (
 ledgerError ? (
 <ErrorState error={ledgerError} title="Couldn't load your balance activity" onRetry={loadAll} />
 ) : ledger.length === 0 ? (
 <EmptyState
 icon={History}
 title="No balance activity yet"
 description="Every entitlement, adjustment and approved leave will be recorded here, so you can see exactly how your balance was built."
 />
 ) : (
 <table className="w-full min-w-[640px] text-left text-sm">
 <thead>
 <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
 <th className="pb-3 font-medium">Date</th>
 <th className="pb-3 font-medium">Leave Type</th>
 <th className="pb-3 font-medium">Entry</th>
 <th className="pb-3 font-medium">Days</th>
 <th className="pb-3 font-medium">Balance</th>
 <th className="pb-3 font-medium">Note</th>
 </tr>
 </thead>
 <tbody>
 {ledger.map((entry) => (
 <tr key={entry.historyId} className="border-b border-gray-50 align-top last:border-0">
 <td className="py-3 whitespace-nowrap text-gray-500">
 {new Date(entry.createdAt).toLocaleDateString(undefined, {
 month: "short",
 day: "numeric",
 year: "numeric",
 })}
 </td>
 <td className="py-3 font-medium text-gray-900">{entry.leaveTypeName}</td>
 <td className="py-3">
 <span
 className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${LEDGER_TONES[entry.type] ?? "bg-gray-100 text-gray-600"}`}
 >
 {entry.type}
 </span>
 </td>
 <td className={`py-3 font-medium ${entry.amount < 0 ? "text-rose-600" : "text-emerald-600"}`}>
 {entry.amount > 0 ? "+" : ""}
 {entry.amount}
 </td>
 <td className="py-3 text-gray-600">{entry.balanceAfter}</td>
 <td className="py-3 max-w-[240px] text-gray-600">
 {entry.note || (
 <span className="text-gray-300">
 {entry.performedByName ? `by ${entry.performedByName}` : "—"}
 </span>
 )}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 )
 ) : requestsError ? (
 <ErrorState error={requestsError} title="Couldn't load your leave requests" onRetry={loadAll} />
 ) : requests.length === 0 ? (
 <EmptyState icon={CalendarX2} title="No leave requests yet" description="Requests you submit will show up here." />
 ) : (
 <table className="w-full min-w-[640px] text-left text-sm">
 <thead>
 <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
 <th className="pb-3 font-medium">Type</th>
 <th className="pb-3 font-medium">Dates</th>
 <th className="pb-3 font-medium">Duration</th>
 <th className="pb-3 font-medium">Days</th>
 <th className="pb-3 font-medium">Reason</th>
 <th className="pb-3 font-medium">Status</th>
 </tr>
 </thead>
 <tbody>
 {requests.map((r) => (
 <tr key={r.leaveId} className="border-b border-gray-50 last:border-0 align-top">
 <td className="py-3 font-medium text-gray-900">{r.leaveTypeName}</td>
 <td className="py-3 text-gray-600">
 {new Date(r.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
 {r.startDate !== r.endDate && (
 <>
 {" – "}
 {new Date(r.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
 </>
 )}
 </td>
 <td className="py-3 text-gray-600">{r.durationType}</td>
 <td className="py-3 text-gray-600">{r.totalDays}</td>
 <td className="py-3 max-w-[220px] truncate text-gray-600" title={r.reason}>
 {r.reason}
 </td>
 <td className="py-3">
 <StatusBadge status={r.status} />
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 )}
 </div>
 </div>

 <Modal open={modalOpen} title="Apply for Leave" onClose={() => setModalOpen(false)}>
 {leaveTypesError && leaveTypes.length === 0 ? (
 <ErrorState error={leaveTypesError} title="Couldn't load leave types" onRetry={loadAll} />
 ) : (
 <form onSubmit={handleSubmit}>
 <label className="mb-4 block">
 <span className="mb-2 block text-sm font-medium text-gray-900">Leave Type</span>
 <select
 value={leaveTypeId}
 onChange={(e) => setLeaveTypeId(e.target.value)}
 className="w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
 >
 {leaveTypes.map((lt) => (
 <option key={lt.leaveTypeId} value={lt.leaveTypeId}>
 {lt.leaveTypeName}
 </option>
 ))}
 </select>
 </label>

 <fieldset className="mb-4">
 <legend className="mb-2 block text-sm font-medium text-gray-900">Duration</legend>
 <div className="grid grid-cols-2 gap-2">
 {DURATIONS.map((d) => {
 const active = duration === d.value;
 return (
 <button
 key={d.value}
 type="button"
 onClick={() => changeDuration(d.value)}
 aria-pressed={active}
 className={`rounded-lg px-3 py-2.5 text-left text-sm transition ring-1 ${
 active
 ? "bg-brand/10 font-semibold text-brand-dark ring-brand/50"
 : "bg-gray-100 text-gray-700 ring-transparent hover:bg-gray-200"
 }`}
 >
 <span className="block">{d.label}</span>
 <span className="mt-0.5 block text-xs font-normal text-gray-500">{d.hint}</span>
 </button>
 );
 })}
 </div>
 </fieldset>

 <div className={`mb-4 grid grid-cols-1 gap-3 ${isSingleDay(duration) ? "" : "xs:grid-cols-2"}`}>
 <label className="block">
 <span className="mb-2 block text-sm font-medium text-gray-900">
 {isSingleDay(duration) ? "Date" : "Start Date"}
 </span>
 <input
 type="date"
 value={startDate}
 onChange={(e) => changeStartDate(e.target.value)}
 className="w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
 />
 </label>
 {!isSingleDay(duration) && (
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
 )}
 </div>

 <label className="mb-4 block">
 <span className="mb-2 block text-sm font-medium text-gray-900">
 Reason <span className="text-rose-600">*</span>
 </span>
 <textarea
 value={reason}
 onChange={(e) => setReason(e.target.value)}
 rows={3}
 required
 placeholder="Briefly describe the reason for your leave"
 className="w-full resize-none rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
 />
 </label>

 {estimated > 0 && (
 <p className="mb-4 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
 This request will use <span className="font-semibold text-gray-900">{estimated}</span> day
 {estimated === 1 ? "" : "s"}
 {selectedBalance
 ? ` of your ${Math.max(0, selectedBalance.remaining - selectedBalance.pending)} available ${selectedBalance.leaveTypeName}`
 : ""}
 .
 {duration === "Multiple Days" && (
 <span className="mt-1 block text-xs text-gray-500">
 Weekends and public holidays are excluded when it's approved, so the final figure may be lower.
 </span>
 )}
 </p>
 )}

 {formError && <p className="mb-4 text-sm text-rose-600">{formError}</p>}

 <PrimaryButton type="submit" loading={submitting}>
 Submit Request
 </PrimaryButton>
 </form>
 )}
 </Modal>
 </DashboardLayout>
 );
}
