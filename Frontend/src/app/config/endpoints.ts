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
 // NOTE: `auth` and `profile` deliberately do NOT live here either.
 //
 // The auth block named `/auth/forget-password`, `/auth/reset-password` and
 // `/auth/change-password`. Only the middle one is a real route: password
 // recovery is `/auth/forgot-password` (forgot, not forget) and changing your
 // own password is `/users/me/change-password`. `profile.me` pointed at
 // `/profile/me`, which has never existed — self-service profile reads go
 // through `/auth/me` and `/users/me`. Both blocks had zero consumers.
 //
 // The live auth paths are in lib/apiClient.ts (ENDPOINTS.auth), which is what
 // authApi.ts and modules/auth/api/passwordApi.ts import.
 //
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

 notifications: {
 base: "/notifications",
 byId: (id: string) => `/notifications/${id}`,
 },

 // NOTE: appraisal/team endpoints deliberately do NOT live here.
 //
 // This module is the older of two ENDPOINTS registries; the live one for the
 // appraisal vertical is in lib/apiClient.ts, and that is the only one the
 // facade-backed screens import. The blocks that used to sit below —
 // `performanceReviews`, `team`, `appraisal` and `performanceManagement` —
 // were removed because every one of them had zero consumers and every route
 // they named is now gone from the backend:
 //   - /performance-reviews and the generic CRUD controllers were dropped in
 //     favour of the single facade controller.
 //   - /appraisal/criteria was the hardcoded single-form endpoint that
 //     multi-form + assignment replaced (see lib/apiClient.ts ENDPOINTS.appraisal).
 //   - /team/members is superseded by /appraisal/my-team.
 //   - /performance/questions|daily-evaluations|reports/* backed the daily/
 //     weekly/monthly evaluation system this 3-role flow replaces; their
 //     routes were removed from AppRouter at the same time.
 //
 // Keeping them here was actively harmful rather than merely untidy: paired
 // with withDemoFallback, a screen pointing at one of these would 404 and
 // then silently render mock data, which is exactly how these endpoints went
 // unnoticed as dead for so long.
} as const;
