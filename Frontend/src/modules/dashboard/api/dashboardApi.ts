// Dashboard aggregates — one request per role instead of stitching several
// list endpoints together in the browser.
//
// This module exists because the numbers on the dashboard cannot all be
// computed client-side. "Working Days (Till Today)" needs the designation ->
// department -> global working-week ladder plus the holiday calendar, and both
// of those reads are gated on `working-days.view`, which an Employee does not
// hold. The backend computes them against the same services the Attendance and
// Appraisal screens use, so a tile can never disagree with the screen it links
// to.
//
// Real backend or throw — no demo fallback, matching the payroll api modules.
// A `null` in any field below means "genuinely no data" (nothing scored yet, no
// payslip yet), never "we could not work it out".

import { api, ENDPOINTS } from "@/lib/apiClient";

const { dashboard } = ENDPOINTS;

/** Org-wide counters for the Admin/HR dashboard. Everything is "as of today". */
export type AdminDashboard = {
  as_of: string;
  total_employees: number;
  present_today: number;
  absent_today: number;
  on_leave_today: number;
  pending_leave_requests: number;
  pending_appraisals: number;
};

/**
 * Month-to-date attendance measured against the real working calendar:
 * `working_days` already excludes weekends *and* holidays for the employee's
 * own department/designation, so it is a denominator that reconciles with
 * `present_days` sitting next to it.
 */
export type MonthToDateStats = {
  month: string;
  from: string;
  to: string;
  working_days: number;
  present_days: number;
  absent_days: number;
  leave_days: number;
  late_days: number;
};

export type SelfAppraisalStats = {
  /** Score from a review dated today, if one exists. */
  today_score: number | null;
  /** Mean of every scored review this month. Null when nothing was scored. */
  monthly_average: number | null;
  scored_this_month: number;
};

/**
 * Latest net pay. `visible` mirrors the `employee_self_service` payroll setting
 * — when HR turns self-service off the figure is withheld rather than faked.
 */
export type SelfPayrollSummary = {
  visible: boolean;
  net_salary: number | null;
  currency: string;
  period_name: string | null;
  period_status: string | null;
  pay_date: string | null;
};

/** One working day and what attendance was recorded on it (null = no record). */
export type WorkingDayAttendance = {
  date: string;
  status: string | null;
  check_in: string | null;
  check_out: string | null;
  working_hours: number | null;
};

export type SelfDashboard = {
  appraisal: SelfAppraisalStats;
  attendance: MonthToDateStats;
  payroll: SelfPayrollSummary;
  /** Newest first, holidays and non-working days skipped. */
  last_working_days: WorkingDayAttendance[];
};

/** One roster member as the Team Analytics table shows them. */
export type TeamMemberStat = {
  user_id: string;
  employee_code: string;
  employee_name: string;
  designation: string | null;
  avatar_url: string | null;
  avatar_thumb_url: string | null;
  present_days: number;
  working_days: number;
  /** Mean appraisal score this month, or null when unscored (= pending). */
  performance: number | null;
  on_leave_today: boolean;
  today_status: string | null;
};

export type TeamDashboard = {
  month: string;
  team_size: number;
  /** Mean of every scored review across the roster this month. */
  team_performance_mean: number | null;
  expected_appraisals: number;
  pending_appraisals: number;
  members: TeamMemberStat[];
};

export const dashboardApi = {
  /** The signed-in user's own figures. Token-scoped, no permission needed. */
  getMine: (): Promise<SelfDashboard> => api.get<SelfDashboard>(dashboard.me),

  /**
   * The caller's team. Narrowed server-side to their roster — a lead with no
   * roster gets an empty team, never the whole organisation.
   */
  getTeam: (): Promise<TeamDashboard> => api.get<TeamDashboard>(dashboard.team),

  /** Org-wide counters (requires `employees.view`). */
  getAdmin: (): Promise<AdminDashboard> =>
    api.get<AdminDashboard>(dashboard.admin),
};
