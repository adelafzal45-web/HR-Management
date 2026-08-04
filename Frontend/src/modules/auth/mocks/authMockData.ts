// Hardcoded/demo data used ONLY when the real backend can't be reached.
// This lets login and sign up be clicked through end-to-end for demos, design
// reviews, or offline dev — instead of just showing a "backend unavailable"
// dead end. Password recovery is deliberately NOT mocked: see the note at the
// bottom of `mockAuthApi`.

export type DemoUser = {
 firstName: string;
 lastName: string;
 email: string;
 password: string;
 phone?: string;
 jobTitle?: string;
 avatarUrl?: string;
 // Drives role-based nav/routing (Sidebar, ProtectedRoute `roles`) — real
 // backend should return the same field on /auth/login and /profile/me.
 employeeId?: string;
 role?: "employee" | "team_lead" | "hr_manager" | "administrator";
};

export const DEMO_CREDENTIALS = {
 email: "demo@technocues.com",
 password: "Demo@1234",
};

// Seeded with one known-good account; sign-ups made while offline are added
// here too, so you can immediately log back in with them in the same tab.
// This demo account is a Team Lead (EMP-1042) so both the Phase 1
// self-service screens AND the Phase 2 Team Lead workspace
// (My Team / Team Attendance / Team Leaves / Appraisal Criteria /
// Evaluate / Team Reports) are reachable in demo mode without a backend.
const demoUsers: DemoUser[] = [
 {
 firstName: "Demo",
 lastName: "User",
 email: DEMO_CREDENTIALS.email,
 password: DEMO_CREDENTIALS.password,
 phone: "+92 300 1234567",
 jobTitle: "Team Lead — Engineering",
 employeeId: "EMP-1042",
 role: "team_lead",
 },
 {
 firstName: "Ayesha",
 lastName: "Khan",
 email: "admin@technocues.com",
 password: "Admin@1234",
 phone: "+92 300 7654321",
 jobTitle: "HR Administrator",
 employeeId: "EMP-1001",
 // Phase 2 — HR Manager / Administrator workspace: Settings
 // (Company Details / Departments / Designations / Roles / Permissions
 // / Branding). Use this account in demo mode to reach it.
 role: "administrator",
 },
];

const delay = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockAuthApi = {
 async login(email: string, password: string) {
 await delay();
 const user = demoUsers.find(
 (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password,
 );
 if (!user) {
 throw new Error(
 `Invalid email or password. (Demo mode — try ${DEMO_CREDENTIALS.email} / ${DEMO_CREDENTIALS.password})`,
 );
 }
 return {
 token: "demo-token",
 user: {
 firstName: user.firstName,
 lastName: user.lastName,
 email: user.email,
 phone: user.phone,
 jobTitle: user.jobTitle,
 avatarUrl: user.avatarUrl,
 employeeId: user.employeeId,
 role: user.role,
 },
 demo: true,
 };
 },

 async signUp(payload: { firstName: string; lastName: string; email: string; password: string }) {
 await delay();
 if (demoUsers.some((u) => u.email.toLowerCase() === payload.email.toLowerCase())) {
 throw new Error("An account with that email already exists. (Demo mode)");
 }
 // New sign-ups default to the "employee" role — they won't see the Team
 // Lead workspace unless a real backend later assigns them one.
 demoUsers.push({ ...payload, role: "employee" });
 return { message: "Account created in demo mode.", demo: true };
 },

 // No password mocks here on purpose. `forgetPassword`, `resetPassword` and
 // `changePassword` used to sit below and were reached through
 // `withDemoFallback` in api/client.ts, so an unreachable backend answered
 // "Password reset in demo mode" and the screen reported success while the
 // real password was untouched. The live flows are in
 // modules/auth/api/passwordApi.ts and throw instead — a failed password
 // operation must look like a failure.
};

// `mockProfileApi` (getProfile / updateProfile) has been removed with the
// `profileApi` that was its only caller. It answered a demo profile shaped
// around first/last name and job title — the HR-controlled fields the real
// `PATCH /users/me/profile` rejects — so it described a self-edit the product
// does not allow. The profile pages read `/users/me/*` directly through
// modules/employees/api/employeeService.
