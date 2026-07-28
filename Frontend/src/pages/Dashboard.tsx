import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../components/dashboard/DashboardLayout";
import StatCard from "../components/dashboard/StatCard";
import TeamAnalytics from "../components/dashboard/TeamAnalytics";
import CalendarCard from "../components/dashboard/CalendarCard";
import EventCard from "../components/dashboard/EventCard";
import WelcomeCard from "../components/dashboard/WelcomeCard";
import BackendStatusBanner from "../components/BackendStatusBanner";
import { useBackendStatus } from "../hooks/useBackendStatus";
import { useAuth } from "../lib/AuthContext";
import { calendarEvents, teamMembers, type StatCardData } from "../lib/dashboardMockData";
import { attendanceApi, leaveApi, payrollApi, appraisalApi } from "../lib/hrApi";

const now = new Date();

// Builds the dashboard's summary cards from the same per-employee endpoints
// used on the Attendance / Leave / Payroll / Appraisal pages — each of those
// already tries the real backend first and only falls back to demo data if
// the backend can't be reached, so whatever shows up here always reflects
// the currently logged-in employee (real data when the API is up, realistic
// demo data otherwise).
async function loadSummaryCards(): Promise<StatCardData[]> {
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

  return [
    { id: "performance", value: performanceValue, label: "Performance Score", icon: "trending-up", tone: "green" },
    { id: "present", value: String(present), label: "Present This Month", icon: "user-check", tone: "blue" },
    { id: "late", value: String(late), label: "Late This Month", icon: "user-minus", tone: "sky" },
    { id: "absent", value: String(absent), label: "Absent This Month", icon: "user-x", tone: "red" },
    { id: "leave-remaining", value: String(leaveRemaining), label: "Leave Days Remaining", icon: "users", tone: "mint" },
    { id: "payroll", value: payrollValue, label: "Latest Payslip", icon: "file-check", tone: "rose" },
  ];
}

export default function Dashboard() {
  const { user } = useAuth();
  const status = useBackendStatus();
  const firstName = user?.firstName || "Ali";

  const [cards, setCards] = useState<StatCardData[] | null>(null);

  useEffect(() => {
    let active = true;
    loadSummaryCards()
      .then((data) => active && setCards(data))
      .catch(() => active && setCards([]));
    return () => {
      active = false;
    };
    // Re-fetch whenever the signed-in user changes (e.g. switching accounts).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  const skeletons = useMemo(() => Array.from({ length: 6 }, (_, i) => i), []);

  return (
    <DashboardLayout title="Dashboard" activeKey="dashboard">
      <BackendStatusBanner status={status} />

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

          <TeamAnalytics members={teamMembers} />
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
