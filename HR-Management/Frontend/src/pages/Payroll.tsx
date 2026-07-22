import { useEffect, useState } from "react";
import { Wallet, Eye, Download } from "lucide-react";
import DashboardLayout from "../components/dashboard/DashboardLayout";
import BackendStatusBanner from "../components/BackendStatusBanner";
import StatusBadge from "../components/StatusBadge";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import { useBackendStatus } from "../hooks/useBackendStatus";
import { useAuth } from "../lib/AuthContext";
import { payrollApi, monthLabel, type PayrollRecord } from "../lib/hrApi";

function money(n: number) {
  return `PKR ${n.toLocaleString()}`;
}

function downloadPayslip(record: PayrollRecord, employeeName: string) {
  const lines = [
    "TechnoCues HR Management System — Payslip",
    "===========================================",
    `Employee: ${employeeName}`,
    `Pay Period: ${monthLabel(record.payrollMonth, record.payrollYear)}`,
    `Status: ${record.status}`,
    "",
    "Earnings & Deductions",
    "-------------------------------------------",
    ...record.components.map(
      (c) => `${c.componentName.padEnd(24)} ${c.componentType === "Deduction" ? "-" : ""}${money(c.amount)}`,
    ),
    "-------------------------------------------",
    `Net Salary: ${money(record.netSalary)}`,
    "",
    `Generated on: ${record.generatedDate}`,
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `payslip-${record.payrollYear}-${String(record.payrollMonth).padStart(2, "0")}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Payroll() {
  const status = useBackendStatus();
  const { user } = useAuth();
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PayrollRecord | null>(null);

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

  return (
    <DashboardLayout title="Payroll" activeKey="payroll">
      <BackendStatusBanner status={status} />

      {loading ? (
        <div className="h-28 animate-pulse rounded-2xl bg-gray-100" />
      ) : latest ? (
        <div className="rounded-2xl bg-gradient-to-r from-brand to-brand-dark p-6 text-gray-900 shadow-sm">
          <p className="text-sm font-medium opacity-80">Latest payslip · {monthLabel(latest.payrollMonth, latest.payrollYear)}</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{money(latest.netSalary)}</p>
          <p className="mt-1 text-sm opacity-80">
            Basic {money(latest.basicSalary)} + Allowance {money(latest.allowance)}
            {latest.bonus > 0 ? ` + Bonus ${money(latest.bonus)}` : ""} − Deductions{" "}
            {money(latest.deduction + latest.tax)}
          </p>
        </div>
      ) : (
        <EmptyState icon={Wallet} title="Payslip not available" description="Payroll hasn't been processed for you yet." />
      )}

      <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <h2 className="text-base font-semibold text-gray-900">Payslip History</h2>

        <div className="mt-4 overflow-x-auto">
          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          ) : records.length === 0 ? (
            <EmptyState icon={Wallet} title="No payslips yet" />
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
                          onClick={() => downloadPayslip(r, employeeName)}
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
              <span className="text-sm font-semibold text-gray-900">Net Salary</span>
              <span className="text-lg font-semibold text-brand-dark">{money(selected.netSalary)}</span>
            </div>
            <button
              type="button"
              onClick={() => downloadPayslip(selected, employeeName)}
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
