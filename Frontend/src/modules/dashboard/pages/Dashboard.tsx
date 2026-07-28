import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import StatCard from "@/modules/dashboard/components/StatCard";
import TeamAnalytics from "@/modules/dashboard/components/TeamAnalytics";
import CalendarCard from "@/modules/dashboard/components/CalendarCard";
import EventCard from "@/modules/dashboard/components/EventCard";
import WelcomeCard from "@/modules/dashboard/components/WelcomeCard";
import HolidayBanner from "@/modules/dashboard/components/HolidayBanner";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useAuth } from "@/app/providers/AuthContext";
import { calendarEvents, type StatCardData, type TeamMember } from "@/modules/dashboard/mocks/dashboardMockData";
import { attendanceApi, leaveApi, payrollApi, appraisalApi } from "@/api/hrApi";
import { teamApi, teamLeaveApi } from "@/modules/team/api/teamApi";
import { employeesApi } from "@/modules/employees/api/employeeApi";
import type { AuthUser } from "@/utils/auth";

const now = new Date();

// Builds the dashboard's summary cards from the same per-employee endpoints
// used on the Attendance / Leave / Payroll / Appraisal pages — each of those
// already tries the real backend first and only falls back to demo data if
// the backend can't be reached, so whatever shows up here always reflects
// the currently logged-in employee (real data when the API is up, realistic
// demo data otherwise).
//
// Team Leads / HR Managers / Administrators get extra, role-scoped cards
// appended after the personal ones — Team Size and Pending Leave Approvals
// for anyone who manages people, plus a company-wide Total Employees card
// for HR/Admin specifically. Regular employees only ever see their own six
// personal cards, so nobody sees data outside what their role covers.
async function loadSummaryCards(role: AuthUser["role"]): Promise<StatCardData[]> {
  const [history, balances, payroll, appraisals] = await Promise.all([
    attendanceApi.getHistory({ month: now.getMonth() + 1, year: now.getFullYear() }),
    leaveApi.getBalance(),
    payrollApi.getMyPayroll(),
    appraisalApi.getMyAppraisals(),
  ]);

  const present = history.filter((r) => r.status === "Present").length;
  const late = history.filter((r) => r.status === "Late").length;
  const absent = history.filter((r) => r.status === "Absent").length;

  const leaveRemaining = balances.reduce((sum, b) => sum + b.remaining, 0);

  const latestPayroll = payroll[0];
  const payrollValue = latestPayroll
    ? latestPayroll.status === "Generated"
      ? "Paid"
      : "Pending"
    : "—";

  const latestAppraisal = appraisals[0];
  const performanceValue = latestAppraisal ? `${Math.round((latestAppraisal.totalScore / 10) * 100)}%` : "—";

  const cards: StatCardData[] = [
    { id: "performance", value: performanceValue, label: "Performance Score", icon: "trending-up", tone: "green" },
    { id: "present", value: String(present), label: "Present This Month", icon: "user-check", tone: "blue" },
    { id: "late", value: String(late), label: "Late This Month", icon: "user-minus", tone: "sky" },
    { id: "absent", value: String(absent), label: "Absent This Month", icon: "user-x", tone: "red" },
    { id: "leave-remaining", value: String(leaveRemaining), label: "Leave Days Remaining", icon: "users", tone: "mint" },
    { id: "payroll", value: payrollValue, label: "Latest Payslip", icon: "file-check", tone: "rose" },
  ];

  const isManager = role === "hr_manager" || role === "administrator";
  const isTeamLead = role === "team_lead";

  if (isManager || isTeamLead) {
    const teamLeaves = await teamLeaveApi.getTeamLeaveRequests();
    const pendingApprovals = teamLeaves.filter((l) => l.status === "Pending").length;
    cards.push({
      id: "pending-approvals",
      value: String(pendingApprovals),
      label: isManager ? "Pending Leave Approvals (Company)" : "Pending Leave Approvals (My Team)",
      icon: "clipboard-check",
      tone: "amber",
    });
  }

  if (isManager) {
    const { total } = await employeesApi.list({ pageSize: 1 });
    cards.push({
      id: "total-employees",
      value: String(total),
      label: "Total Employees",
      icon: "building",
      tone: "violet",
    });
  }

  return cards;
}

