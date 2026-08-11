// Loans & Advances (spec §9) — employee loans repaid by fixed installments
// deducted from payroll. HR records the loan (principal + installment amount),
// then "Generate schedule" lays out the installment ladder; the engine deducts
// the active installment for each period as a LOAN_DEDUCTION line and decrements
// `outstanding` idempotently until the loan closes.
//
// Since Phase 3 an employee can also apply themselves (`POST /payroll-loans/me`).
// Those land as `pending`, which the engine ignores entirely — nothing is
// deducted until HR approves here, which sets the real installment and builds
// the schedule. The "Pending Requests" panel above the table is that queue.
//
// Engine list endpoints return a BARE ARRAY — filter + paginate client-side,
// total from the filtered length (same as SalaryComponents).

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  HandCoins,
  Plus,
  Pencil,
  Trash2,
  ListOrdered,
  X,
  Check,
  Inbox,
} from "lucide-react";
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
  payrollLoansApi,
  LOAN_STATUSES,
  type EmployeeLoan,
  type EmployeeLoanPayload,
  type LoanStatus,
} from "@/modules/payroll/api/payrollLoansApi";
import { employeesApi, type Employee } from "@/modules/employees/api/employeeApi";
import { money, shortDate, humanize } from "@/modules/payroll/utils/format";

type FormState = {
  user_id: string;
  name: string;
  principal: string;
  installment_amount: string;
  status: LoanStatus;
  remarks: string;
};

const EMPTY_FORM: FormState = {
  user_id: "",
  name: "",
  principal: "0",
  installment_amount: "0",
  status: "active",
  remarks: "",
};

const selectClass =
  "w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60";

