import { useEffect, useState } from "react";
import { BarChart3, Award, Users2, CalendarClock } from "lucide-react";
import DashboardLayout from "../../components/dashboard/DashboardLayout";
import BackendStatusBanner from "../../components/BackendStatusBanner";
import EmptyState from "../../components/EmptyState";
import { useBackendStatus } from "../../hooks/useBackendStatus";
import { teamReportsApi, type TeamReportData } from "../../lib/teamApi";

export default function TeamReports() {
  const status = useBackendStatus();

  const [report, setReport] = useState<TeamReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await teamReportsApi.getTeamReports();
        setReport(data);
      } catch {
        setReport(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <DashboardLayout title="Team Reports" activeKey="team-reports">
      <BackendStatusBanner status={status} />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : !report ? (
        <EmptyState icon={BarChart3} title="No data available" description="There isn't enough data to generate a team report yet." />
      ) : (
        <>
          <p className="mb-4 text-sm text-gray-500">Reporting period: {report.reviewPeriod}</p>

          <div className="grid grid-cols-1 gap-4 xs:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Users2} label="Team Size" value={String(report.teamSize)} tone="bg-brand-light text-brand-dark" />
            <StatCard
              icon={CalendarClock}
              label="Avg Attendance Rate"
              value={`${report.avgAttendanceRate}%`}
              tone="bg-emerald-50 text-emerald-600"
            />
            <StatCard
              icon={CalendarClock}
              label="Leave Days Taken"
              value={String(report.totalLeaveDaysTaken)}
              tone="bg-sky-50 text-sky-600"
              sub={`${report.pendingLeaveRequests} pending request${report.pendingLeaveRequests === 1 ? "" : "s"}`}
            />
            <StatCard
              icon={Award}
              label="Avg Appraisal Score"
              value={report.evaluatedCount > 0 ? `${report.avgAppraisalScore} / 10` : "—"}
              tone="bg-amber-50 text-amber-600"
              sub={`${report.evaluatedCount} of ${report.teamSize} evaluated`}
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Attendance by Member</h2>
              <div className="mt-4 space-y-3">
                {report.attendanceByMember.map((m) => (
                  <div key={m.employeeId}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-700">{m.name}</span>
                      <span className="text-gray-500">{m.attendanceRate}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gray-100">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-brand to-brand-dark"
                        style={{ width: `${m.attendanceRate}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Top Performers</h2>
              {report.topPerformers.length === 0 ? (
                <p className="mt-4 text-sm text-gray-500">
                  No completed appraisals yet this cycle — evaluate team members to see rankings here.
                </p>
              ) : (
                <div className="mt-4 space-y-2">
                  {report.topPerformers.map((p, idx) => (
                    <div key={p.employeeId} className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
                        {idx + 1}
                      </span>
                      <span className="flex-1 text-sm font-medium text-gray-800">{p.name}</span>
                      <span className="text-sm font-semibold text-gray-900">{p.score} / 10</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
  sub,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
  tone: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
        <Icon size={18} />
      </span>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-gray-900">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}
