import { useEffect, useMemo, useState } from "react";
import { Search, Users, Briefcase } from "lucide-react";
import { useDevAuth } from "@/app/providers/DevAuthContext";
import { myProfileService } from "@/modules/employees/api/employeeService";
import type { Employee } from "@/modules/employees/types/employee.types";
import { adminAttendanceApi } from "@/modules/settings/api/adminOpsApi";
import EmployeeAvatar from "@/modules/employees/components/EmployeeAvatar";

type Row = { id: string; firstName: string; lastName: string; code: string; position: string; photo?: string | null; thumb?: string | null };

type Tab = "onboarded" | "out-of-office" | "working";

export default function TeamAnalyticsCard() {
  const { hasPermission } = useDevAuth();
  const canAttendance = hasPermission("attendance.view");

  const [tab, setTab] = useState<Tab>(canAttendance ? "working" : "onboarded");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [outIds, setOutIds] = useState<Set<string>>(new Set());
  const [workingIds, setWorkingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const today = new Date().toISOString().slice(0, 10);

    Promise.all([
      myProfileService.team({ limit: 500, status: true }),
      canAttendance ? adminAttendanceApi.list({ date: today }) : Promise.resolve({ data: [], total: 0 }),
    ])
      .then(([empRes, attRes]) => {
        if (cancelled) return;
        setEmployees(empRes.data);
        const out = new Set(
          attRes.data.filter((r) => r.status === "Absent" || r.status === "On Leave" || r.status === "Leave").map((r) => r.employeeId),
        );
        const working = new Set(
          attRes.data.filter((r) => r.status === "Present" || r.status === "Late" || r.status === "Half-Day").map((r) => r.employeeId),
        );
        setOutIds(out);
        setWorkingIds(working);
      })
      .catch(() => !cancelled && setError("Couldn't load team analytics."))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAttendance]);

  const rows: Row[] = useMemo(() => {
    const toRow = (e: Employee): Row => ({
      id: e.user_id,
      firstName: e.first_name,
      lastName: e.last_name,
      code: e.employee_code,
      position: e.designation?.title || "—",
      photo: e.profile_image,
      thumb: e.profile_image_thumb,
    });

    let list: Employee[];
    if (tab === "working") {
      list = employees.filter((e) => workingIds.has(e.user_id));
    } else if (tab === "onboarded") {
      list = [...employees].sort((a, b) => (a.joining_date < b.joining_date ? 1 : -1));
    } else {
      list = employees.filter((e) => outIds.has(e.user_id));
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (e) =>
          `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) ||
          e.employee_code.toLowerCase().includes(q) ||
          (e.designation?.title || "").toLowerCase().includes(q),
      );
    }

    return list.slice(0, 8).map(toRow);
  }, [employees, outIds, workingIds, tab, search]);

  return (
    <>
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-bold text-gray-900 sm:text-lg">Team Analytics</h3>
          <div className="relative w-full max-w-[220px] sm:w-auto">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="min-h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/60"
            />
          </div>
        </div>

        <div className="mb-4 inline-flex rounded-full bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setTab("working")}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition sm:text-sm ${
              tab === "working" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            <Briefcase size={14} />
            Working
          </button>
          <button
            type="button"
            onClick={() => setTab("onboarded")}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition sm:text-sm ${
              tab === "onboarded" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            Onboarded
          </button>
          <button
            type="button"
            onClick={() => setTab("out-of-office")}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition sm:text-sm ${
              tab === "out-of-office" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            Out of Office
          </button>
        </div>

        {(tab === "out-of-office" || tab === "working") && !canAttendance ? (
          <p className="rounded-lg bg-amber-50 px-3 py-3 text-xs text-amber-700">
            Your role can view employees but not attendance, so "{tab === "working" ? "Working" : "Out of Office"}" can't be determined.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <th className="py-2 pr-3 font-semibold">Name</th>
                  <th className="hidden py-2 pr-3 font-semibold sm:table-cell">Employee ID</th>
                  <th className="py-2 pr-3 text-right font-semibold">Position</th>
                </tr>
              </thead>
              <tbody>
                {loading &&
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      <td className="py-3" colSpan={3}>
                        <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100" />
                      </td>
                    </tr>
                  ))}

                {!loading && error && (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-xs text-rose-500">
                      {error}
                    </td>
                  </tr>
                )}

                {!loading && !error && rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-8">
                      <div className="flex flex-col items-center gap-2 text-gray-400">
                        <Users size={22} />
                        <p className="text-xs">
                          {tab === "working"
                            ? "No team members are working today."
                            : tab === "onboarded"
                              ? "No employees found."
                              : "Nobody is out of office today."}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}

                {!loading &&
                  !error &&
                  rows.map((r, i) => (
                    <tr key={r.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? "bg-amber-50/40" : ""}`}>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2.5">
                          <EmployeeAvatar firstName={r.firstName} lastName={r.lastName} photo={r.photo} thumb={r.thumb} size={32} />
                          <span className="font-medium text-gray-900">
                            {r.firstName} {r.lastName}
                          </span>
                        </div>
                      </td>
                      <td className="hidden py-2.5 pr-3 text-gray-500 sm:table-cell">{r.code}</td>
                      <td className="py-2.5 pr-3 text-right text-gray-700">{r.position}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
