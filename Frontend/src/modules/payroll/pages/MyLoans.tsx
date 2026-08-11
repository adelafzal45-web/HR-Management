// My Loans (spec §9, employee side) — an employee applies for a salary advance
// and tracks it here. Deliberately a self-service page, not a slice of the HR
// screen: every call goes to `/payroll-loans/me*`, which carries NO permission
// server-side and resolves the employee from the JWT. An employee never holds
// `payroll-loans.*`, so they cannot see or touch anyone else's loan.
//
// What the employee can do: apply, watch the status, read the installment
// ladder once HR approves, and withdraw a request while it is still pending.
// Setting the installment amount is HR's call at approval time, so this form
// asks for a preferred number of months instead.

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { HandCoins, Plus, Trash2, Info } from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import SectionTabs from "@/components/common/SectionTabs";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import StatusBadge from "@/components/common/StatusBadge";
import EmptyState from "@/components/common/EmptyState";
import Modal from "@/components/dialogs/Modal";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import { FormField, PrimaryButton } from "@/components/forms/FormField";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useAuth } from "@/app/providers/AuthContext";
import { useToast } from "@/app/providers/ToastContext";
import { getPayrollTabs } from "@/config/featureTabs";
import {
  payrollLoansApi,
  type EmployeeLoan,
} from "@/modules/payroll/api/payrollLoansApi";
import { money, shortDate, humanize } from "@/modules/payroll/utils/format";

type FormState = { name: string; principal: string; months: string; remarks: string };

const EMPTY_FORM: FormState = { name: "", principal: "", months: "12", remarks: "" };

/** Only a pending request is the employee's to take back. */
const canWithdraw = (loan: EmployeeLoan) => loan.status === "pending";

