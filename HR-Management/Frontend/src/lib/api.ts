import { mockAuthApi } from "./mockData";

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
 * Hits GET {API_BASE_URL}/health with a short timeout.
 * Returns true only if the backend responds (any 2xx-4xx status counts as "reachable" —
 * we only care whether *something* is listening, not whether this exact route exists yet).
 */
export async function checkBackendConnection(timeoutMs = 4000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}/health`, {
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

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

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
async function withDemoFallback<T>(real: () => Promise<T>, demo: () => Promise<T>): Promise<T> {
  try {
    return await real();
  } catch (err) {
    if (err instanceof BackendUnavailableError) {
      return demo();
    }
    throw err;
  }
}

export const authApi = {
  login: (email: string, password: string) =>
    withDemoFallback(
      () => apiRequest("/auth/login", { method: "POST", body: { email, password } }),
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
};
