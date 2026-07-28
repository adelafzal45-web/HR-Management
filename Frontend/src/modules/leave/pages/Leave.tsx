import { useEffect, useState, type FormEvent } from "react";
import { Plus, CalendarX2 } from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import StatusBadge from "@/components/common/StatusBadge";
import EmptyState from "@/components/common/EmptyState";
import Modal from "@/components/dialogs/Modal";
import { PrimaryButton } from "@/components/forms/FormField";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { leaveApi, type LeaveType, type LeaveRequest } from "@/api/hrApi";

type Balance = {
  leaveTypeId: string;
  leaveTypeName: string;
  allocated: number;
  used: number;
  pending: number;
  remaining: number;
};

export default function Leave() {
  const status = useBackendStatus();

  const [balances, setBalances] = useState<Balance[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [b, t, r] = await Promise.all([leaveApi.getBalance(), leaveApi.getLeaveTypes(), leaveApi.getMyLeaves()]);
      setBalances(b);
      setLeaveTypes(t);
      setRequests(r);
    } catch {
      // Individual sections show their own empty states below.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openModal = () => {
    setLeaveTypeId(leaveTypes[0]?.leaveTypeId ?? "");
    setStartDate("");
    setEndDate("");
    setReason("");
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!leaveTypeId || !startDate || !endDate || !reason.trim()) {
      setFormError("Please fill in all fields.");
      return;
    }
    setSubmitting(true);
    try {
      await leaveApi.applyLeave({ leaveTypeId, startDate, endDate, reason: reason.trim() });
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

      <div className="mt-4 grid grid-cols-1 gap-4 xs:grid-cols-2 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? [...Array(4)].map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-100" />)
          : balances.map((b) => (
              <div key={b.leaveTypeId} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                <p className="text-sm font-medium text-gray-500">{b.leaveTypeName}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-brand-dark">
                  {b.remaining}
                  <span className="text-sm font-normal text-gray-400"> / {b.allocated} days</span>
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  {b.used} used{b.pending > 0 ? ` · ${b.pending} pending` : ""}
                </p>
              </div>
            ))}
      </div>

      <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <h2 className="text-base font-semibold text-gray-900">Leave History</h2>

        <div className="mt-4 overflow-x-auto">
          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-11 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <EmptyState icon={CalendarX2} title="No leave requests yet" description="Requests you submit will show up here." />
          ) : (
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                  <th className="pb-3 font-medium">Type</th>
                  <th className="pb-3 font-medium">Dates</th>
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
                      {new Date(r.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })} –{" "}
                      {new Date(r.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </td>
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
              placeholder="Briefly describe the reason for your leave"
              className="w-full resize-none rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
            />
          </label>

          {formError && <p className="mb-4 text-sm text-rose-600">{formError}</p>}

          <PrimaryButton type="submit" loading={submitting}>
            Submit Request
          </PrimaryButton>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