export default function PayrollLoansPage() {
  const status = useBackendStatus();
  const toast = useToast();

  const [rows, setRows] = useState<EmployeeLoan[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeLoan | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<EmployeeLoan | null>(null);
  const [deleting, setDeleting] = useState(false);

  // The loan whose installment schedule is open in the drawer.
  const [scheduleLoan, setScheduleLoan] = useState<EmployeeLoan | null>(null);
  const [scheduling, setScheduling] = useState(false);

  // Employee-filed requests awaiting a decision. `approving` opens the panel
  // where HR sets the installment payroll will actually deduct; `rejecting`
  // collects a note the employee sees on their own screen.
  const [approving, setApproving] = useState<EmployeeLoan | null>(null);
  const [approveInstallment, setApproveInstallment] = useState("0");
  const [approveNote, setApproveNote] = useState("");
  const [rejecting, setRejecting] = useState<EmployeeLoan | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [deciding, setDeciding] = useState(false);

  const nameOf = useMemo(() => {
    const map = new Map(
      employees.map((e) => [e.employeeId, `${e.firstName} ${e.lastName}`.trim()]),
    );
    return (id: string) => map.get(id) ?? "Unknown employee";
  }, [employees]);

  // Requests carry the employee relation; fall back to the roster lookup for
  // rows HR created, which don't.
  const employeeLabel = (l: EmployeeLoan) =>
    l.user ? `${l.user.first_name} ${l.user.last_name}`.trim() : nameOf(l.user_id);

  const load = () => {
    setLoading(true);
    payrollLoansApi
      .list()
      .then(setRows)
      .catch(() => toast.showError("Couldn't load loans."))
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

  useEffect(() => setPage(1), [search, pageSize]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || nameOf(r.user_id).toLowerCase().includes(q),
    );
  }, [rows, search, nameOf]);

  // Oldest request first — a queue, so whoever has waited longest is on top.
  const pending = useMemo(
    () =>
      rows
        .filter((r) => r.status === "pending")
        .sort((a, b) => {
          const ka = a.requested_at ?? a.created_at;
          const kb = b.requested_at ?? b.created_at;
          return ka < kb ? -1 : ka > kb ? 1 : 0;
        }),
    [rows],
  );

  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  useEffect(() => setTotal(filtered.length), [filtered]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (loan: EmployeeLoan) => {
    setEditing(loan);
    setForm({
      user_id: loan.user_id,
      name: loan.name,
      principal: String(loan.principal ?? 0),
      installment_amount: String(loan.installment_amount ?? 0),
      status: loan.status,
      remarks: loan.remarks ?? "",
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.user_id) return setFormError("Select an employee.");
    if (!form.name.trim()) return setFormError("A loan name is required.");
    const principal = Number(form.principal);
    const installment = Number(form.installment_amount);
    if (!(principal > 0)) return setFormError("Principal must be greater than zero.");
    if (!(installment > 0)) return setFormError("Installment amount must be greater than zero.");
    if (installment > principal)
      return setFormError("Installment can't exceed the principal.");

    const payload: EmployeeLoanPayload = {
      user_id: form.user_id,
      name: form.name.trim(),
      principal,
      installment_amount: installment,
      status: form.status,
      remarks: form.remarks.trim() || null,
    };

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await payrollLoansApi.update(editing.loan_id, payload);
        toast.showSuccess("Loan updated.");
      } else {
        await payrollLoansApi.create(payload);
        toast.showSuccess("Loan created.");
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await payrollLoansApi.remove(deleteTarget.loan_id);
      toast.showSuccess("Loan deleted.");
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't delete loan.");
    } finally {
      setDeleting(false);
    }
  };

  const openSchedule = async (loan: EmployeeLoan) => {
    // Fetch the full loan (list rows may omit installments) before showing.
    try {
      const full = await payrollLoansApi.getById(loan.loan_id);
      setScheduleLoan(full);
    } catch {
      setScheduleLoan(loan);
    }
  };

  const regenerateSchedule = async () => {
    if (!scheduleLoan) return;
    setScheduling(true);
    try {
      const updated = await payrollLoansApi.schedule(scheduleLoan.loan_id);
      setScheduleLoan(updated);
      toast.showSuccess("Installment schedule generated.");
      load();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't generate schedule.");
    } finally {
      setScheduling(false);
    }
  };

  // ---- Decisions on employee-filed requests -------------------------------

  const openApprove = (loan: EmployeeLoan) => {
    // The employee's requested months already produced a suggested installment
    // server-side; pre-fill it so approving is a single click in the common case.
    setApproveInstallment(String(loan.installment_amount || loan.principal || 0));
    setApproveNote("");
    setApproving(loan);
  };

  const confirmApprove = async (e: FormEvent) => {
    e.preventDefault();
    if (!approving) return;
    const installment = Number(approveInstallment);
    if (!(installment > 0)) {
      toast.showError("Installment amount must be greater than zero.");
      return;
    }
    if (installment > Number(approving.principal)) {
      toast.showError("Installment can't exceed the principal.");
      return;
    }
    setDeciding(true);
    try {
      const updated = await payrollLoansApi.approve(approving.loan_id, {
        installment_amount: installment,
        note: approveNote.trim() || undefined,
      });
      toast.showSuccess("Loan approved — schedule generated.");
      setApproving(null);
      load();
      // Show what the employee will repay, straight from the approval response.
      setScheduleLoan(updated);
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't approve the request.");
    } finally {
      setDeciding(false);
    }
  };

  const confirmReject = async (e: FormEvent) => {
    e.preventDefault();
    if (!rejecting) return;
    setDeciding(true);
    try {
      await payrollLoansApi.reject(rejecting.loan_id, rejectNote.trim() || undefined);
      toast.showSuccess("Request rejected.");
      setRejecting(null);
      setRejectNote("");
      load();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't reject the request.");
    } finally {
      setDeciding(false);
    }
  };
  const columns: DataTableColumn<EmployeeLoan>[] = [
    {
      key: "name",
      label: "Loan",
      render: (l) => (
        <div className="min-w-0">
          <span className="block font-medium text-gray-900">{l.name}</span>
          <span className="block text-xs text-gray-400">{nameOf(l.user_id)}</span>
        </div>
      ),
    },
    {
      key: "principal",
      label: "Principal",
      render: (l) => <span className="tabular-nums text-gray-600">{money(l.principal)}</span>,
      align: "right",
      hideBelow: "md",
    },
    {
      key: "installment_amount",
      label: "Installment",
      render: (l) => <span className="tabular-nums text-gray-600">{money(l.installment_amount)}</span>,
      align: "right",
      hideBelow: "lg",
    },
    {
      key: "outstanding",
      label: "Outstanding",
      render: (l) => (
        <span className="font-semibold tabular-nums text-gray-900">{money(l.outstanding)}</span>
      ),
      align: "right",
    },
    {
      key: "status",
      label: "Status",
      render: (l) => <StatusBadge status={l.status} />,
      align: "center",
    },
  ];

  return (
    <PayrollLayout activeTab="/payroll/loans">
      <BackendStatusBanner status={status} />

      {/* Employee requests waiting on HR. Rendered only when there is something
          to decide, so the screen stays the plain loan register otherwise. */}
      {pending.length > 0 && (
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-brand/30">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-light text-brand-dark">
              <Inbox size={16} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Pending Requests ({pending.length})
              </h2>
              <p className="text-xs text-gray-500">
                Nothing is deducted from pay until you approve. Approving sets the
                installment and generates the repayment schedule.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {pending.map((l) => (
              <div
                key={l.loan_id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {l.name}
                    <span className="ml-2 font-normal text-gray-500">
                      · {employeeLabel(l)}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {money(l.principal)} requested {shortDate(l.requested_at ?? l.created_at)}
                    {Number(l.installment_amount) > 0 &&
                      ` · suggested ${money(l.installment_amount)} per period`}
                  </p>
                  {l.remarks && (
                    <p className="mt-1 text-xs italic text-gray-500">“{l.remarks}”</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openApprove(l)}
                    className="flex min-h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
                  >
                    <Check size={15} /> Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectNote("");
                      setRejecting(l);
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
        rowKey={(l) => l.loan_id}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search loans…"
        emptyIcon={HandCoins}
        emptyTitle="No loans yet"
        emptyDescription="Record an employee loan or salary advance, then generate its installment schedule — the engine deducts each installment automatically during payroll."
        page={page}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[10, 25, 50]}
        total={total}
        onPageChange={setPage}
        toolbarRight={
          <button
            type="button"
            onClick={openCreate}
            className="flex min-h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
          >
            <Plus size={16} /> Add Loan
          </button>
        }
        actions={(l) => (
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => openSchedule(l)}
              aria-label={`Schedule for ${l.name}`}
              className="flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-brand-dark transition hover:bg-brand-light"
            >
              <ListOrdered size={15} /> Schedule
            </button>
            <button
              type="button"
              onClick={() => openEdit(l)}
              aria-label={`Edit ${l.name}`}
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <Pencil size={15} />
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(l)}
              aria-label={`Delete ${l.name}`}
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 size={15} />
            </button>
          </div>
        )}
      />

      {/* Create / edit */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Loan" : "Add Loan"}
        description={
          editing
            ? "Update this loan. Outstanding balance is managed by payroll runs."
            : "Record a loan or advance to be repaid by payroll deductions."
        }
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleSubmit}>
          <label className="mb-5 block">
            <span className="mb-2 block text-[15px] font-medium text-gray-900">Employee</span>
            <select
              className={selectClass}
              value={form.user_id}
              disabled={!!editing}
              onChange={(e) => setForm((f) => ({ ...f, user_id: e.target.value }))}
            >
              <option value="">Select an employee…</option>
              {employees.map((e) => (
                <option key={e.employeeId} value={e.employeeId}>
                  {e.firstName} {e.lastName}
                  {e.employeeCode ? ` — ${e.employeeCode}` : ""}
                </option>
              ))}
            </select>
          </label>

          <FormField
            label="Loan Name"
            placeholder="e.g. Motorcycle advance"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />

          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <FormField
              label="Principal"
              type="number"
              step="0.01"
              min="0"
              value={form.principal}
              onChange={(e) => setForm((f) => ({ ...f, principal: e.target.value }))}
            />
            <FormField
              label="Installment / Period"
              type="number"
              step="0.01"
              min="0"
              value={form.installment_amount}
              onChange={(e) => setForm((f) => ({ ...f, installment_amount: e.target.value }))}
            />
          </div>

          <label className="mb-5 block">
            <span className="mb-2 block text-[15px] font-medium text-gray-900">Status</span>
            <select
              className={selectClass}
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as LoanStatus }))}
            >
              {LOAN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </select>
          </label>

          <label className="mb-5 block">
            <span className="mb-2 block text-[15px] font-medium text-gray-900">Remarks</span>
            <textarea
              value={form.remarks}
              onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
              placeholder="Optional notes…"
              rows={2}
              className="w-full resize-none rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
            />
          </label>

          {formError && <p className="mb-4 text-sm text-red-500">{formError}</p>}

          <div className="flex flex-col-reverse gap-2.5 xs:flex-row">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="min-h-11 flex-1 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <div className="flex-1">
              <PrimaryButton type="submit" loading={saving}>
                {editing ? "Save Changes" : "Create Loan"}
              </PrimaryButton>
            </div>
          </div>
        </form>
      </Modal>

      {/* Schedule drawer */}
      <Modal
        open={!!scheduleLoan}
        onClose={() => setScheduleLoan(null)}
        title={scheduleLoan ? `Schedule — ${scheduleLoan.name}` : "Schedule"}
        description="Installment ladder. Deducted installments are locked; regenerating preserves what payroll has already taken."
        maxWidth="max-w-2xl"
      >
        {scheduleLoan && (
          <div>
            <div className="mb-4 grid grid-cols-3 gap-3">
              {[
                ["Principal", money(scheduleLoan.principal)],
                ["Installment", money(scheduleLoan.installment_amount)],
                ["Outstanding", money(scheduleLoan.outstanding)],
              ].map(([label, val]) => (
                <div key={label} className="rounded-xl bg-gray-50 px-3 py-2.5">
                  <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-900 tabular-nums">{val}</p>
                </div>
              ))}
            </div>

            {scheduleLoan.installments.length === 0 ? (
              <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                No installments generated yet.
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-xl ring-1 ring-gray-100">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">#</th>
                      <th className="px-4 py-2.5 font-semibold">Amount</th>
                      <th className="px-4 py-2.5 font-semibold">Balance After</th>
                      <th className="px-4 py-2.5 font-semibold">Status</th>
                      <th className="px-4 py-2.5 font-semibold">Deducted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleLoan.installments.map((inst) => (
                      <tr key={inst.installment_id} className="border-t border-gray-50">
                        <td className="px-4 py-2.5 text-gray-500">{inst.sequence}</td>
                        <td className="px-4 py-2.5 tabular-nums text-gray-800">{money(inst.amount)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-gray-500">
                          {inst.balance_after != null ? money(inst.balance_after) : "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={inst.status} />
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">{shortDate(inst.deducted_on)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-5 flex flex-col-reverse gap-2.5 xs:flex-row">
              <button
                type="button"
                onClick={() => setScheduleLoan(null)}
                className="min-h-11 flex-1 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                <X size={15} className="mr-1 inline" /> Close
              </button>
              <div className="flex-1">
                <PrimaryButton type="button" loading={scheduling} onClick={regenerateSchedule}>
                  {scheduleLoan.installments.length > 0 ? "Regenerate Schedule" : "Generate Schedule"}
                </PrimaryButton>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Approve an employee request — the one decision that changes payroll:
          it flips the loan to `active`, which is the only status the engine
          deducts, and builds the installment ladder. */}
      <Modal
        open={!!approving}
        onClose={() => setApproving(null)}
        title="Approve Loan Request"
        description={
          approving
            ? `${employeeLabel(approving)} asked for ${money(approving.principal)}. Set what payroll should deduct each period.`
            : ""
        }
      >
        {approving && (
          <form onSubmit={confirmApprove}>
            <FormField
              label="Installment per period"
              type="number"
              step="0.01"
              min="0.01"
              max={String(approving.principal)}
              value={approveInstallment}
              onChange={(e) => setApproveInstallment(e.target.value)}
              required
            />

            <label className="mb-5 block">
              <span className="mb-2 block text-[15px] font-medium text-gray-900">
                Note to the employee (optional)
              </span>
              <textarea
                value={approveNote}
                onChange={(e) => setApproveNote(e.target.value)}
                rows={2}
                placeholder="Approved — repayment starts with next month's payroll."
                className="w-full resize-none rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
              />
            </label>

            <p className="mb-5 rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-600">
              {Number(approveInstallment) > 0
                ? `About ${Math.ceil(Number(approving.principal) / Number(approveInstallment))} period(s) to repay ${money(approving.principal)}. `
                : ""}
              Deductions begin with the next payroll run.
            </p>

            <div className="flex flex-col-reverse gap-2.5 xs:flex-row">
              <button
                type="button"
                onClick={() => setApproving(null)}
                className="min-h-11 flex-1 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <div className="flex-1">
                <PrimaryButton type="submit" loading={deciding}>
                  Approve &amp; Schedule
                </PrimaryButton>
              </div>
            </div>
          </form>
        )}
      </Modal>

      {/* Reject — a note is optional but strongly implied, since this is the
          only explanation the employee gets on their own screen. */}
      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title="Reject Loan Request"
        description={
          rejecting
            ? `${employeeLabel(rejecting)} — ${rejecting.name} (${money(rejecting.principal)})`
            : ""
        }
      >
        {rejecting && (
          <form onSubmit={confirmReject}>
            <label className="mb-5 block">
              <span className="mb-2 block text-[15px] font-medium text-gray-900">
                Reason (shown to the employee)
              </span>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                rows={3}
                placeholder="An advance is already being repaid — please reapply after it closes."
                className="w-full resize-none rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
              />
            </label>

            <div className="flex flex-col-reverse gap-2.5 xs:flex-row">
              <button
                type="button"
                onClick={() => setRejecting(null)}
                className="min-h-11 flex-1 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={deciding}
                className="min-h-11 flex-1 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deciding ? "Please wait…" : "Reject Request"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This removes the loan and its installment schedule. This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </PayrollLayout>
  );
}