export default function MyLoansPage() {
  const status = useBackendStatus();
  const toast = useToast();
  const { user } = useAuth();
  const tabs = getPayrollTabs(user?.role);

  const [loans, setLoans] = useState<EmployeeLoan[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [withdrawing, setWithdrawing] = useState<EmployeeLoan | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setLoans(await payrollLoansApi.listMine());
    } catch (error) {
      toast.showError(
        error instanceof Error ? error.message : "Could not load your loans.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const outstanding = useMemo(
    () =>
      loans
        .filter((l) => l.status === "active")
        .reduce((sum, l) => sum + Number(l.outstanding), 0),
    [loans],
  );
  const pendingCount = useMemo(
    () => loans.filter((l) => l.status === "pending").length,
    [loans],
  );

  // The installment HR is likely to set, shown live so the ask is informed.
  const suggested = useMemo(() => {
    const principal = Number(form.principal);
    const months = Number(form.months);
    if (!principal || !months || months < 1) return null;
    return principal / months;
  }, [form.principal, form.months]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const principal = Number(form.principal);
    if (!form.name.trim()) {
      toast.showError("Tell us what the advance is for.");
      return;
    }
    if (!principal || principal <= 0) {
      toast.showError("Enter an amount greater than 0.");
      return;
    }
    setSaving(true);
    try {
      await payrollLoansApi.request({
        name: form.name.trim(),
        principal,
        requested_months: Number(form.months) || undefined,
        remarks: form.remarks.trim() || undefined,
      });
      toast.showSuccess("Request submitted. HR will review it.");
      setFormOpen(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (error) {
      toast.showError(
        error instanceof Error ? error.message : "Could not submit the request.",
      );
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async () => {
    if (!withdrawing) return;
    try {
      await payrollLoansApi.withdrawMine(withdrawing.loan_id);
      toast.showSuccess("Request withdrawn.");
      setWithdrawing(null);
      await load();
    } catch (error) {
      toast.showError(
        error instanceof Error ? error.message : "Could not withdraw the request.",
      );
    }
  };

  return (
    <DashboardLayout title="Payroll" activeKey="payroll">
      <SectionTabs tabs={tabs} active="my-loans" />
      <BackendStatusBanner status={status} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">My Loans &amp; Advances</h2>
          <p className="mt-1 text-sm text-gray-500">
            {outstanding > 0
              ? `${money(outstanding)} still to repay across your active loans.`
              : "You have nothing outstanding."}
            {pendingCount > 0 &&
              ` ${pendingCount} request${pendingCount > 1 ? "s" : ""} awaiting HR.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setForm(EMPTY_FORM);
            setFormOpen(true);
          }}
          className="flex items-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand-dark px-5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
        >
          <Plus size={16} /> Apply for Loan
        </button>
      </div>

      {loading ? (
        <div className="mt-6 h-40 animate-pulse rounded-2xl bg-gray-100" />
      ) : loans.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={HandCoins}
            title="No Loans Yet"
            description="Apply for a salary advance and it will show up here once HR reviews it."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {loans.map((loan) => {
            const isOpen = expanded === loan.loan_id;
            const installments = loan.installments ?? [];
            return (
              <div
                key={loan.loan_id}
                className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">{loan.name}</h3>
                      <StatusBadge status={humanize(loan.status)} />
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Requested {shortDate(loan.requested_at ?? loan.created_at)} ·{" "}
                      {money(loan.principal)} principal
                      {loan.status === "active" &&
                        ` · ${money(loan.installment_amount)} per period`}
                    </p>
                    {loan.decision_note && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-gray-600">
                        <Info size={14} className="mt-0.5 shrink-0 text-gray-400" />
                        {loan.decision_note}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Outstanding</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {money(loan.outstanding)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {installments.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : loan.loan_id)}
                      className="rounded-full bg-gray-100 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200"
                    >
                      {isOpen ? "Hide schedule" : `View schedule (${installments.length})`}
                    </button>
                  )}
                  {canWithdraw(loan) && (
                    <button
                      type="button"
                      onClick={() => setWithdrawing(loan)}
                      className="flex items-center gap-1.5 rounded-full bg-red-50 px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-100"
                    >
                      <Trash2 size={14} /> Withdraw
                    </button>
                  )}
                </div>

                {isOpen && (
                  <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-gray-100">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                          <th className="px-4 py-2.5">#</th>
                          <th className="px-4 py-2.5">Amount</th>
                          <th className="px-4 py-2.5">Status</th>
                          <th className="px-4 py-2.5">Deducted</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {installments.map((inst) => (
                          <tr key={inst.installment_id}>
                            <td className="px-4 py-2.5 text-gray-500">{inst.sequence}</td>
                            <td className="px-4 py-2.5 font-medium text-gray-900">
                              {money(inst.amount)}
                            </td>
                            <td className="px-4 py-2.5">
                              <StatusBadge status={humanize(inst.status)} />
                            </td>
                            <td className="px-4 py-2.5 text-gray-500">
                              {inst.deducted_on ? shortDate(inst.deducted_on) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Apply for a Loan or Advance"
      >
        <form onSubmit={submit}>
          <FormField
            label="What is it for?"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Salary advance — medical"
            required
          />
          <FormField
            label="Amount requested"
            type="number"
            min="1"
            step="0.01"
            value={form.principal}
            onChange={(e) => setForm({ ...form, principal: e.target.value })}
            placeholder="120000"
            required
          />
          <FormField
            label="Preferred repayment months"
            type="number"
            min="1"
            max="120"
            value={form.months}
            onChange={(e) => setForm({ ...form, months: e.target.value })}
          />
          <FormField
            label="Anything HR should know (optional)"
            value={form.remarks}
            onChange={(e) => setForm({ ...form, remarks: e.target.value })}
            placeholder="Repayment can start next month"
          />

          <p className="mb-5 rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-600">
            {suggested
              ? `That works out to about ${money(suggested)} per period. `
              : ""}
            HR sets the final installment when they approve, and nothing is
            deducted from your pay until then.
          </p>

          <PrimaryButton type="submit" loading={saving}>
            Submit Request
          </PrimaryButton>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!withdrawing}
        title="Withdraw this request?"
        description={`"${withdrawing?.name ?? ""}" will be removed. You can apply again at any time.`}
        confirmLabel="Withdraw"
        tone="danger"
        onConfirm={withdraw}
        onCancel={() => setWithdrawing(null)}
      />
    </DashboardLayout>
  );
}
