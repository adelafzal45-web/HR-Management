// Central definition of the user roles recognized by the frontend.
// Keep this in sync with the roles issued by the backend's auth/JWT payload.

export const ROLES = {
 EMPLOYEE: "employee",
 TEAM_LEAD: "team_lead",
 HR_MANAGER: "hr_manager",
 ADMINISTRATOR: "administrator",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/** Roles allowed into the Team Lead workspace. */
export const TEAM_LEAD_ROLES: Role[] = [ROLES.TEAM_LEAD];

/** Roles allowed into the HR Manager / Administrator workspace. */
export const HR_ADMIN_ROLES: Role[] = [ROLES.HR_MANAGER, ROLES.ADMINISTRATOR];

/**
 * Roles allowed to open the roster and write an evaluation.
 *
 * Wider than TEAM_LEAD_ROLES because an administrator evaluates org-wide: the
 * backend resolves their roster to every active employee (see
 * `resolveEvaluableEmployeeIds`), and gating the two screens that reach it on
 * Team Lead alone would leave that scope unreachable from the UI.
 *
 * Only /team and /team/evaluate/:employeeId use this. The rest of the Team Lead
 * workspace — attendance, leaves, reports — stays on TEAM_LEAD_ROLES, since
 * nothing there widened.
 */
export const EVALUATOR_ROLES: Role[] = [...TEAM_LEAD_ROLES, ...HR_ADMIN_ROLES];
