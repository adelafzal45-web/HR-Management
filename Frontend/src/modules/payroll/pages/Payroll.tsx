// Self-service payroll (spec §14) — the employee's own payslips. Re-pointed
// from the legacy flat `payroll` table (payrollApi.getMyPayroll) to the new
// engine's JWT-scoped feed (payslipsApi.listMine): the backend returns only the
// signed-in user's payslips, as a BARE ARRAY of snake_case `Payslip` rows.
//
// Each row carries a frozen `calculation_json` snapshot — the full line-by-line
// breakdown plus the attendance/leave inputs that produced it — so the payslip
// (and its PDF) renders identically forever, and we no longer recompute the
// attendance summary client-side the way the old page did.

import { useEffect, useMemo, useState } from "react";
import { Wallet, Eye, Download } from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import StatusBadge from "@/components/common/StatusBadge";
import EmptyState from "@/components/common/EmptyState";
import SectionTabs from "@/components/common/SectionTabs";
import { getPayrollTabs } from "@/config/featureTabs";
import Modal from "@/components/dialogs/Modal";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useAuth } from "@/app/providers/AuthContext";
import { useBranding } from "@/app/providers/BrandingContext";
import { payslipsApi, type Payslip } from "@/modules/payroll/api/payslipsApi";
import {
  downloadPayslipPdf,
  resolveLogoDataUrl,
  type PayslipPdfInput,
} from "@/modules/payroll/utils/payslipPdf";
import { money, shortDate, humanize } from "@/modules/payroll/utils/format";

// A payslip can be opened/downloaded once the engine has computed it — i.e. it
// carries a snapshot. Employees never see raw drafts through /payslips/me, but
// gating on the snapshot keeps the button honest regardless of what's returned.
const canDownload = (p: Payslip) => !!p.calculation_json;

const periodLabel = (p: Payslip) => p.calculation_json?.period_name ?? "—";
const currencyOf = (p: Payslip) => p.calculation_json?.currency ?? "PKR";

function splitLines(p: Payslip) {
  const lines = p.calculation_json?.lines ?? p.lines ?? [];
  return {
    earnings: lines.filter((l) => l.type === "earning"),
    deductions: lines.filter((l) => l.type === "deduction"),
  };
}

export default function Payroll() {
  const status = useBackendStatus();
  const { user } = useAuth();
  const { branding } = useBranding();
  const tabs = getPayrollTabs(user?.role);
  const [records, setRecords] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Payslip | null>(null);
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
    payslipsApi
      .listMine()
      .then((data) => {
        if (!active) return;
        // Most recent period first — the snapshot's period_start is the natural
        // sort key; fall back to created_at for any row without a snapshot.
        const sorted = [...data].sort((a, b) => {
          const ka = a.calculation_json?.period_start ?? a.created_at;
          const kb = b.calculation_json?.period_start ?? b.created_at;
          return ka < kb ? 1 : ka > kb ? -1 : 0;
        });
        setRecords(sorted);
      })
      .catch(() => active && setRecords([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const employeeName = user ? `${user.firstName} ${user.lastName}`.trim() : "Employee";
  const latest = records[0];

  const company = useMemo(
    () => ({
      name: branding.companyName || "TechnoCues HRMS",
      address: branding.address,
      email: branding.email,
      phone: branding.phone,
      website: branding.website,
      logoDataUrl,
    }),
    [branding, logoDataUrl],
  );

  const buildPdfInput = (p: Payslip): PayslipPdfInput => {
    const { earnings, deductions } = splitLines(p);
    return {
      company,
      employee: {
        name: employeeName,
        code: user?.employeeId ?? "",
        designation: user?.jobTitle,
        email: user?.email,
      },
      period: periodLabel(p),
      status: p.status === "paid" ? "Generated" : humanize(p.status),
      paymentDate: p.payment_date ?? undefined,
      currency: currencyOf(p),
      earnings: earnings.map((l) => ({ label: l.label, amount: l.amount })),
      deductions: deductions.map((l) => ({ label: l.label, amount: Math.abs(l.amount) })),
      netSalary: p.net_salary,
      payroll: {
        workingDays: p.working_days,
        presentDays: p.present_days,
        absentDays: p.absent_days,
        paidLeave: p.paid_leave_days,
        unpaidLeave: p.unpaid_leave_days,
        overtimeHours: p.overtime_hours,
      },
      payslipId: p.payslip_id,
      generatedBy: "System",
      generatedAt: new Date().toLocaleString(),
      verificationUrl: `${window.location.origin}/payroll?verify=${encodeURIComponent(p.payslip_id)}`,
    };
  };

  const downloadPayslip = async (p: Payslip) => {
    await downloadPayslipPdf(buildPdfInput(p), `payslip-${periodLabel(p)}.pdf`);
  };

  return (
    <DashboardLayout title="Payroll" activeKey="payroll">
      <SectionTabs tabs={tabs} active="my-payslips" />
      <BackendStatusBanner status={status} />

      {loading ? (
        <div className="h-28 animate-pulse rounded-2xl bg-gray-100" />
      ) : latest ? (
        <div className="rounded-2xl bg-gradient-to-r from-brand to-brand-dark p-6 text-gray-900 shadow-sm">
          <p className="text-sm font-medium opacity-80">Net Pay · {periodLabel(latest)}</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">
            {money(latest.net_salary, currencyOf(latest))}
          </p>
          <p className="mt-1 text-sm opacity-80">
            Basic {money(latest.basic_salary, currencyOf(latest))} · Earnings{" "}
            {money(latest.total_earnings, currencyOf(latest))} − Deductions{" "}
            {money(latest.total_deductions, currencyOf(latest))}
          </p>
        </div>
      ) : (
        <EmptyState
          icon={Wallet}
          title="Payslip Not Yet Available"
          description="Payroll for the current period hasn't been processed yet."
        />
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
                  <tr key={r.payslip_id} className="border-b border-gray-50 last:border-0">
                    <td className="py-3 font-medium text-gray-900">{periodLabel(r)}</td>
                    <td className="py-3 text-gray-600">{money(r.net_salary, currencyOf(r))}</td>
                    <td className="py-3 text-gray-600">{r.payment_date ? shortDate(r.payment_date) : "—"}</td>
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
                          onClick={() => downloadPayslip(r)}
                          disabled={!canDownload(r)}
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
        title={selected ? `Payslip · ${periodLabel(selected)}` : ""}
        description={
          selected
            ? selected.payment_date
              ? `Paid on ${shortDate(selected.payment_date)}`
              : humanize(selected.status)
            : ""
        }
        onClose={() => setSelected(null)}
      >
        {selected &&
          (() => {
            const { earnings, deductions } = splitLines(selected);
            const currency = currencyOf(selected);
            return (
              <div>
                <div className="space-y-2">
                  {earnings.map((l) => (
                    <div key={`e-${l.component_id}-${l.label}`} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{l.label}</span>
                      <span className="text-gray-900 tabular-nums">{money(l.amount, currency)}</span>
                    </div>
                  ))}
                  {deductions.map((l) => (
                    <div key={`d-${l.component_id}-${l.label}`} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{l.label}</span>
                      <span className="text-rose-600 tabular-nums">− {money(Math.abs(l.amount), currency)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
                  <span className="text-sm font-semibold text-gray-900">Net Payable</span>
                  <span className="text-lg font-semibold text-brand-dark">
                    {money(selected.net_salary, currency)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => downloadPayslip(selected)}
                  disabled={!canDownload(selected)}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand-dark py-3 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download size={16} /> Download Payslip
                </button>
              </div>
            );
          })()}
      </Modal>
    </DashboardLayout>
  );
}
