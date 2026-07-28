// Minimal session persistence layer.
// The existing authApi calls (login/signUp/etc.) never stored anything —
// they just resolved a promise. This adds the missing piece: remembering
// that a user is logged in across reloads, and exposing helpers the router
// / header / logout button can use.

export type AuthUser = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  avatarUrl?: string;
  // Optional — not returned by every backend yet. Once the NestJS API
  // includes these on the login/profile response, role-based nav/routing
  // (Team Lead / HR Manager / Administrator screens) can key off them.
  employeeId?: string;
  role?: "employee" | "team_lead" | "hr_manager" | "administrator";
};

export type AuthSession = {
  token: string;
  user: AuthUser;
};

const STORAGE_KEY = "hrms.auth.session";

export function getSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token) return null;
    return parsed as AuthSession;
  } catch {
    return null;
  }
}

export function setSession(session: AuthSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}
