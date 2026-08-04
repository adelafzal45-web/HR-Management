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
