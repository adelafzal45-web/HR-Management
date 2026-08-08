import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarX2 } from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import SectionTabs from "@/components/common/SectionTabs";
import EmptyState from "@/components/common/EmptyState";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useAuth } from "@/app/providers/AuthContext";
import { useToast } from "@/app/providers/ToastContext";
import { getLeaveTabs } from "@/config/featureTabs";
import { ROLES } from "@/constants/roles";
import { departmentsApi, type Department } from "@/modules/settings/api/settingsApi";
import {
  leavePlannerApi,
  type PlannerData,
  type PlannerHoliday,
  type PlannerLeave,
  type PlannerScope,
} from "@/modules/leave/api/leavePlannerApi";
import {
  WEEKDAY_LABELS,
  addDays,
  addMonths,
  buildMonthGrid,
  buildWeekDays,
  dayLabel,
  isSameMonth,
  isWeekend,
  monthLabel,
  parseIsoDate,
  startOfDay,
  toIsoDate,
  weekLabel,
  type CalendarView,
} from "@/modules/leave/utils/plannerCalendar";

/**
 * Which requests count as "someone will be away". Rejected and Cancelled are
 * never painted — a plan is about who is actually going to be absent, and
 * showing withdrawn requests would over-state coverage gaps.
 */
type StatusFilter = "all" | "Approved" | "Pending";

const VIEWS: { value: CalendarView; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Approved & Pending" },
  { value: "Approved", label: "Approved only" },
  { value: "Pending", label: "Pending only" },
];

const PLANNABLE = new Set(["Approved", "Pending"]);

const HALF_DAYS = new Set(["First Half", "Second Half"]);

function isHalfDay(durationType: string): boolean {
  return HALF_DAYS.has(durationType);
}

/** Approved reads as settled (tint); pending reads as provisional (solid). */
function chipTone(status: PlannerLeave["status"]): string {
  return status === "Approved"
    ? "bg-brand-light text-brand-dark"
    : "bg-brand text-white";
}

