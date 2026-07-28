// Central registry of every backend REST path this app calls.
//
// This is the ONE place to edit when the backend renames a route or adds a
// missing controller — every `api/*Api.ts` module imports paths from here
// instead of hardcoding path strings inline. Nothing here changes request/
// response shapes (see each `mocks/*MockData.ts` + `api/*Api.ts` pair for the
// field-level adapters) — this file is purely "what URL do I call".
//
// Grouped to match the live Swagger doc / ERD tables. See BACKEND_CONTRACT.md
// and MERGE_AND_BACKEND_NOTES.md for the confirmed-vs-best-guess status of
// each group.
export const ENDPOINTS = {
  auth: {
    login: "/auth/login",
    register: "/auth/register",
    forgetPassword: "/auth/forget-password",
    resetPassword: "/auth/reset-password",
    changePassword: "/auth/change-password",
  },

  profile: {
    me: "/profile/me",
  },

  // Employees are exposed as `/users` on the live backend (the ERD's
  // "Employees (Users)" table), not `/employees` — see employeeApi.ts.
  employees: {
    base: "/users",
    byId: (id: string) => `/users/${id}`,
  },

  departments: {
    base: "/departments",
    byId: (id: string) => `/departments/${id}`,
  },

  designations: {
    base: "/designations",
    byId: (id: string) => `/designations/${id}`,
  },

  jobCategories: {
    base: "/job-categories",
    byId: (id: string) => `/job-categories/${id}`,
  },

  shifts: {
    base: "/shifts",
    byId: (id: string) => `/shifts/${id}`,
  },

  permissions: {
    base: "/permissions",
    byId: (id: string) => `/permissions/${id}`,
  },

  roles: {
    base: "/roles",
    byId: (id: string) => `/roles/${id}`,
  },

  rolePermissions: {
    base: "/role-permissions",
    byId: (id: string) => `/role-permissions/${id}`,
  },

  companySettings: {
    company: "/settings/company",
    branding: "/settings/branding",
  },

  // Full CRUD REST tables — self-service (hrApi.ts) and admin-ops
  // (adminOpsApi.ts) both read/write the same underlying routes.
  attendance: {
    base: "/attendance",
    byId: (id: string) => `/attendance/${id}`,
  },

  leaveRequests: {
    base: "/leave-requests",
    byId: (id: string) => `/leave-requests/${id}`,
  },

  // Confirmed live REST CRUD (per the Swagger doc): POST/GET /payroll,
  // GET/PATCH/DELETE /payroll/:id. Rows are flat (basic_salary, allowance,
  // bonus, deduction, tax, net_salary, payroll_month, payment_date) with the
  // employee nested under `user` — see payrollAdapter.ts for the confirmed
  // shape and the field-level adapter.
  payroll: {
    base: "/payroll",
    byId: (id: string) => `/payroll/${id}`,
  },

  performanceReviews: {
    base: "/performance-reviews",
    byId: (id: string) => `/performance-reviews/${id}`,
  },

  notifications: {
    base: "/notifications",
    byId: (id: string) => `/notifications/${id}`,
  },

  // Team Lead workspace — proposed routes, not yet confirmed against a live
  // controller. See BACKEND_CONTRACT.md for the full request/response shapes.
  team: {
    members: "/team/members",
    attendance: "/team/attendance",
    leaves: "/team/leaves",
    reports: "/team/reports",
  },

  appraisal: {
    criteria: "/appraisal/criteria",
    evaluate: (employeeId: string) => `/appraisal/evaluate/${employeeId}`,
  },
} as const;
