import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Mail, ClipboardCheck, Clock, Briefcase } from "lucide-react";
import DashboardLayout from "../../components/dashboard/DashboardLayout";
import BackendStatusBanner from "../../components/BackendStatusBanner";
import EmptyState from "../../components/EmptyState";
import StatusBadge from "../../components/StatusBadge";
import { useBackendStatus } from "../../hooks/useBackendStatus";
import { teamApi, type TeamMember } from "../../lib/teamApi";

export default function TeamMembers() {
  const status = useBackendStatus();
  const navigate = useNavigate();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await teamApi.getTeamMembers();
        setMembers(data);
      } catch {
        setMembers([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <DashboardLayout title="My Team" activeKey="team-members">
      <BackendStatusBanner status={status} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900">Assigned Team Members</h2>
        <span className="text-sm text-gray-500">{loading ? "…" : `${members.length} member${members.length === 1 ? "" : "s"}`}</span>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <EmptyState icon={Users} title="No team assigned" description="You don't have any team members assigned to you yet." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {members.map((m) => (
              <div key={m.employeeId} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                      <Users size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {m.firstName} {m.lastName}
                      </p>
                      <p className="truncate text-xs text-gray-500">{m.designation}</p>
                    </div>
                  </div>
                  <StatusBadge status={m.status} />
                </div>

                <div className="mt-4 space-y-1.5 text-xs text-gray-500">
                  <p className="flex items-center gap-1.5 truncate">
                    <Mail size={12} className="shrink-0" /> {m.email}
                  </p>
                  <p>#{m.employeeCode} · {m.department}</p>
                  <p className="flex items-center gap-1.5">
                    <Briefcase size={12} className="shrink-0" /> {m.jobCategoryName}
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Clock size={12} className="shrink-0" /> {m.shiftName}
                    {m.overtimeAllowed && (
                      <span className="ml-1 rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-600">
                        OT eligible
                      </span>
                    )}
                  </p>
                  <p>Joined {new Date(m.joiningDate).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</p>
                </div>

                <button
                  type="button"
                  onClick={() => navigate(`/team/evaluate/${m.employeeId}`)}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  <ClipboardCheck size={15} /> Evaluate Performance
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