export default function LeavePlanner() {
  const status = useBackendStatus();
  const toast = useToast();
  const { user } = useAuth();
  const tabs = getLeaveTabs(user?.role);

  // An employee holds neither `leave-request.view` nor `.create`, so the only
  // leave they may read is their own — the scope decides which endpoint is
  // called, so their browser never receives anyone else's rows.
  const scope: PlannerScope = user?.role && user.role !== ROLES.EMPLOYEE ? "organization" : "mine";
  const isOrgScope = scope === "organization";

  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);

  const [data, setData] = useState<PlannerData>({ leaves: [], holidays: [] });
  const [loading, setLoading] = useState(true);

  const year = anchor.getFullYear();
  const todayIso = toIsoDate(new Date());

  useEffect(() => {
    let active = true;
    setLoading(true);
    leavePlannerApi
      .load({
        year,
        scope,
        departmentId: isOrgScope ? departmentFilter || undefined : undefined,
        selfName: [user?.firstName, user?.lastName].filter(Boolean).join(" "),
      })
      .then((res) => {
        if (active) setData(res);
      })
      .catch(() => {
        if (active) toast.showError("Couldn't load the leave planner.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, scope, departmentFilter]);

  useEffect(() => {
    if (!isOrgScope) return;
    departmentsApi
      .listAll()
      .then((res) => setDepartments(res.data))
      .catch(() => undefined);
  }, [isOrgScope]);
  // ---- Derived data --------------------------------------------------------

  const visibleLeaves = useMemo(
    () =>
      data.leaves.filter(
        (l) =>
          PLANNABLE.has(l.status) && (statusFilter === "all" || l.status === statusFilter),
      ),
    [data.leaves, statusFilter],
  );

  // A department-scoped holiday only applies to that department, so when a
  // department is selected the company-wide ones still show alongside it.
  const visibleHolidays = useMemo(
    () =>
      departmentFilter
        ? data.holidays.filter((h) => !h.departmentId || h.departmentId === departmentFilter)
        : data.holidays,
    [data.holidays, departmentFilter],
  );

  // Indexed by ISO date so each cell is an O(1) lookup instead of re-scanning
  // every request 42 times per render.
  const leavesByDay = useMemo(() => {
    const map = new Map<string, PlannerLeave[]>();
    for (const leave of visibleLeaves) {
      const end = parseIsoDate(leave.endDate || leave.startDate);
      for (let d = parseIsoDate(leave.startDate); d <= end; d = addDays(d, 1)) {
        const key = toIsoDate(d);
        const bucket = map.get(key);
        if (bucket) bucket.push(leave);
        else map.set(key, [leave]);
      }
    }
    return map;
  }, [visibleLeaves]);

  const holidaysByDay = useMemo(() => {
    const map = new Map<string, PlannerHoliday[]>();
    for (const h of visibleHolidays) {
      const bucket = map.get(h.date);
      if (bucket) bucket.push(h);
      else map.set(h.date, [h]);
    }
    return map;
  }, [visibleHolidays]);

  const days = useMemo(() => {
    if (view === "month") return buildMonthGrid(anchor);
    if (view === "week") return buildWeekDays(anchor);
    return [anchor];
  }, [view, anchor]);

  const periodLabel =
    view === "month" ? monthLabel(anchor) : view === "week" ? weekLabel(anchor) : dayLabel(anchor);

  const step = (direction: 1 | -1) => {
    setAnchor((prev) =>
      view === "month"
        ? addMonths(prev, direction)
        : addDays(prev, direction * (view === "week" ? 7 : 1)),
    );
  };

  // Distinct people away in the visible period — a 5-day request is one person
  // away, not five.
  const awayThisPeriod = useMemo(() => {
    const ids = new Set<string>();
    for (const day of days) {
      for (const leave of leavesByDay.get(toIsoDate(day)) ?? []) ids.add(leave.employeeId);
    }
    return ids.size;
  }, [days, leavesByDay]);

  const onLeaveToday = leavesByDay.get(todayIso)?.length ?? 0;

  const upcomingHolidays = useMemo(
    () => visibleHolidays.filter((h) => h.date >= todayIso).slice(0, 3),
    [visibleHolidays, todayIso],
  );

  const openDay = (day: Date) => {
    setAnchor(day);
    setView("day");
  };
  return (
    <DashboardLayout title="Leave Planner" activeKey="leave">
      <BackendStatusBanner status={status} />
      <SectionTabs tabs={tabs} active="planner" />

      <div className="grid grid-cols-1 gap-4 xs:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <p className="text-sm font-medium text-gray-500">
            {isOrgScope ? "On leave today" : "Your leave today"}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-brand-dark">{onLeaveToday}</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <p className="text-sm font-medium text-gray-500">
            {isOrgScope ? "People away this period" : "Days away this period"}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-brand-dark">{awayThisPeriod}</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 xs:col-span-2 lg:col-span-1">
          <p className="text-sm font-medium text-gray-500">Upcoming holidays</p>
          {upcomingHolidays.length === 0 ? (
            <p className="mt-2 text-sm text-gray-400">None left in {year}.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {upcomingHolidays.map((h) => (
                <li key={`${h.holidayId}-${h.date}`} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-gray-900">{h.name}</span>
                  <span className="shrink-0 text-xs text-gray-400">
                    {parseIsoDate(h.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label={`Previous ${view}`}
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label={`Next ${view}`}
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
            >
              <ChevronRight size={18} />
            </button>
            <h2 className="ml-1 text-base font-semibold text-gray-900">{periodLabel}</h2>
            <button
              type="button"
              onClick={() => setAnchor(startOfDay(new Date()))}
              className="ml-2 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
            >
              Today
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl bg-gray-100 p-1" role="group" aria-label="Calendar view">
              {VIEWS.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => setView(v.value)}
                  aria-pressed={view === v.value}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    view === v.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              aria-label="Filter by status"
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none focus:ring-2 focus:ring-brand/60"
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            {isOrgScope && (
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                aria-label="Filter by department"
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none focus:ring-2 focus:ring-brand/60"
              >
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d.departmentId} value={d.departmentId}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-100 pt-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-brand-light ring-1 ring-brand/40" /> Approved
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-brand" /> Pending
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-100 ring-1 ring-amber-300" /> Public holiday
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-gray-100 ring-1 ring-gray-300" /> Weekend
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full ring-2 ring-brand-dark" /> Today
          </span>
        </div>

        {loading ? (
          <div className="mt-5 grid grid-cols-7 gap-1.5">
            {[...Array(view === "day" ? 1 : view === "week" ? 7 : 42)].map((_, i) => (
              <div
                key={i}
                className={`animate-pulse rounded-lg bg-gray-100 ${
                  view === "month" ? "h-24" : "h-40"
                } ${view === "day" ? "col-span-7" : ""}`}
              />
            ))}
          </div>
        ) : view === "day" ? (
          <DayAgenda
            day={anchor}
            leaves={leavesByDay.get(toIsoDate(anchor)) ?? []}
            holidays={holidaysByDay.get(toIsoDate(anchor)) ?? []}
            showEmployee={isOrgScope}
          />
        ) : (
          <div className="mt-5 overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-7 gap-1.5">
                {WEEKDAY_LABELS.map((label) => (
                  <div
                    key={label}
                    className="pb-2 text-center text-xs font-medium uppercase tracking-wide text-gray-400"
                  >
                    {label}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {days.map((day) => {
                  const iso = toIsoDate(day);
                  return (
                    <DayCell
                      key={iso}
                      day={day}
                      iso={iso}
                      isToday={iso === todayIso}
                      isOutsideMonth={view === "month" && !isSameMonth(day, anchor)}
                      leaves={leavesByDay.get(iso) ?? []}
                      holidays={holidaysByDay.get(iso) ?? []}
                      maxChips={view === "month" ? 3 : 8}
                      compact={view === "month"}
                      showEmployee={isOrgScope}
                      onOpen={() => openDay(day)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

type DayCellProps = {
  day: Date;
  iso: string;
  isToday: boolean;
  isOutsideMonth: boolean;
  leaves: PlannerLeave[];
  holidays: PlannerHoliday[];
  maxChips: number;
  compact: boolean;
  showEmployee: boolean;
  onOpen: () => void;
};

function DayCell({
  day,
  iso,
  isToday,
  isOutsideMonth,
  leaves,
  holidays,
  maxChips,
  compact,
  showEmployee,
  onOpen,
}: DayCellProps) {
  const holiday = holidays[0];
  const weekend = isWeekend(day);

  const background = holiday
    ? "bg-amber-50"
    : isOutsideMonth
      ? "bg-gray-50/70"
      : weekend
        ? "bg-gray-50"
        : "bg-white";

  const overflow = leaves.length - maxChips;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${dayLabel(day)} — ${leaves.length} on leave${holiday ? `, ${holiday.name}` : ""}`}
      className={`flex flex-col items-stretch gap-1 rounded-lg p-2 text-left ring-1 transition hover:ring-brand/50 ${background} ${
        compact ? "min-h-24" : "min-h-40"
      } ${isToday ? "ring-2 ring-brand-dark" : "ring-gray-100"}`}
    >
      <div className="flex items-baseline justify-between gap-1">
        <span
          className={`text-sm font-semibold ${
            isOutsideMonth ? "text-gray-300" : isToday ? "text-brand-dark" : "text-gray-900"
          }`}
        >
          {day.getDate()}
        </span>
        {leaves.length > 0 && (
          <span className="rounded-full bg-gray-100 px-1.5 text-[10px] font-semibold text-gray-500">
            {leaves.length}
          </span>
        )}
      </div>

      {holiday && (
        <span
          className="truncate rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200"
          title={holidays.map((h) => h.name).join(", ")}
        >
          {holiday.name}
        </span>
      )}

      <div className="flex flex-col gap-1">
        {leaves.slice(0, maxChips).map((leave) => (
          <span
            key={`${leave.leaveId}-${iso}`}
            title={`${leave.employeeName} — ${leave.leaveTypeName} (${leave.durationType}, ${leave.status})`}
            className={`truncate rounded px-1.5 py-0.5 text-[10px] font-medium ${chipTone(leave.status)}`}
          >
            {isHalfDay(leave.durationType) && <span aria-hidden>½ </span>}
            {showEmployee ? leave.employeeName : leave.leaveTypeName}
          </span>
        ))}
        {overflow > 0 && (
          <span className="px-1.5 text-[10px] font-medium text-gray-500">+{overflow} more</span>
        )}
      </div>
    </button>
  );
}

type DayAgendaProps = {
  day: Date;
  leaves: PlannerLeave[];
  holidays: PlannerHoliday[];
  showEmployee: boolean;
};

function DayAgenda({ day, leaves, holidays, showEmployee }: DayAgendaProps) {
  const weekend = isWeekend(day);

  return (
    <div className="mt-5">
      {(holidays.length > 0 || weekend) && (
        <div
          className={`mb-4 rounded-xl px-4 py-3 text-sm ring-1 ${
            holidays.length > 0
              ? "bg-amber-50 text-amber-800 ring-amber-200"
              : "bg-gray-50 text-gray-600 ring-gray-200"
          }`}
        >
          {holidays.length > 0 ? (
            <>
              <span className="font-semibold">
                {holidays.map((h) => h.name).join(", ")}
              </span>
              <span className="ml-1.5 text-xs">
                {holidays.every((h) => !h.departmentId)
                  ? "· Company-wide public holiday"
                  : `· ${holidays.map((h) => h.departmentName).join(", ")}`}
              </span>
            </>
          ) : (
            <span className="font-medium">Weekend — not a working day.</span>
          )}
        </div>
      )}

      {leaves.length === 0 ? (
        <EmptyState
          icon={CalendarX2}
          title={showEmployee ? "Nobody is on leave" : "No leave on this day"}
          description={`Nothing scheduled for ${dayLabel(day)}.`}
        />
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl ring-1 ring-gray-100">
          {leaves.map((leave) => (
            <li key={leave.leaveId} className="flex flex-wrap items-center gap-3 bg-white px-4 py-3">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  leave.status === "Approved" ? "bg-brand-light ring-1 ring-brand/40" : "bg-brand"
                }`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                  {showEmployee ? leave.employeeName : leave.leaveTypeName}
                </p>
                <p className="truncate text-xs text-gray-400">
                  {showEmployee && `${leave.leaveTypeName} · `}
                  {leave.durationType}
                  {showEmployee && leave.departmentName !== "—" && ` · ${leave.departmentName}`}
                </p>
              </div>
              <span className="shrink-0 text-xs text-gray-400">
                {parseIsoDate(leave.startDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                {leave.endDate && leave.endDate !== leave.startDate && (
                  <>
                    {" – "}
                    {parseIsoDate(leave.endDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  </>
                )}
              </span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${chipTone(leave.status)}`}
              >
                {leave.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
