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
 // HR/Admin marks many employees (or a whole department / all active) for a
 // single day in one request.
 bulkMark: "/attendance/bulk-mark",
 // Self-service. The server takes the employee from the JWT, stamps its
 // own clock, decides Late from the assigned shift's start time and grace
 // period, and derives the hours — none of which the browser may supply.
 // `base` and `byId` are the HR correction path and need attendance.view /
 // .update; these four need only a valid token, which is why the Employee
 // role (which holds no attendance permissions) can use them.
 me: {
 today: "/attendance/me/today",
 history: "/attendance/me",
 checkIn: "/attendance/check-in",
 checkOut: "/attendance/check-out",
 },
 },

 leaveRequests: {
 base: "/leave-requests",
 byId: (id: string) => `/leave-requests/${id}`,
 // Token-scoped self-service. `base` is org-wide and gated on
 // leave-request.view/.create, which the Employee role does not hold — these
 // two need only a valid JWT and resolve the employee from the token.
 me: "/leave-requests/me",
 },

 // Meeting scheduling and invitations. POST resolves the invitee list from the
 // chosen audience (specific people / a department / everyone); email and
 // in-app delivery each follow the meeting's own notify_email / notify_in_app
 // flag, so an unchecked box means nothing is queued on that channel.
 meetings: {
 base: "/meetings",
 byId: (id: string) => `/meetings/${id}`,
 cancel: (id: string) => `/meetings/${id}/cancel`,
 // Token-scoped self-service. `base` is org-wide and gated on meeting.view,
 // which the Employee role does not hold — this one needs only a valid JWT
 // and returns the meetings the caller organizes or was invited to.
 me: "/meetings/me",
 },

 // Admin/HR "Employee Leave Management" report: one row per (employee,
 // leave type) with entitlement/used/remaining/pending.
 leaveEntitlements: {
 base: "/leave-entitlements",
 balances: "/leave-entitlements/balances",
 preview: "/leave-entitlements/preview",
 adjust: (id: string) => `/leave-entitlements/${id}/adjust`,
 history: "/leave-entitlements/history",
 // Token-scoped self-service. `balances` and `history` above are the org-wide
 // reports and need leave-entitlement.view / leave-history.view, which the
 // Employee role does not hold — these two need only a valid JWT and resolve
 // the employee from the token.
 me: {
 balances: "/leave-entitlements/me/balances",
 history: "/leave-entitlements/me/history",
 },
 },

 // Public Holidays calendar — company-wide or department-scoped, optionally
 // recurring yearly. Live CRUD at /holidays (GET returns a plain array with
 // the department relation joined; POST/PATCH enforce duplicate prevention
 // via a 409 ConflictException).
 holidays: {
 base: "/holidays",
 byId: (id: string) => `/holidays/${id}`,
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

 // `base` is the sender's view: one entry per notification sent, with the
 // audience and the recipient/read counts. It is gated on `notifications.view`
 // (HR/Admin), so the bell reads `me` instead — that route is open to every
 // authenticated user and returns only what was addressed to them.
 notifications: {
 base: "/notifications",
 byId: (id: string) => `/notifications/${id}`,
 me: "/notifications/me",
 markRead: (id: string) => `/notifications/me/${id}/read`,
 markAllRead: "/notifications/me/read-all",
 // Staged before the send, not with it: the file is validated and stored
 // first, and the JSON create then references the URL it returned. Keeps
 // `create` a plain JSON contract and means a rejected file is reported
 // before the sender has committed to an audience.
 attachment: "/notifications/attachment",
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