// Maps the Team Lead workspace's richer TeamMember shape (from teamApi —
// same real-backend-first/demo-fallback pattern as everything else) down to
// the compact shape this dashboard widget renders, so the widget shows
// real, role-scoped teammates instead of a hardcoded roster.
function toWidgetMember(m: Awaited<ReturnType<typeof teamApi.getTeamMembers>>[number]): TeamMember {
  return {
    id: m.employeeId,
    name: `${m.firstName} ${m.lastName}`.trim(),
    employeeId: m.employeeCode,
    position: m.designation,
    department: m.department,
    status: m.status === "On Leave" ? "out-of-office" : "onboarded",
  };
}

export default function Dashboard() {
  const { user } = useAuth();
  const status = useBackendStatus();
  const firstName = user?.firstName || "Ali";
  const role = user?.role;

  // Regular employees don't get a roster of their teammates' onboarding /
  // out-of-office status — that's a manager-facing view. Anyone with a role
  // that manages people (or no role info at all, e.g. older demo sessions
  // without the field) still sees it, same as before.
  const canSeeTeamAnalytics = role !== "employee";

  const [cards, setCards] = useState<StatCardData[] | null>(null);
  const [teamData, setTeamData] = useState<TeamMember[] | null>(null);

  useEffect(() => {
    let active = true;
    loadSummaryCards(role)
      .then((data) => active && setCards(data))
      .catch(() => active && setCards([]));
    return () => {
      active = false;
    };
    // Re-fetch whenever the signed-in user (or their role) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email, role]);

  useEffect(() => {
    if (!canSeeTeamAnalytics) {
      setTeamData(null);
      return;
    }
    let active = true;
    teamApi
      .getTeamMembers()
      .then((data) => active && setTeamData(data.map(toWidgetMember)))
      .catch(() => active && setTeamData([]));
    return () => {
      active = false;
    };
  }, [canSeeTeamAnalytics, user?.email]);

  const skeletons = useMemo(() => Array.from({ length: 6 }, (_, i) => i), []);

  const teamScopeLabel =
    role === "administrator" || role === "hr_manager" ? "Company-wide" : role === "team_lead" ? "Your direct reports" : undefined;

  return (
    <DashboardLayout title="Dashboard" activeKey="dashboard">
      <BackendStatusBanner status={status} />

      {calendarEvents.some((e) => e.type === "holiday") && (
        <div className="mt-4">
          <HolidayBanner role={role} />
        </div>
      )}

      {/* Mobile & tablet only: welcome card pinned to the very top of the page.
          Desktop (xl+) keeps its original welcome card, unchanged, inside the
          right column below — this duplicate is hidden from xl upward. */}
      <div className="mt-4 xl:hidden">
        <WelcomeCard name={firstName} avatarUrl={user?.avatarUrl} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 xl:mt-0 xl:grid-cols-[1fr_340px]">
        {/* Main column */}
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 xs:gap-4 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] xl:gap-4">
            {cards === null
              ? skeletons.map((i) => (
                  <div key={i} className="h-[110px] animate-pulse rounded-2xl bg-gray-100" />
                ))
              : cards.map((card) => <StatCard key={card.id} {...card} />)}
          </div>

          {canSeeTeamAnalytics && <TeamAnalytics members={teamData} scopeLabel={teamScopeLabel} />}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-5">
          {/* Desktop-only welcome card — identical to the original, untouched. */}
          <div className="hidden xl:block">
            <WelcomeCard name={firstName} avatarUrl={user?.avatarUrl} />
          </div>

          <div>
            <h2 className="mb-3 text-lg font-semibold tracking-tight text-gray-900">Calendar</h2>
            <CalendarCard />
          </div>

          <div className="flex flex-col gap-3">
            {calendarEvents.map((event) => (
              <EventCard key={event.id} {...event} />
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
