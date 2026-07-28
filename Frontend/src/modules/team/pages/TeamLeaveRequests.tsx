import { useEffect, useMemo, useState } from "react";
import { CalendarX2 } from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import EmptyState from "@/components/common/EmptyState";
import StatusBadge from "@/components/common/StatusBadge";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { teamLeaveApi, type TeamLeaveRequest, type TeamLeaveStatus } from "@/modules/team/api/teamApi";

type FilterTab = "All" | TeamLeaveStatus;

export default function TeamLeaveRequests() {
  const status = useBackendStatus();

  const [requests, setRequests] = useState<TeamLeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<FilterTab>("All");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await teamLeaveApi.getTeamLeaveRequests();
        setRequests(data);
      } catch {
        setRequests([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(
    () => (tab === "All" ? requests : requests.filter((r) => r.status === tab)),
    [requests, tab],
  );

  const tabs: FilterTab[] = ["All", "Pending", "Approved", "Rejected"];

  return (
    <DashboardLayout title="Team Leave Requests" activeKey="team-leaves">
      <BackendStatusBanner status={status} />

      <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        This is a read-only view of your team's leave activity. Approving or rejecting requests is
        handled by HR Manager (UC-20).
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900">Leave Requests</h2>
        <div className="inline-flex flex-wrap rounded-full bg-gray-100 p-1 text-sm font-medium">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`min-h-9 rounded-full px-3.5 py-1.5 transition ${
                tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-400"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-11 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={CalendarX2} title="No records found" description="No leave requests match this filter." />
          ) : (
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                  <th className="pb-3 font-medium">Employee</th>
                  <th className="pb-3 font-medium">Type</th>
                  <th className="pb-3 font-medium">Dates</th>
                  <th className="pb-3 font-medium">Days</th>
                  <th className="pb-3 font-medium">Reason</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.leaveId} className="border-b border-gray-50 last:border-0 align-top">
                    <td className="py-3 font-medium text-gray-900">{r.employeeName}</td>
                    <td className="py-3 text-gray-600">{r.leaveTypeName}</td>
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
    </DashboardLayout>
  );
}
