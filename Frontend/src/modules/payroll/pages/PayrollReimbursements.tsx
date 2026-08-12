// Expense Claims (spec §2) — the HR/Admin approval queue for employee
// reimbursements. Employees submit from `/payroll/my-reimbursements`; everything
// here is the org-wide side and is permission-gated (`reimbursements.view` to
// read, `reimbursements.approve` to decide).
//
// What approving means, since it is easy to under-estimate: the next payroll run
// picks up every approved-and-unpaid claim whose expense date falls inside the
// period and pays it as a NON-TAXABLE earning — net pay rises, gross and income
// tax do not move. The run then flips the claim to `paid` and stamps the period
// and payslip on it, which is what makes a double payment impossible.
//
// Engine list endpoints return a BARE ARRAY — filter + paginate client-side,
// total from the filtered length (same as PayrollLoans).

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Receipt, Check, X, ExternalLink, Trash2, Pencil, Inbox } from "lucide-react";
import PayrollLayout from "./PayrollLayout";
import DataTable, { type DataTableColumn } from "@/components/tables/DataTable";
import Modal from "@/components/dialogs/Modal";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import { FormField, PrimaryButton } from "@/components/forms/FormField";
import StatusBadge from "@/components/common/StatusBadge";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import {
  reimbursementsApi,
  REIMBURSEMENT_STATUSES,
  REIMBURSEMENT_CATEGORIES,
  type Reimbursement,
  type ReimbursementStatus,
} from "@/modules/payroll/api/reimbursementsApi";
import { employeesApi, type Employee } from "@/modules/employees/api/employeeApi";
import { money, shortDate, humanize } from "@/modules/payroll/utils/format";

const selectClass =
  "min-h-10 rounded-full bg-gray-100 px-4 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/60";

// The modal form uses the taller, block-style select the employee-facing
// "Submit Claim" form uses — distinct from the pill filter select above.
const formSelectClass =
  "w-full rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60";

type EditFormState = {
  title: string;
  category: string;
  amount: string;
  expense_date: string;
  description: string;
  receipt_url: string;
};

const toEditForm = (c: Reimbursement): EditFormState => ({
  title: c.title,
  category: c.category,
  amount: String(c.amount),
  expense_date: c.expense_date.slice(0, 10),
  description: c.description ?? "",
  receipt_url: c.receipt_url ?? "",
});

/** Once a claim is paid it's stamped onto a payslip — editing or deleting it
 *  afterwards would leave that payslip referencing a changed or missing row. */
const isLocked = (c: Reimbursement) => c.status === "paid";

