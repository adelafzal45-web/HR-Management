import { mockAuthApi, mockProfileApi } from "@/modules/auth/mocks/authMockData";
import { getSession } from "@/utils/auth";

// Central place for API configuration.
// Point this at your NestJS backend once it's deployed / running locally.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api";

// Thrown whenever a request is attempted but the backend can't be reached.
export class BackendUnavailableError extends Error {
  constructor() {
    super("Backend is not connected");
    this.name = "BackendUnavailableError";
  }
}

/**
 * Lightweight reachability check.
 *
 * The live NestJS API (see Swagger — "App" controller) only guarantees a
 * root `GET /api` route; there is no dedicated `/health` endpoint. So we
 * ping the base URL itself. Any response (even a 4xx) means something is
 * listening — we only care whether the backend process is reachable at
 * all, not whether this exact route exists.
 */
export async function checkBackendConnection(timeoutMs = 4000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.status < 500;
  } catch {
    clearTimeout(timer);
    return false;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
};

/**
 * Wrapper around fetch that:
 *  1. Verifies the backend is reachable before doing any real work.
 *  2. Throws BackendUnavailableError if not, so every screen can react the same way.
 */
export async function apiRequest<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const reachable = await checkBackendConnection();
  if (!reachable) {
    throw new BackendUnavailableError();
  }

  const token = getSession()?.token;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token && token !== "demo-token" ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  // The backend process is reachable, but this particular route doesn't
  // exist there yet (e.g. it's only in the DB schema so far, or not built
  // this phase). Treat that the same as "backend unavailable" so callers
  // transparently fall back to demo/schema-shaped mock data instead of
  // surfacing a raw 404 to the user.
  if (res.status === 404) {
    throw new BackendUnavailableError();
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const message = (data && (data.message || data.error)) || `Request failed (${res.status})`;
    throw new Error(Array.isArray(message) ? message.join(", ") : message);
  }

  return data as T;
}

// ---- Auth endpoints (map these to your NestJS controllers) ----
//
// Each call tries the real backend first. If the backend is unreachable
// (BackendUnavailableError), it transparently falls back to hardcoded demo
// data from mockData.ts so the flow still works end-to-end — e.g. for demos,
// design review, or local dev without the API running. Real backend errors
// (wrong password, validation errors, etc.) are NOT swallowed — only the
// "can't reach the backend at all" case triggers the demo fallback.
/**
 * Real NestJS list endpoints don't all agree on a single pagination envelope
 * (`{ data, total }` vs a bare array vs `{ items, count }` vs `{ results,
 * total }` vs a Nest-style `{ data: { rows, count } }`, etc.). Rather than
 * assume one shape and let a mismatch surface as `rows.length` crashing deep
 * inside <DataTable>, normalize whatever comes back into the `{ data, total
 * }` shape the frontend actually consumes.
 */
export function normalizeListResult<T>(raw: unknown, fallbackLength?: number): { data: T[]; total: number } {
  if (Array.isArray(raw)) {
    return { data: raw, total: raw.length };
  }

  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const list = obj.data ?? obj.items ?? obj.results ?? obj.rows ?? obj.records;

    if (Array.isArray(list)) {
      const total = obj.total ?? obj.count ?? obj.totalCount ?? list.length;
      return { data: list as T[], total: typeof total === "number" ? total : list.length };
    }

    // Nest-style nested envelope: { data: { rows, count } }
    if (list && typeof list === "object") {
      const nested = list as Record<string, unknown>;
      const nestedList = nested.rows ?? nested.items ?? nested.data;
      if (Array.isArray(nestedList)) {
        const total = nested.count ?? nested.total ?? nestedList.length;
        return { data: nestedList as T[], total: typeof total === "number" ? total : nestedList.length };
      }
    }
  }

  // Unrecognized shape — degrade to an empty-but-valid result instead of
  // handing the UI `undefined` and crashing it.
  return { data: [], total: fallbackLength ?? 0 };
}

export async function withDemoFallback<T>(real: () => Promise<T>, demo: () => Promise<T>): Promise<T> {
  try {
    return await real();
  } catch (err) {
    if (err instanceof BackendUnavailableError) {
      return demo();
    }
    throw err;
  }
}

export type LoginResult = {
  token: string;
  user: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    jobTitle?: string;
    avatarUrl?: string;
    employeeId?: string;
    role?: "employee" | "team_lead" | "hr_manager" | "administrator";
  };
};

export const authApi = {
  login: (email: string, password: string) =>
    withDemoFallback<LoginResult>(
      () => apiRequest<LoginResult>("/auth/login", { method: "POST", body: { email, password } }),
      () => mockAuthApi.login(email, password),
    ),

  signUp: (payload: { firstName: string; lastName: string; email: string; password: string }) =>
    withDemoFallback(
      () => apiRequest("/auth/register", { method: "POST", body: payload }),
      () => mockAuthApi.signUp(payload),
    ),

  forgetPassword: (email: string) =>
    withDemoFallback(
      () => apiRequest("/auth/forget-password", { method: "POST", body: { email } }),
      () => mockAuthApi.forgetPassword(email),
    ),

  resetPassword: (token: string, password: string, confirmPassword: string) =>
    withDemoFallback(
      () =>
        apiRequest("/auth/reset-password", {
          method: "POST",
          body: { token, password, confirmPassword },
        }),
      () => mockAuthApi.resetPassword(token, password, confirmPassword),
    ),

  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) =>
    withDemoFallback(
      () =>
        apiRequest("/auth/change-password", {
          method: "POST",
          body: { currentPassword, newPassword, confirmPassword },
        }),
      () => mockAuthApi.changePassword(currentPassword, newPassword),
    ),
};

export type ProfileResult = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  avatarUrl?: string;
};

export const profileApi = {
  getProfile: () =>
    withDemoFallback<ProfileResult>(
      () => apiRequest<ProfileResult>("/profile/me"),
      () => mockProfileApi.getProfile(),
    ),

  updateProfile: (payload: {
    firstName: string;
    lastName: string;
    phone?: string;
    jobTitle?: string;
  }) =>
    withDemoFallback<ProfileResult>(
      () => apiRequest<ProfileResult>("/profile/me", { method: "PATCH", body: payload }),
      () => mockProfileApi.updateProfile(payload),
    ),
};
