import { useEffect, useState } from "react";
import { Wallet, Eye, Download } from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import StatusBadge from "@/components/common/StatusBadge";
import EmptyState from "@/components/common/EmptyState";
import Modal from "@/components/dialogs/Modal";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useAuth } from "@/app/providers/AuthContext";
import { useBranding } from "@/app/providers/BrandingContext";
import { payrollApi, attendanceApi, leaveApi, monthLabel, type PayrollRecord } from "@/api/hrApi";
import { leaveTypes } from "@/mocks/hrMockData";
import { downloadPayslipPdf, resolveLogoDataUrl } from "@/modules/payroll/utils/payslipPdf";

function money(n: number) {
 return `PKR ${n.toLocaleString()}`;
}

// Working days = weekdays (Mon–Fri) in the payroll month; the rest of the
// attendance breakdown comes from the employee's own attendance/leave
// history for that same month, so the payslip's numbers always match what
// they'd see on the Attendance and Leave screens.
function countWeekdays(month: number, year: number): number {
 const daysInMonth = new Date(year, month, 0).getDate();
 let count = 0;
 for (let d = 1; d <= daysInMonth; d++) {
 const day = new Date(year, month - 1, d).getDay();
 if (day !== 0 && day !== 6) count += 1;
 }
 return count;
}

async function buildAttendanceSummary(month: number, year: number) {
 try {
 const [attendance, leaves] = await Promise.all([attendanceApi.getHistory({ month, year }), leaveApi.getMyLeaves()]);
 const workingDays = countWeekdays(month, year);
 const presentDays = attendance.filter((a) => a.status === "Present" || a.status === "Late").length;
 const lateDays = attendance.filter((a) => a.status === "Late").length;
 const overtimeHours = Math.round(attendance.reduce((sum, a) => sum + (a.overtimeHours ?? 0), 0) * 10) / 10;

 const monthLeaves = leaves.filter((l) => {
 if (l.status !== "Approved") return false;
 const d = new Date(l.startDate);
 return d.getMonth() + 1 === month && d.getFullYear() === year;
 });
 const paidLeave = monthLeaves
 .filter((l) => leaveTypes.find((t) => t.leaveTypeId === l.leaveTypeId)?.isPaid !== false)
 .reduce((sum, l) => sum + l.totalDays, 0);
 const unpaidLeave = monthLeaves
 .filter((l) => leaveTypes.find((t) => t.leaveTypeId === l.leaveTypeId)?.isPaid === false)
 .reduce((sum, l) => sum + l.totalDays, 0);
 const absentDays = Math.max(workingDays - presentDays - paidLeave - unpaidLeave, 0);

 return { workingDays, presentDays, absentDays, paidLeave, unpaidLeave, lateDays, overtimeHours };
 } catch {
 // Attendance/leave history isn't essential to the payslip — if either
 // call fails, download the payslip without the attendance section
 // rather than blocking the download entirely.
 return undefined;
 }
}

async function downloadPayslip(
 record: PayrollRecord,
 employeeName: string,
 company: { name: string; address?: string; email?: string; phone?: string; website?: string; logoDataUrl?: string },
 employee: { code?: string; designation?: string; email?: string },
 generatedBy?: string,
) {
 const payroll = await buildAttendanceSummary(record.payrollMonth, record.payrollYear);
 await downloadPayslipPdf(
 {
 company: {
 name: company.name || "TechnoCues HRMS",
 address: company.address,
 email: company.email,
 phone: company.phone,
 website: company.website,
 logoDataUrl: company.logoDataUrl,
 },
 employee: { name: employeeName, code: employee.code || record.employeeId, designation: employee.designation, email: employee.email },
 period: monthLabel(record.payrollMonth, record.payrollYear),
 status: record.status,
 paymentDate: record.paymentDate,
 generatedDate: record.generatedDate,
 earnings: record.components.filter((c) => c.componentType === "Earning").map((c) => ({ label: c.componentName, amount: c.amount })),
 deductions: record.components.filter((c) => c.componentType === "Deduction").map((c) => ({ label: c.componentName, amount: c.amount })),
 netSalary: record.netSalary,
 payroll,
 payslipId: record.payrollId,
 generatedBy: generatedBy || "System",
 generatedAt: new Date().toLocaleString(),
 verificationUrl: `${window.location.origin}/payroll?verify=${encodeURIComponent(record.payrollId)}`,
 },
 `payslip-${record.payrollYear}-${String(record.payrollMonth).padStart(2, "0")}.pdf`,
 );
}