export default function PayrollReimbursementsPage() {
  const status = useBackendStatus();
  const toast = useToast();

  const [rows, setRows] = useState<Reimbursement[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReimbursementStatus | "">("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [approving, setApproving] = useState<Reimbursement | null>(null);
  const [rejecting, setRejecting] = useState<Reimbursement | null>(null);
  const [note, setNote] = useState("");
  const [deciding, setDeciding] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Reimbursement | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [editTarget, setEditTarget] = useState<Reimbursement | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const nameOf = useMemo(() => {
    const map = new Map(
      employees.map((e) => [e.employeeId, `${e.firstName} ${e.lastName}`.trim()]),
    );
    return (id: string) => map.get(id) ?? "Unknown employee";
  }, [employees]);

  // Claims carry the employee relation; fall back to the roster lookup.
  const employeeLabel = (c: Reimbursement) =>
    c.user ? `${c.user.first_name} ${c.user.last_name}`.trim() : nameOf(c.user_id);

  const load = () => {
    setLoading(true);
    reimbursementsApi
      .list()
      .then(setRows)
      .catch(() => toast.showError("Couldn't load expense claims."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    employeesApi
      .list({ status: "active", pageSize: 500 })
      .then((r) => setEmployees(r.data))
      .catch(() => setEmployees([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => setPage(1), [search, statusFilter, pageSize]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        employeeLabel(r).toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, statusFilter, nameOf]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  // Oldest first — whoever has waited longest is decided first.
  const pending = useMemo(
    () =>
      rows
        .filter((r) => r.status === "pending")
        .sort((a, b) =>
          a.expense_date < b.expense_date ? -1 : a.expense_date > b.expense_date ? 1 : 0,
        ),
    [rows],
  );

  const totals = useMemo(() => {
    const sum = (s: ReimbursementStatus) =>
      rows.filter((r) => r.status === s).reduce((t, r) => t + Number(r.amount), 0);
    return { pending: sum("pending"), approved: sum("approved"), paid: sum("paid") };
  }, [rows]);

  const decide = async (event: FormEvent) => {
    event.preventDefault();
    const target = approving ?? rejecting;
    if (!target) return;
    setDeciding(true);
    try {
      if (approving) {
        await reimbursementsApi.approve(approving.reimbursement_id, note.trim() || undefined);
        toast.showSuccess("Claim approved — it will be paid with the next run.");
      } else {
        await reimbursementsApi.reject(target.reimbursement_id, note.trim() || undefined);
        toast.showSuccess("Claim rejected.");
      }
      setApproving(null);
      setRejecting(null);
      setNote("");
      load();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't record the decision.");
    } finally {
      setDeciding(false);
    }
  };

  const openEdit = (c: Reimbursement) => {
    setEditError(null);
    setEditTarget(c);
    setEditForm(toEditForm(c));
  };

  const submitEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editTarget || !editForm) return;
    const amount = Number(editForm.amount);
    if (!editForm.title.trim()) {
      setEditError("Give the claim a short title.");
      return;
    }
    if (!amount || amount <= 0) {
      setEditError("Enter an amount greater than 0.");
      return;
    }
    if (!editForm.expense_date) {
      setEditError("When was the expense?");
      return;
    }
    setEditError(null);
    setSaving(true);
    try {
      await reimbursementsApi.update(editTarget.reimbursement_id, {
        title: editForm.title.trim(),
        category: editForm.category,
        amount,
        expense_date: editForm.expense_date,
        description: editForm.description.trim() || undefined,
        receipt_url: editForm.receipt_url.trim() || undefined,
      });
      toast.showSuccess("Claim updated.");
      setEditTarget(null);
      setEditForm(null);
      load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Couldn't update the claim.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await reimbursementsApi.remove(deleteTarget.reimbursement_id);
      toast.showSuccess("Claim deleted.");
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't delete the claim.");
    } finally {
      setDeleting(false);
    }
  };

  const columns: DataTableColumn<Reimbursement>[] = [
    {
      key: "title",
      label: "Claim",
      render: (c) => (
        <div className="min-w-0">
          <span className="block font-medium text-gray-900">{c.title}</span>
          <span className="block text-xs text-gray-400">{employeeLabel(c)}</span>
        </div>
      ),
    },
    {
      key: "category",
      label: "Category",
      render: (c) => <span className="text-gray-600">{c.category}</span>,
      hideBelow: "md",
    },
    {
      key: "expense_date",
      label: "Expense Date",
      render: (c) => <span className="text-gray-600">{shortDate(c.expense_date)}</span>,
      hideBelow: "lg",
    },
    {
      key: "amount",
      label: "Amount",
      render: (c) => (
        <span className="font-semibold tabular-nums text-gray-900">{money(c.amount)}</span>
      ),
      align: "right",
    },
    {
      key: "status",
      label: "Status",
      render: (c) => <StatusBadge status={humanize(c.status)} />,
      align: "center",
    },
  ];

  return (
    <PayrollLayout activeTab="/payroll/reimbursements">
      <BackendStatusBanner status={status} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[
          ["Awaiting your decision", totals.pending],
          ["Approved — next run pays", totals.approved],
          ["Paid to date", totals.paid],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              {label}
            </p>
            <p className="mt-1.5 text-xl font-semibold tabular-nums text-gray-900">
              {money(Number(value))}
            </p>
          </div>
        ))}
      </div>

      {/* The queue. Only rendered when there is something to decide, so the
          screen is otherwise just the claim register. */}
      {pending.length > 0 && (
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-brand/30">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-light text-brand-dark">
              <Inbox size={16} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Pending Claims ({pending.length})
              </h2>
              <p className="text-xs text-gray-500">
                Approved claims are paid with the next payroll run as a non-taxable
                amount — net pay only, no effect on gross or tax.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {pending.map((c) => (
              <div
                key={c.reimbursement_id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {c.title}
                    <span className="ml-2 font-normal text-gray-500">
                      · {employeeLabel(c)}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {money(c.amount)} · {c.category} · spent {shortDate(c.expense_date)}
                  </p>
                  {c.description && (
                    <p className="mt-1 text-xs italic text-gray-500">“{c.description}”</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {c.receipt_url && (
                    <a
                      href={c.receipt_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-9 items-center gap-1.5 rounded-full border border-gray-200 px-3 text-sm font-medium text-gray-600 transition hover:bg-white"
                    >
                      <ExternalLink size={14} /> Receipt
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setNote("");
                      setApproving(c);
                    }}
                    className="flex min-h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
                  >
                    <Check size={15} /> Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNote("");
                      setRejecting(c);
                    }}
                    className="flex min-h-9 items-center gap-1.5 rounded-full border border-gray-200 px-4 text-sm font-medium text-gray-600 transition hover:bg-white"
                  >
                    <X size={15} /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={paged}
        rowKey={(c) => c.reimbursement_id}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search claims…"
        emptyIcon={Receipt}
        emptyTitle="No expense claims"
        emptyDescription="Employees submit claims from their own Payroll screen. Approved claims are paid as a non-taxable amount with the next payroll run."
        page={page}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[10, 25, 50]}
        total={filtered.length}
        onPageChange={setPage}
        toolbarRight={
          <select
            className={selectClass}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ReimbursementStatus | "")}
          >
            <option value="">All statuses</option>
            {REIMBURSEMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
        }
        actions={(c) => (
          <div className="flex items-center justify-end gap-1.5">
            {c.status === "pending" && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setNote("");
                    setApproving(c);
                  }}
                  aria-label={`Approve ${c.title}`}
                  className="flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-brand-dark transition hover:bg-brand-light"
                >
                  <Check size={15} /> Approve
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNote("");
                    setRejecting(c);
                  }}
                  aria-label={`Reject ${c.title}`}
                  className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                >
                  <X size={15} />
                </button>
              </>
            )}
            {/* A paid claim is already on a payslip — editing or deleting it
                would leave that payslip referencing a changed or missing row. */}
            {!isLocked(c) && (
              <>
                <button
                  type="button"
                  onClick={() => openEdit(c)}
                  aria-label={`Edit ${c.title}`}
                  className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(c)}
                  aria-label={`Delete ${c.title}`}
                  className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </div>
        )}
      />

      {/* One form for both decisions — they differ only in the verb and in what
          the note means to the employee. */}
      <Modal
        open={!!approving || !!rejecting}
        onClose={() => {
          setApproving(null);
          setRejecting(null);
        }}
        title={approving ? "Approve Expense Claim" : "Reject Expense Claim"}
        description={(() => {
          const target = approving ?? rejecting;
          if (!target) return "";
          return `${employeeLabel(target)} — ${target.title} (${money(target.amount)}, ${target.category})`;
        })()}
      >
        <form onSubmit={decide}>
          <label className="mb-5 block">
            <span className="mb-2 block text-[15px] font-medium text-gray-900">
              {approving ? "Note (optional)" : "Reason (shown to the employee)"}
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={
                approving
                  ? "Receipt verified — will be paid with this month's payroll."
                  : "No receipt attached — please resubmit with the invoice."
              }
              className="w-full resize-none rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
            />
          </label>

          {approving && (
            <p className="mb-5 rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-600">
              {money(approving.amount)} will be added to{" "}
              {employeeLabel(approving).split(" ")[0]}'s next payslip as a
              non-taxable reimbursement. Gross salary and income tax are unaffected.
            </p>
          )}

          <div className="flex flex-col-reverse gap-2.5 xs:flex-row">
            <button
              type="button"
              onClick={() => {
                setApproving(null);
                setRejecting(null);
              }}
              className="min-h-11 flex-1 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <div className="flex-1">
              {approving ? (
                <PrimaryButton type="submit" loading={deciding}>
                  Approve Claim
                </PrimaryButton>
              ) : (
                <button
                  type="submit"
                  disabled={deciding}
                  className="min-h-11 w-full rounded-full bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deciding ? "Please wait…" : "Reject Claim"}
                </button>
              )}
            </div>
          </div>
        </form>
      </Modal>

      {/* Edit — the same fields the employee submits with, editable by HR up
          until the claim is paid. */}
      <Modal
        open={!!editTarget && !!editForm}
        onClose={() => {
          setEditTarget(null);
          setEditForm(null);
        }}
        title="Edit Expense Claim"
        description={editTarget ? `${employeeLabel(editTarget)} — filed ${shortDate(editTarget.created_at)}` : ""}
      >
        {editForm && (
          <form onSubmit={submitEdit}>
            {editError && (
              <p className="mb-4 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">
                {editError}
              </p>
            )}
            <FormField
              label="Title"
              value={editForm.title}
              onChange={(e) => setEditForm((f) => (f ? { ...f, title: e.target.value } : f))}
            />
            <label className="mb-5 block">
              <span className="mb-2 block text-[15px] font-medium text-gray-900">Category</span>
              <select
                className={formSelectClass}
                value={editForm.category}
                onChange={(e) => setEditForm((f) => (f ? { ...f, category: e.target.value } : f))}
              >
                {REIMBURSEMENT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                label="Amount"
                type="number"
                min="0"
                step="0.01"
                value={editForm.amount}
                onChange={(e) => setEditForm((f) => (f ? { ...f, amount: e.target.value } : f))}
              />
              <FormField
                label="Expense date"
                type="date"
                value={editForm.expense_date}
                onChange={(e) => setEditForm((f) => (f ? { ...f, expense_date: e.target.value } : f))}
              />
            </div>
            <FormField
              label={<>Receipt URL <span className="font-normal text-gray-400">(optional)</span></>}
              value={editForm.receipt_url}
              onChange={(e) => setEditForm((f) => (f ? { ...f, receipt_url: e.target.value } : f))}
            />
            <label className="mb-5 block">
              <span className="mb-2 block text-[15px] font-medium text-gray-900">
                Description <span className="font-normal text-gray-400">(optional)</span>
              </span>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm((f) => (f ? { ...f, description: e.target.value } : f))}
                rows={3}
                className="w-full resize-none rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
              />
            </label>

            {editTarget && editTarget.status !== "pending" && (
              <p className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-700">
                This claim is already {editTarget.status} — changing it here does not undo that
                decision. Reject and ask the employee to resubmit if the amount needs HR review again.
              </p>
            )}

            <div className="flex flex-col-reverse gap-2.5 xs:flex-row">
              <button
                type="button"
                onClick={() => {
                  setEditTarget(null);
                  setEditForm(null);
                }}
                className="min-h-11 flex-1 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <div className="flex-1">
                <PrimaryButton type="submit" loading={saving}>
                  Save Changes
                </PrimaryButton>
              </div>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.title}"?`}
        description="The claim is removed permanently. This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </PayrollLayout>
  );
}
