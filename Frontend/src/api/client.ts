import { mockAuthApi } from "@/modules/auth/mocks/authMockData";
import { apiRequest as sharedApiRequest, ApiError } from "@/lib/apiClient";

// Central place for API configuration.
// Point this at your NestJS backend once it's deployed / running locally.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api";

// Thrown whenever a request is attempted but the backend can't be reached
// AT ALL (network failure / DNS / connection refused). Distinct from a real
// 404 (route genuinely doesn't exist) or 401/403 (auth/permission denied) —
// those are real backend responses and must NOT be swallowed into fake data.
export class BackendUnavailableError extends Error {
  constructor() {
    super("Backend is not connected");
    this.name = "BackendUnavailableError";
  }
}

// Thrown for a genuine HTTP 404 — the backend is reachable but this exact
// route doesn't exist there (e.g. /settings/company, /leave-types — see
// BACKEND_GAPS.md). Screens should catch this and render a
// "Backend Not Implemented" state instead of silently mocking data.
export class BackendNotImplementedError extends Error {
  constructor(path: string) {
    super(`Backend has no implementation for ${path} (404). See BACKEND_GAPS.md.`);
    this.name = "BackendNotImplementedError";
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
 * Wrapper around the shared apiClient transport that:
 * 1. Verifies the backend is reachable before doing any real work.
 * 2. Throws BackendUnavailableError if not, so every screen can react the same way.
 * 3. Surfaces real 404s as BackendNotImplementedError instead of pretending
 *    the whole backend is down — callers/screens decide how to render that.
 *
 * Transport (bearer header, `credentials: 'include'` for the refresh cookie,
 * and the single-flight 401 refresh-and-retry) is delegated to
 * `lib/apiClient`. Duplicating the refresh logic here would mean two
 * independent single-flight guards, which defeats the point: requests from
 * this client and that one could each rotate the refresh token concurrently
 * and trip the backend's replay detection, logging the user out.
 */
export async function apiRequest<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const reachable = await checkBackendConnection();
  if (!reachable) {
    throw new BackendUnavailableError();
  }

  try {
    return await sharedApiRequest<T>(path, {
      method: options.method ?? "GET",
      body: options.body,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 404) {
        throw new BackendNotImplementedError(path);
      }
      // Preserve this module's contract: plain Error with the server message.
      throw new Error(err.message);
    }
    throw err;
  }
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
 /** 128px derivative of `avatarUrl`, used for the navbar avatar. */
 avatarThumbUrl?: string;
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

 // `forgetPassword`, `resetPassword` and `changePassword` used to live here and
 // have been removed rather than left unused. Every call in this module is
 // wrapped in `withDemoFallback`, which answers from the mock store when the
 // real request fails — and all three pointed at routes that do not exist
 // (`/auth/forget-password` was never a route at all; change-password lives at
 // `/users/me/change-password` and takes snake_case). The result was a UI that
 // reported a password had changed when nothing had happened server-side, which
 // the user only discovers at their next login.
 //
 // The replacements throw instead of falling back:
 //   forgot / validate / reset -> passwordApi in @/modules/auth/api
 //   change own password       -> myProfileService.changePassword
};

// `profileApi` (getProfile / updateProfile) and its `ProfileResult` type have
// been removed: the demo-fallback client never got the `me` routes right (this
// module pointed at /profile/me, which does not exist) and its self-edit
// payload — first/last name, job title — is exactly the HR-controlled data the
// backend rejects. The real profile pages call `profileService` /
// `myProfileService` in @/modules/employees/api/employeeService instead, which
// use the actual /users/me/* routes with snake_case bodies and no mock
// fallback. `mockProfileApi` in @/modules/auth/mocks/authMockData went with
// it, along with the three password mocks in `mockAuthApi`.
