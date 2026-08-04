import { useEffect, useState, type FormEvent } from "react";
import { Plus, Wallet, Trash2, Download } from "lucide-react";
import StatusBadge from "@/components/common/StatusBadge";
import EmptyState from "@/components/common/EmptyState";
import Modal from "@/components/dialogs/Modal";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import { PrimaryButton } from "@/components/forms/FormField";
import { useToast } from "@/app/providers/ToastContext";
import { useBranding } from "@/app/providers/BrandingContext";
import { useAuth } from "@/app/providers/AuthContext";
import { adminPayrollApi, type AdminPayrollRecord } from "@/modules/settings/api/adminOpsApi";
import { standardPayrollComponents } from "@/modules/payroll/api/payrollAdapter";
import { monthLabel } from "@/api/hrApi";
import type { Employee } from "@/modules/employees/api/employeeApi";
import { downloadPayslipPdf, resolveLogoDataUrl, formatEmploymentType, formatJoiningDate } from "@/modules/payroll/utils/payslipPdf";

function money(n: number) {
 return `PKR ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function EmployeePayrollTab({ employee }: { employee: Employee }) {
 const toast = useToast();
 const { branding } = useBranding();
 const { user } = useAuth();
 const { employeeId, salary: basicSalary } = employee;

 const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>();
 useEffect(() => {
 let active = true;
 resolveLogoDataUrl(branding.logoUrl).then((url) => active && setLogoDataUrl(url));
 return () => {
 active = false;
 };
 }, [branding.logoUrl]);

 const downloadRow = (r: AdminPayrollRecord) => {
 downloadPayslipPdf(
 {
 company: {
 name: branding.companyName || "TechnoCues HRMS",
 address: branding.address,
 email: branding.email,
 phone: branding.phone,
 website: branding.website,
 logoDataUrl,
 },
 employee: {
 name: `${employee.firstName} ${employee.lastName}`.trim(),
 code: employee.employeeCode,
 department: employee.departmentName,
 designation: employee.designationName,
 email: employee.email,
 shift: employee.shiftName,
 employmentType: formatEmploymentType(employee.employmentType),
 joiningDate: formatJoiningDate(employee.joiningDate),
 },
 period: monthLabel(r.payrollMonth, r.payrollYear),
 status: r.status,
 paymentDate: r.paymentDate,
 generatedDate: r.paymentDate ?? new Date().toISOString().slice(0, 10),
 earnings: [
 { label: "Basic Salary", amount: r.basicSalary },
 { label: "Allowance", amount: r.allowance },
 ...(r.bonus > 0 ? [{ label: "Bonus", amount: r.bonus }] : []),
 ],
 deductions: [
 { label: "Deduction", amount: r.deduction },
 { label: "Tax", amount: r.tax },
 ],
 netSalary: r.netSalary,
 payslipId: r.payrollId,
 generatedBy: user ? `${user.firstName} ${user.lastName}`.trim() : "HR System",
 generatedAt: new Date().toLocaleString(),
 verificationUrl: `${window.location.origin}/payroll?verify=${encodeURIComponent(r.payrollId)}`,
 },
 `payslip-${employee.employeeCode}-${r.payrollYear}-${String(r.payrollMonth).padStart(2, "0")}.pdf`,
 );
 };

 const [rows, setRows] = useState<AdminPayrollRecord[]>([]);
 const [loading, setLoading] = useState(true);

 const now = new Date();
 const [modalOpen, setModalOpen] = useState(false);
 const [month, setMonth] = useState(now.getMonth() + 1);
 const [year, setYear] = useState(now.getFullYear());
 const [basic, setBasic] = useState(basicSalary);
 const [allowance, setAllowance] = useState(0);
 const [bonus, setBonus] = useState(0);
 const [deduction, setDeduction] = useState(0);
 const [tax, setTax] = useState(0);
 const [markPaid, setMarkPaid] = useState(false);
 const [formError, setFormError] = useState<string | null>(null);
 const [submitting, setSubmitting] = useState(false);

 const [toDelete, setToDelete] = useState<AdminPayrollRecord | null>(null);
 const [deleting, setDeleting] = useState(false);

 const netPreview = basic + allowance + bonus - deduction - tax;

 const load = () => {
 setLoading(true);
 adminPayrollApi
 .list({ employeeId, pageSize: 500 })
 .then((res) => setRows(res.data))
 .catch(() => toast.showError("Couldn't load payroll history."))
 .finally(() => setLoading(false));
 };

 useEffect(() => {
 load();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [employeeId]);

 const openModal = () => {
 const std = standardPayrollComponents(basicSalary);
 setMonth(now.getMonth() + 1);
 setYear(now.getFullYear());
 setBasic(basicSalary);
 setAllowance(std.allowance);
 setBonus(0);
 setDeduction(std.deduction);
 setTax(std.tax);
 setMarkPaid(false);
 setFormError(null);
 setModalOpen(true);
 };

 const handleSubmit = async (e: FormEvent) => {
 e.preventDefault();
 setFormError(null);
 if (basic <= 0) {
 setFormError("Basic salary must be greater than zero.");
 return;
 }
 if (rows.some((r) => r.payrollMonth === month && r.payrollYear === year)) {
 setFormError("A payslip for this month has already been generated.");
 return;
 }
 setSubmitting(true);
 try {
 const paymentDate = markPaid ? new Date(year, month - 1, 6).toISOString().slice(0, 10) : null;
 await adminPayrollApi.generate(employeeId, { month, year, basicSalary: basic, allowance, bonus, deduction, tax, paymentDate });
 toast.showSuccess("Payslip generated.");
 setModalOpen(false);
 load();
 } catch (err) {
 setFormError(err instanceof Error ? err.message : "Couldn't generate the payslip.");
 } finally {
 setSubmitting(false);
 }
 };

 const handleDelete = async () => {
 if (!toDelete) return;
 setDeleting(true);
 try {
 await adminPayrollApi.remove(toDelete.payrollId);
 toast.showSuccess("Payslip removed.");
 setToDelete(null);
 load();
 } catch (err) {
 toast.showError(err instanceof Error ? err.message : "Couldn't remove the payslip.");
 } finally {
 setDeleting(false);
 }
 };

 return (
 <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
 <div className="flex flex-wrap items-center justify-between gap-3">
 <h3 className="text-sm font-semibold text-gray-900">Payroll History</h3>
 <button
 type="button"
 onClick={openModal}
 className="flex min-h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
 >
 <Plus size={14} /> Generate Payslip
 </button>
 </div>

 <div className="mt-5 overflow-x-auto">
 {loading ? (
 <div className="space-y-2">
 {[...Array(4)].map((_, i) => (
 <div key={i} className="h-11 animate-pulse rounded-lg bg-gray-100" />
 ))}
 </div>
 ) : rows.length === 0 ? (
 <EmptyState icon={Wallet} title="No payslips yet" description="Generated payslips for this employee will show up here." />
 ) : (
 <table className="w-full min-w-[560px] text-left text-sm">
 <thead>
 <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
 <th className="pb-3 font-medium">Period</th>
 <th className="pb-3 font-medium">Net Salary</th>
 <th className="pb-3 font-medium">Payment Date</th>
 <th className="pb-3 font-medium">Status</th>
 <th className="pb-3 font-medium text-right">Actions</th>
 </tr>
 </thead>
 <tbody>
 {rows.map((r) => (
 <tr key={r.payrollId} className="border-b border-gray-50 last:border-0">
 <td className="py-3 font-medium text-gray-900">{monthLabel(r.payrollMonth, r.payrollYear)}</td>
 <td className="py-3 text-gray-600">{money(r.netSalary)}</td>
 <td className="py-3 text-gray-600">{r.paymentDate ?? "—"}</td>
 <td className="py-3">
 <StatusBadge status={r.status} />
 </td>
 <td className="py-3 text-right">
 <div className="flex justify-end gap-1">
 <button
 type="button"
 onClick={() => downloadRow(r)}
 disabled={r.status !== "Generated"}
 aria-label={`Download payslip PDF for ${monthLabel(r.payrollMonth, r.payrollYear)}`}
 className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30"
 >
 <Download size={16} />
 </button>
 <button
 type="button"
 onClick={() => setToDelete(r)}
 aria-label={`Remove payslip for ${monthLabel(r.payrollMonth, r.payrollYear)}`}
 className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-rose-400 transition hover:bg-rose-50 hover:text-rose-600"
 >
 <Trash2 size={16} />
 </button>
 </div>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 )}
 </div>

 <Modal open={modalOpen} title="Generate Payslip" onClose={() => setModalOpen(false)}>
 <form onSubmit={handleSubmit}>
 <div className="mb-4 grid grid-cols-2 gap-3">
 <label className="block">
 <span className="mb-2 block text-sm font-medium text-gray-900">Month</span>
 <select
 value={month}
 onChange={(e) => setMonth(Number(e.target.value))}
 className="w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
 >
 {MONTH_OPTIONS.map((m) => (
 <option key={m} value={m}>
 {monthLabel(m, year).split(" ")[0]}
 </option>
 ))}
 </select>
 </label>
 <label className="block">
 <span className="mb-2 block text-sm font-medium text-gray-900">Year</span>
 <input
 type="number"
 value={year}
 onChange={(e) => setYear(Number(e.target.value))}
 className="w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
 />
 </label>
 </div>

 <div className="mb-4 grid grid-cols-2 gap-3">
 <label className="block">
 <span className="mb-2 block text-sm font-medium text-gray-900">Basic Salary</span>
 <input
 type="number"
 value={basic}
 onChange={(e) => setBasic(Number(e.target.value))}
 className="w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
 />
 </label>
 <label className="block">
 <span className="mb-2 block text-sm font-medium text-gray-900">Allowance</span>
 <input
 type="number"
 value={allowance}
 onChange={(e) => setAllowance(Number(e.target.value))}
 className="w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
 />
 </label>
 </div>

 <div className="mb-4 grid grid-cols-3 gap-3">
 <label className="block">
 <span className="mb-2 block text-sm font-medium text-gray-900">Bonus</span>
 <input
 type="number"
 value={bonus}
 onChange={(e) => setBonus(Number(e.target.value))}
 className="w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
 />
 </label>
 <label className="block">
 <span className="mb-2 block text-sm font-medium text-gray-900">Deduction</span>
 <input
 type="number"
 value={deduction}
 onChange={(e) => setDeduction(Number(e.target.value))}
 className="w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
 />
 </label>
 <label className="block">
 <span className="mb-2 block text-sm font-medium text-gray-900">Tax</span>
 <input
 type="number"
 value={tax}
 onChange={(e) => setTax(Number(e.target.value))}
 className="w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
 />
 </label>
 </div>

 <label className="mb-4 flex items-center gap-2 text-sm text-gray-700">
 <input type="checkbox" checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
 Mark as paid (sets a payment date)
 </label>

 <div className="mb-5 flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
 <span className="text-sm font-semibold text-gray-900">Net Salary</span>
 <span className="text-base font-semibold text-brand-dark">{money(netPreview)}</span>
 </div>

 {formError && <p className="mb-4 text-sm text-rose-600">{formError}</p>}

 <PrimaryButton type="submit" loading={submitting}>
 Generate Payslip
 </PrimaryButton>
 </form>
 </Modal>

 <ConfirmDialog
 open={!!toDelete}
 title="Remove this payslip?"
 description={toDelete ? `${monthLabel(toDelete.payrollMonth, toDelete.payrollYear)} · ${money(toDelete.netSalary)}` : undefined}
 confirmLabel="Remove"
 tone="danger"
 loading={deleting}
 onConfirm={handleDelete}
 onCancel={() => setToDelete(null)}
 />
 </div>
 );
}
