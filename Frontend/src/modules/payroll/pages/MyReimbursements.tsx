// My Claims (spec §2, employee side) — an employee claims back money they
// already spent, and HR approves it. Every call here goes to
// `/reimbursements/me*`, which carries NO permission server-side and resolves
// the employee from the JWT; an employee never holds `reimbursements.*`, so the
// org-wide queue is unreachable from this page.
//
// The payroll consequence is worth stating on screen, because it is the part
// employees ask about: an approved claim is paid by the next payroll run as a
// NON-TAXABLE earning — it raises net pay without touching gross or tax, since
// reimbursing a receipt is repayment, not income.

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Receipt, Plus, Trash2, Info, ExternalLink } from "lucide-react";
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
  reimbursementsApi,
  REIMBURSEMENT_CATEGORIES,
  type Reimbursement,
} from "@/modules/payroll/api/reimbursementsApi";
import { money, shortDate, humanize } from "@/modules/payroll/utils/format";

const selectClass =
  "w-full rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60";

type FormState = {
  title: string;
  category: string;
  amount: string;
  expense_date: string;
  description: string;
  receipt_url: string;
};

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): FormState => ({
  title: "",
  category: REIMBURSEMENT_CATEGORIES[0],
  amount: "",
  expense_date: today(),
  description: "",
  receipt_url: "",
});

/** Only a pending claim is still the employee's to take back. */
const canWithdraw = (claim: Reimbursement) => claim.status === "pending";

