import { useMemo, useState } from "react";
import { Search, User } from "lucide-react";
import type { TeamMember } from "@/modules/dashboard/mocks/dashboardMockData";

type TeamAnalyticsProps = {
  members: TeamMember[] | null;
  /** Shown in the header — lets the widget say whose roster this is
   * ("Manager view" for team leads/HR/admins) instead of looking identical
   * regardless of who's logged in. */
  scopeLabel?: string;
};

type Tab = "onboarded" | "out-of-office";

export default function TeamAnalytics({ members, scopeLabel }: TeamAnalyticsProps) {
  const [tab, setTab] = useState<Tab>("onboarded");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return (members ?? [])
      .filter((m) => m.status === tab)
      .filter((m) => m.name.toLowerCase().includes(query.trim().toLowerCase()));
  }, [members, tab, query]);

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-gray-900">Team Analytic</h2>
          {scopeLabel && <p className="mt-0.5 text-xs font-medium text-gray-400">{scopeLabel}</p>}
        </div>
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="w-full rounded-full bg-gray-100 py-2.5 pl-10 pr-4 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/50"
          />
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      <div className="mt-4 inline-flex rounded-full bg-gray-100 p-1 text-sm font-medium">
        <button
          type="button"
          onClick={() => setTab("onboarded")}
          className={`min-h-11 rounded-full px-4 py-2 transition ${
            tab === "onboarded" ? "bg-white text-gray-900 shadow-sm" : "text-gray-400"
          }`}
        >
          Onboarded
        </button>
        <button
          type="button"
          onClick={() => setTab("out-of-office")}
          className={`min-h-11 rounded-full px-4 py-2 transition ${
            tab === "out-of-office" ? "bg-white text-gray-900 shadow-sm" : "text-gray-400"
          }`}
        >
          Out of Office
        </button>
      </div>

      {members === null ? (
        <div className="mt-4 flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : (
        <>
          {/* Stacked cards on narrow screens — avoids sideways scrolling on phones */}
          <div className="mt-4 flex flex-col gap-2 sm:hidden">
            {filtered.map((member, idx) => (
              <div
                key={member.id}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 ${
                  idx % 2 === 0 ? "bg-brand-light/30" : "bg-gray-50"
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                  <User size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-800">{member.name}</p>
                  <p className="truncate text-xs font-normal text-gray-500">
                    {member.position}
                    {member.department ? ` · ${member.department}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-normal text-gray-500">#{member.employeeId}</span>
              </div>
            ))}

            {filtered.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-gray-400">No matching team members.</p>
            )}
          </div>

          {/* Full table on sm+ screens */}
          <div className="mt-4 hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="bg-brand-light/60 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="rounded-l-lg px-4 py-3">Name</th>
                  <th className="px-4 py-3">Employee ID</th>
                  <th className="px-4 py-3">Position</th>
                  <th className="rounded-r-lg px-4 py-3">Department</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((member, idx) => (
                  <tr key={member.id} className={idx % 2 === 0 ? "bg-brand-light/30" : "bg-white"}>
                    <td className="px-4 py-3.5 font-normal text-gray-800">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                          <User size={15} />
                        </span>
                        {member.name}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-gray-600">{member.employeeId}</td>
                    <td className="px-4 py-3.5 text-gray-600">{member.position}</td>
                    <td className="px-4 py-3.5 text-gray-600">{member.department ?? "—"}</td>
                  </tr>
                ))}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-400">
                      No matching team members.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
