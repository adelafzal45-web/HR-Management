/**
 * Response shapes for the three dashboard aggregates.
 *
 * These are plain interfaces rather than DTO classes because nothing here is
 * ever an *input* — there is no body to validate. The frontend mirrors them in
 * `Frontend/src/modules/dashboard/api/dashboardApi.ts`.
 *
 * Every number below is computed from a real table on request. `null` means
 * "genuinely no data" (no appraisal yet, no payslip yet) and the UI shows a dash
 * for it — it never means "we could not work it out".
 */

/** HR/Admin org-wide counters, as of `as_of`. */
export interface AdminDashboardResponse {
  /** Local calendar date the counters were taken on (YYYY-MM-DD). */
  as_of: string;
  total_employees: number;
  present_today: number;
  absent_today: number;
  on_leave_today: number;
  pending_leave_requests: number;
  pending_appraisals: number;
}

/** One row of the "this month so far" attendance/leave block. */
export interface MonthToDateStats {
  /** `YYYY-MM` the figures cover. */
  month: string;
  /** First of the month (inclusive). */
  from: string;
  /** Today (inclusive) — the "till today" in every label. */
  to: string;
  /** Scheduled working days in [from, to], holidays excluded. */
  working_days: number;
  present_days: number;
  absent_days: number;
  leave_days: number;
  late_days: number;
}

export interface SelfAppraisalStats {
  /** Score of today's appraisal, or null when none was submitted today. */
  today_score: number | null;
  /** Mean of this month's scored appraisals, or null when there are none. */
  monthly_average: number | null;
  /** How many scored appraisals this month the average is built from. */
  scored_this_month: number;
}

export interface SelfPayrollSummary {
  /**
   * False when HR has switched `employee_self_service` off — the figure is
   * withheld by policy, not missing. The UI says so rather than showing 0.
   */
  visible: boolean;
  net_salary: number | null;
  currency: string;
  period_name: string | null;
  period_status: string | null;
  pay_date: string | null;
}

/** One working day with whatever attendance was recorded against it. */
export interface WorkingDayAttendance {
  date: string;
  /** Null when no attendance row exists for that working day. */
  status: string | null;
  check_in: string | null;
  check_out: string | null;
  working_hours: number | null;
}

/** `GET /dashboard/me` — self-service, no permission required. */
export interface SelfDashboardResponse {
  appraisal: SelfAppraisalStats;
  attendance: MonthToDateStats;
  payroll: SelfPayrollSummary;
  /** Most recent working days first. Length ≤ 7; shorter early in a new month. */
  last_working_days: WorkingDayAttendance[];
}

/** One team member row for the Team Analytics table. */
export interface TeamMemberStat {
  user_id: string;
  employee_code: string;
  employee_name: string;
  designation: string | null;
  avatar_url: string | null;
  avatar_thumb_url: string | null;
  /** Days marked Present/Late/Half-Day this month so far. */
  present_days: number;
  /** Scheduled working days this month so far, for context beside `present_days`. */
  working_days: number;
  /** Mean of this member's scored appraisals this month, or null. */
  performance: number | null;
  /** Whether they are on approved leave today. */
  on_leave_today: boolean;
  /** Today's attendance status, or null when nothing was recorded. */
  today_status: string | null;
}

/** `GET /dashboard/team` — roster-scoped to the caller's own team. */
export interface TeamDashboardResponse {
  month: string;
  team_size: number;
  /** Mean of every scored appraisal across the roster this month, or null. */
  team_performance_mean: number | null;
  /** One appraisal is expected per team member per month. */
  expected_appraisals: number;
  /** Members with no submitted/approved appraisal this month yet. */
  pending_appraisals: number;
  members: TeamMemberStat[];
}