export default function MyReimbursementsPage() {
  const status = useBackendStatus();
  const toast = useToast();
  const { user } = useAuth();
  const tabs = getPayrollTabs(user?.role);

  const [claims, setClaims] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [withdrawing, setWithdrawing] = useState<Reimbursement | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await reimbursementsApi.listMine();
      // Most recent expense first — that is the order employees scan in.
      setClaims(
        [...data].sort((a, b) =>
          a.expense_date < b.expense_date ? 1 : a.expense_date > b.expense_date ? -1 : 0,
        ),
      );
    } catch (error) {
      toast.showError(
        error instanceof Error ? error.message : "Could not load your claims.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Three numbers worth surfacing: what HR still has to look at, what is
  // approved and waiting for the next run, and what has already been paid.
  const summary = useMemo(() => {
    const sum = (s: Reimbursement["status"]) =>
      claims.filter((c) => c.status === s).reduce((t, c) => t + Number(c.amount), 0);
    return { pending: sum("pending"), approved: sum("approved"), paid: sum("paid") };
  }, [claims]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!form.title.trim()) {
      toast.showError("Give the claim a short title.");
      return;
    }
    if (!amount || amount <= 0) {
      toast.showError("Enter an amount greater than 0.");
      return;
    }
    if (!form.expense_date) {
      toast.showError("When was the expense?");
      return;
    }
    setSaving(true);
    try {
      await reimbursementsApi.submit({
        title: form.title.trim(),
        category: form.category,
        amount,
        expense_date: form.expense_date,
        description: form.description.trim() || undefined,
        receipt_url: form.receipt_url.trim() || undefined,
      });
      toast.showSuccess("Claim submitted. HR will review it.");
      setFormOpen(false);
      setForm(emptyForm());
      await load();
    } catch (error) {
      toast.showError(
        error instanceof Error ? error.message : "Could not submit the claim.",
      );
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async () => {
    if (!withdrawing) return;
    try {
      await reimbursementsApi.withdrawMine(withdrawing.reimbursement_id);
      toast.showSuccess("Claim withdrawn.");
      setWithdrawing(null);
      await load();
    } catch (error) {
      toast.showError(
        error instanceof Error ? error.message : "Could not withdraw the claim.",
      );
    }
  };

  return (
    <DashboardLayout title="Payroll" activeKey="payroll">
      <SectionTabs tabs={tabs} active="my-claims" />
      <BackendStatusBanner status={status} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">My Expense Claims</h2>
          <p className="mt-1 text-sm text-gray-500">
            Approved claims are paid with your next payslip and are not taxed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setForm(emptyForm());
            setFormOpen(true);
          }}
          className="flex items-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand-dark px-5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
        >
          <Plus size={16} /> Submit Claim
        </button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Awaiting HR", value: summary.pending },
          { label: "Approved — next payslip", value: summary.approved },
          { label: "Already paid", value: summary.paid },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              {card.label}
            </p>
            <p className="mt-1.5 text-xl font-semibold text-gray-900">
              {money(card.value)}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Claim History</h3>

        <div className="mt-4 overflow-x-auto">
          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          ) : claims.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No Claims Yet"
              description="Submit an expense and track its approval here."
            />
          ) : (
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                  <th className="pb-3 font-medium">Claim</th>
                  <th className="pb-3 font-medium">Category</th>
                  <th className="pb-3 font-medium">Expense Date</th>
                  <th className="pb-3 font-medium">Amount</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => (
                  <tr
                    key={c.reimbursement_id}
                    className="border-b border-gray-50 last:border-0"
                  >
                    <td className="py-3">
                      <p className="font-medium text-gray-900">{c.title}</p>
                      {c.description && (
                        <p className="mt-0.5 max-w-xs truncate text-xs text-gray-500">
                          {c.description}
                        </p>
                      )}
                      {c.decision_note && (
                        <p className="mt-1 flex items-start gap-1.5 text-xs text-gray-600">
                          <Info size={13} className="mt-0.5 shrink-0 text-gray-400" />
                          {c.decision_note}
                        </p>
                      )}
                    </td>
                    <td className="py-3 text-gray-600">{c.category}</td>
                    <td className="py-3 text-gray-600">{shortDate(c.expense_date)}</td>
                    <td className="py-3 font-medium text-gray-900 tabular-nums">
                      {money(c.amount)}
                    </td>
                    <td className="py-3">
                      <StatusBadge status={humanize(c.status)} />
                    </td>
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-2">
                        {c.receipt_url && (
                          <a
                            href={c.receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex min-h-11 min-w-11 items-center justify-center rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                            aria-label="Open receipt"
                          >
                            <ExternalLink size={16} />
                          </a>
                        )}
                        {canWithdraw(c) && (
                          <button
                            type="button"
                            onClick={() => setWithdrawing(c)}
                            className="flex min-h-11 min-w-11 items-center justify-center rounded-full p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
                            aria-label="Withdraw claim"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Submit an Expense Claim"
        description="Claim money you have already spent on the company's behalf."
      >
        <form onSubmit={submit}>
          <FormField
            label="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Client visit — fuel"
            required
          />

          <label className="mb-5 block">
            <span className="mb-2 block text-[15px] font-medium text-gray-900">
              Category
            </span>
            <select
              className={selectClass}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {REIMBURSEMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <FormField
            label="Amount spent"
            type="number"
            min="0.01"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            placeholder="4500"
            required
          />
          <FormField
            label="Expense date"
            type="date"
            max={today()}
            value={form.expense_date}
            onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
            required
          />
          <FormField
            label="Details (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Return trip to the Lahore office"
          />
          <FormField
            label="Receipt link (optional)"
            type="url"
            value={form.receipt_url}
            onChange={(e) => setForm({ ...form, receipt_url: e.target.value })}
            placeholder="https://drive.example.com/receipt.pdf"
          />

          <p className="mb-5 rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-600">
            Once HR approves, the amount is added to your next payslip as a
            non-taxable reimbursement — it increases your net pay without
            changing your gross salary or income tax.
          </p>

          <PrimaryButton type="submit" loading={saving}>
            Submit Claim
          </PrimaryButton>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!withdrawing}
        title="Withdraw this claim?"
        description={`"${withdrawing?.title ?? ""}" will be removed. You can submit it again later.`}
        confirmLabel="Withdraw"
        tone="danger"
        onConfirm={withdraw}
        onCancel={() => setWithdrawing(null)}
      />
    </DashboardLayout>
  );
}
