// Dev-only "skip login" helper.
//
// The real backend isn't wired up for auth yet, so typing demo credentials
// on every reload while testing the Departments / Designations / Job
// Categories / Shifts CRUD screens gets old fast. This exposes one-click
// "Continue as ..." buttons on the Login page — ONLY when running the Vite
// dev server (`import.meta.env.DEV`). They are compiled out of production
// builds entirely (`vite build`), so there's nothing to remember to remove
// once the real backend + login are ready — just delete this file and its
// two call sites in Login.tsx whenever that day comes.
//
// Administrator is the account that matters for this task: Settings →
// Departments/Designations/Job Categories/Shifts are all gated to
// ["hr_manager", "administrator"] in App.tsx.

import type { AuthSession } from "./auth";

export const DEV_LOGIN_ACCOUNTS: { label: string; session: AuthSession }[] = [
  {
    label: "Continue as Administrator",
    session: {
      token: "demo-token",
      user: {
        firstName: "Ayesha",
        lastName: "Khan",
        email: "admin@technocues.com",
        phone: "+92 300 7654321",
        jobTitle: "HR Administrator",
        employeeId: "EMP-1001",
        role: "administrator",
      },
    },
  },
  {
    label: "Continue as Team Lead",
    session: {
      token: "demo-token",
      user: {
        firstName: "Demo",
        lastName: "User",
        email: "demo@technocues.com",
        phone: "+92 300 1234567",
        jobTitle: "Team Lead — Engineering",
        employeeId: "EMP-1042",
        role: "team_lead",
      },
    },
  },
];
