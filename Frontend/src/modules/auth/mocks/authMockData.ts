// Hardcoded/demo data used ONLY when the real backend can't be reached.
// This lets the whole auth flow (login, sign up, forgot/reset password) be
// clicked through end-to-end for demos, design reviews, or offline dev —
// instead of just showing a "backend unavailable" dead end.

import { getSession } from "@/utils/auth";

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

  async forgetPassword(email: string) {
    await delay();
    return {
      message: `If an account exists for ${email}, a reset link has been sent. (Demo mode — no email is actually sent.)`,
      demo: true,
    };
  },

  async resetPassword(_token: string, _password: string, _confirmPassword: string) {
    await delay();
    return { message: "Password reset in demo mode.", demo: true };
  },

  async changePassword(currentPassword: string, newPassword: string) {
    await delay();
    const session = getSession();
    const email = session?.user.email ?? DEMO_CREDENTIALS.email;
    const user = demoUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user || user.password !== currentPassword) {
      throw new Error("Current password is incorrect. (Demo mode)");
    }
    user.password = newPassword;
    return { message: "Password updated in demo mode.", demo: true };
  },
};

export const mockProfileApi = {
  async getProfile() {
    await delay(300);
    const session = getSession();
    const email = session?.user.email ?? DEMO_CREDENTIALS.email;
    const user = demoUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) throw new Error("Profile not found. (Demo mode)");
    return {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone ?? "",
      jobTitle: user.jobTitle ?? "",
      avatarUrl: user.avatarUrl,
      demo: true,
    };
  },

  async updateProfile(payload: {
    firstName: string;
    lastName: string;
    phone?: string;
    jobTitle?: string;
  }) {
    await delay();
    const session = getSession();
    const email = session?.user.email ?? DEMO_CREDENTIALS.email;
    const user = demoUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) throw new Error("Profile not found. (Demo mode)");
    user.firstName = payload.firstName;
    user.lastName = payload.lastName;
    user.phone = payload.phone;
    user.jobTitle = payload.jobTitle;
    return {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone ?? "",
      jobTitle: user.jobTitle ?? "",
      avatarUrl: user.avatarUrl,
      demo: true,
    };
  },
};