export default function Payroll() {
 const status = useBackendStatus();
 const { user } = useAuth();
 const { branding } = useBranding();
 const [records, setRecords] = useState<PayrollRecord[]>([]);
 const [loading, setLoading] = useState(true);
 const [selected, setSelected] = useState<PayrollRecord | null>(null);
 const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>();

 useEffect(() => {
 let active = true;
 resolveLogoDataUrl(branding.logoUrl).then((url) => active && setLogoDataUrl(url));
 return () => {
 active = false;
 };
 }, [branding.logoUrl]);

 useEffect(() => {
 let active = true;
 payrollApi
 .getMyPayroll()
 .then((data) => active && setRecords(data))
 .catch(() => active && setRecords([]))
 .finally(() => active && setLoading(false));
 return () => {
 active = false;
 };
 }, []);

 const employeeName = user ? `${user.firstName} ${user.lastName}`.trim() : "Employee";
 const latest = records[0];
 const company = { name: branding.companyName, address: branding.address, email: branding.email, phone: branding.phone, website: branding.website, logoDataUrl };
 const employeeMeta = { code: user?.employeeId, designation: user?.jobTitle, email: user?.email };

 return (
 <DashboardLayout title="Payroll" activeKey="payroll">
 <BackendStatusBanner status={status} />

 {loading ? (
 <div className="h-28 animate-pulse rounded-2xl bg-gray-100" />
 ) : latest ? (
 <div className="rounded-2xl bg-gradient-to-r from-brand to-brand-dark p-6 text-gray-900 shadow-sm">
 <p className="text-sm font-medium opacity-80">Net Pay · {monthLabel(latest.payrollMonth, latest.payrollYear)}</p>
 <p className="mt-1 text-3xl font-semibold tracking-tight">{money(latest.netSalary)}</p>
 <p className="mt-1 text-sm opacity-80">
 Basic Salary {money(latest.basicSalary)} + Allowances {money(latest.allowance)}
 {latest.bonus > 0 ? ` + Bonus ${money(latest.bonus)}` : ""} − Total Deductions{" "}
 {money(latest.deduction + latest.tax)}
 </p>
 </div>
 ) : (
 <EmptyState icon={Wallet} title="Payslip Not Yet Available" description="Payroll for the current period hasn't been processed yet." />
 )}

 <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
 <h2 className="text-base font-semibold text-gray-900">Payment History</h2>

 <div className="mt-4 overflow-x-auto">
 {loading ? (
 <div className="space-y-2">
 {[...Array(4)].map((_, i) => (
 <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
 ))}
 </div>
 ) : records.length === 0 ? (
 <EmptyState icon={Wallet} title="No Payment Records Found" />
 ) : (
 <table className="w-full min-w-[560px] text-left text-sm">
 <thead>
 <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
 <th className="pb-3 font-medium">Pay Period</th>
 <th className="pb-3 font-medium">Net Salary</th>
 <th className="pb-3 font-medium">Payment Date</th>
 <th className="pb-3 font-medium">Status</th>
 <th className="pb-3 font-medium text-right">Actions</th>
 </tr>
 </thead>
 <tbody>
 {records.map((r) => (
 <tr key={r.payrollId} className="border-b border-gray-50 last:border-0">
 <td className="py-3 font-medium text-gray-900">{monthLabel(r.payrollMonth, r.payrollYear)}</td>
 <td className="py-3 text-gray-600">{money(r.netSalary)}</td>
 <td className="py-3 text-gray-600">{r.paymentDate ?? "—"}</td>
 <td className="py-3">
 <StatusBadge status={r.status} />
 </td>
 <td className="py-3">
 <div className="flex justify-end gap-2">
 <button
 type="button"
 onClick={() => setSelected(r)}
 className="flex min-h-11 min-w-11 items-center justify-center rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
 aria-label="View payslip"
 >
 <Eye size={16} />
 </button>
 <button
 type="button"
 onClick={() => downloadPayslip(r, employeeName, company, employeeMeta, employeeName)}
 disabled={r.status !== "Generated"}
 className="flex min-h-11 min-w-11 items-center justify-center rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-30"
 aria-label="Download payslip"
 >
 <Download size={16} />
 </button>
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
 open={!!selected}
 title={selected ? `Payslip · ${monthLabel(selected.payrollMonth, selected.payrollYear)}` : ""}
 description={selected?.status === "Generated" ? `Paid on ${selected.paymentDate}` : "Not yet processed"}
 onClose={() => setSelected(null)}
 >
 {selected && (
 <div>
 <div className="space-y-2">
 {selected.components.map((c) => (
 <div key={c.payComponentId} className="flex items-center justify-between text-sm">
 <span className="text-gray-600">{c.componentName}</span>
 <span className={c.componentType === "Deduction" ? "text-rose-600" : "text-gray-900"}>
 {c.componentType === "Deduction" ? "− " : ""}
 {money(c.amount)}
 </span>
 </div>
 ))}
 </div>
 <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
 <span className="text-sm font-semibold text-gray-900">Net Payable</span>
 <span className="text-lg font-semibold text-brand-dark">{money(selected.netSalary)}</span>
 </div>
 <button
 type="button"
 onClick={() => downloadPayslip(selected, employeeName, company, employeeMeta, employeeName)}
 disabled={selected.status !== "Generated"}
 className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand-dark py-3 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
 >
 <Download size={16} /> Download Payslip
 </button>
 </div>
 )}
 </Modal>
 </DashboardLayout>
 );
}
