// ============================================================================
// REAL backend API client.
//
// Talks to the NestJS backend documented at http://localhost:3000/api/docs.
// Every controller is mounted under the global prefix `/api`
// (Backend/src/main.ts -> setGlobalPrefix).
//
// Auth: the backend issues a JWT from `POST /auth/login`. A global
// JwtAuthGuard verifies `Authorization: Bearer <token>` on every request
// except those marked @Public(), and the route-level PermissionGuard resolves
// the caller's role and permissions from the *verified token* — not from a
// header. The old `x-user-id` header is no longer trusted server-side and is
// deliberately not sent.
// ============================================================================

import { API_BASE_URL } from "./apiBaseUrl";

// Re-exported rather than defined here: this module and `api/client.ts` both
// need it, and two copies of the fallback is how one of them ended up pointing
// at the visitor's own machine in production. See `lib/apiBaseUrl.ts`.
export { API_BASE_URL, API_ORIGIN } from "./apiBaseUrl";

export const TOKEN_STORAGE_KEY = "hrms.auth.token";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Skip the Authorization header (only for genuinely public routes). */
  skipAuth?: boolean;
  signal?: AbortSignal;
  /**
   * Don't attempt a token refresh on 401. Set internally on the retry so a
   * request can never loop, and by the auth calls themselves.
   */
  skipRefresh?: boolean;
};

// ============================================================================
// Access-token refresh.
//
// The access token is short-lived (15 min). The refresh token lives in an
// httpOnly cookie the browser attaches to /api/auth/* automatically — it is
// deliberately NOT readable here, which is the whole point: script-injected
// code can't exfiltrate it the way it could read localStorage. Only the access
// token is stored client-side.
// ============================================================================

/**
 * In-flight refresh, shared by every caller.
 *
 * Without this, a screen that fires five parallel requests would, on token
 * expiry, send five refresh calls. Since each refresh rotates the token and
 * revokes the previous one, four of them would present an already-rotated
 * token — which the backend treats as replay and responds to by revoking the
 * whole session. So deduping isn't just an optimisation here; skipping it
 * would log the user out.
 */
let refreshPromise: Promise<string> | null = null;

type AuthFailureListener = () => void;
const authFailureListeners = new Set<AuthFailureListener>();

/**
 * Notified when refreshing fails and the session is genuinely over, so the app
 * can send the user to login. The client doesn't navigate itself — routing is
 * the app's concern, not the transport's.
 */
export function onAuthFailure(listener: AuthFailureListener): () => void {
  authFailureListeners.add(listener);
  return () => {
    authFailureListeners.delete(listener);
  };
}

function notifyAuthFailure() {
  clearToken();
  for (const listener of authFailureListeners) {
    try {
      listener();
    } catch {
      // A broken listener must not take down the request path with it.
    }
  }
}

/**
 * Shape of the non-token fields `/auth/refresh` returns alongside the new
 * access token. Kept loose (not imported from the auth module) to avoid a
 * circular import between this transport layer and `modules/auth/api`.
 */
type SessionRefreshPayload = { user: unknown; permissions: string[] };
type SessionRefreshListener = (payload: SessionRefreshPayload) => void;
const sessionRefreshListeners = new Set<SessionRefreshListener>();

/**
 * Notified whenever a silent access-token refresh succeeds, with the `user`
 * and `permissions` the backend returned alongside the new token.
 *
 * `/auth/refresh` re-reads the caller's role/permissions from the database on
 * every call (see AuthService.refresh) specifically so a grant changed
 * mid-session takes effect at the next refresh. If nothing forwards that
 * payload into app state, the refresh still succeeds but the UI keeps acting
 * on the permission set from login — a revoked permission would still show
 * its buttons/menus, or a newly-granted one would stay hidden, until the user
 * hard-reloads and `/auth/me` re-fetches them.
 */
export function onSessionRefresh(listener: SessionRefreshListener): () => void {
  sessionRefreshListeners.add(listener);
  return () => {
    sessionRefreshListeners.delete(listener);
  };
}

function notifySessionRefresh(payload: SessionRefreshPayload) {
  for (const listener of sessionRefreshListeners) {
    try {
      listener(payload);
    } catch {
      // A broken listener must not take down the request path with it.
    }
  }
}

async function requestNewAccessToken(): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${ENDPOINTS.auth.refresh}`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    throw new ApiError(0, "Cannot reach the backend to refresh the session.");
  }

  if (!res.ok) {
    throw new ApiError(res.status, "Session expired. Please log in again.");
  }

  const data = (await res.json().catch(() => null)) as {
    token?: string;
    user?: unknown;
    permissions?: string[];
  } | null;
  if (!data?.token) {
    throw new ApiError(500, "Refresh response did not include a token.");
  }

  setToken(data.token);

  // Forward the live user/permissions the backend just re-read from the
  // database, so app state (AuthContext) stays in sync instead of coasting
  // on whatever was current at login.
  if (data.user && data.permissions) {
    notifySessionRefresh({ user: data.user, permissions: data.permissions });
  }

  return data.token;
}

/** Refreshes the access token, collapsing concurrent callers onto one request. */
function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = requestNewAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/**
 * Direct call to the real backend. No mock fallback, no demo data, no
 * swallowing of 404s. If the backend is down or the route doesn't exist,
 * the caller gets a real error and must handle it (loading/error UI).
 *
 * On a 401 it transparently refreshes the access token once and replays the
 * request; the user is only sent to login if that refresh also fails.
 */
export async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const token = getToken();
    if (token && !options.skipAuth) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    try {
      return await fetch(`${API_BASE_URL}${path}`, {
        method: options.method ?? "GET",
        headers,
        body:
          options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: options.signal,
        // Sends the httpOnly refresh cookie. Requires the backend to name an
        // explicit CORS origin with credentials: true — a wildcard origin is
        // rejected by the browser for credentialed requests.
        credentials: "include",
      });
    } catch {
      throw new ApiError(
        0,
        "Cannot reach the backend. Is it running at " + API_BASE_URL + "?",
      );
    }
  };

  let res = await send();

  // 401 means the access token expired (or was never valid). Try exactly one
  // refresh, then replay. `skipRefresh` on the replay makes a loop impossible.
  if (res.status === 401 && !options.skipAuth && !options.skipRefresh) {
    try {
      await refreshAccessToken();
      options = { ...options, skipRefresh: true };
      res = await send();
    } catch (refreshError) {
      // The session is genuinely over — surface the original 401 semantics and
      // let the app redirect.
      notifyAuthFailure();
      throw refreshError instanceof ApiError
        ? refreshError
        : new ApiError(401, "Session expired. Please log in again.");
    }
  }

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "message" in (data as any) && (data as any).message) ||
      `Request failed (${res.status})`;
    throw new ApiError(
      res.status,
      Array.isArray(message) ? message.join(", ") : String(message),
      data,
    );
  }

  return data as T;
}

/**
 * Multipart upload against the same auth rules as `apiRequest`.
 *
 * Kept separate rather than folded into `apiRequest` because that path
 * unconditionally sets `Content-Type: application/json` and JSON-stringifies
 * the body — a FormData would arrive as `"[object Object]"`. Here the header is
 * deliberately omitted so the browser can generate the multipart boundary;
 * setting it by hand is the classic cause of "Unexpected end of form" on the
 * server.
 *
 * The 401-refresh-and-replay is duplicated in spirit but not in effect: it
 * reuses the same single-flight `refreshAccessToken`, so a photo upload racing
 * a JSON request still results in exactly one refresh call.
 */
export async function apiUpload<T = unknown>(
  path: string,
  formData: FormData,
  options: { method?: "POST" | "PATCH" | "PUT"; signal?: AbortSignal } = {},
): Promise<T> {
  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      return await fetch(`${API_BASE_URL}${path}`, {
        method: options.method ?? "POST",
        headers,
        body: formData,
        signal: options.signal,
        credentials: "include",
      });
    } catch {
      throw new ApiError(
        0,
        "Cannot reach the backend. Is it running at " + API_BASE_URL + "?",
      );
    }
  };

  let res = await send();

  if (res.status === 401) {
    try {
      await refreshAccessToken();
      res = await send();
    } catch (refreshError) {
      notifyAuthFailure();
      throw refreshError instanceof ApiError
        ? refreshError
        : new ApiError(401, "Session expired. Please log in again.");
    }
  }

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "message" in (data as any) && (data as any).message) ||
      `Upload failed (${res.status})`;
    throw new ApiError(
      res.status,
      Array.isArray(message) ? message.join(", ") : String(message),
      data,
    );
  }

  return data as T;
}

/**
 * Binary GET — for the .xlsx exports.
 *
 * `apiRequest` reads every response with `res.text()`, which would mangle a
 * spreadsheet into a lossy UTF-8 string. This is the same auth and
 * refresh-and-replay path, differing only in reading the body as a Blob.
 *
 * An error response is still JSON, so failures are decoded as text here and
 * raised as a normal `ApiError` — a 403 must not download as a broken file.
 */
export async function apiDownload(
  path: string,
  options: { signal?: AbortSignal; method?: "GET" | "POST"; body?: string } = {},
): Promise<Blob> {
  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    // Only set on POST: a GET with a Content-Type but no body confuses some
    // proxies, and there is nothing to describe.
    if (options.body) headers["Content-Type"] = "application/json";

    try {
      return await fetch(`${API_BASE_URL}${path}`, {
        method: options.method ?? "GET",
        headers,
        body: options.body,
        signal: options.signal,
        credentials: "include",
      });
    } catch {
      throw new ApiError(
        0,
        "Cannot reach the backend. Is it running at " + API_BASE_URL + "?",
      );
    }
  };

  let res = await send();

  if (res.status === 401) {
    try {
      await refreshAccessToken();
      res = await send();
    } catch (refreshError) {
      notifyAuthFailure();
      throw refreshError instanceof ApiError
        ? refreshError
        : new ApiError(401, "Session expired. Please log in again.");
    }
  }

  if (!res.ok) {
    let message = `Export failed (${res.status})`;
    try {
      const text = await res.text();
      const parsed = text ? JSON.parse(text) : null;
      const raw = parsed?.message;
      if (raw) message = Array.isArray(raw) ? raw.join(", ") : String(raw);
    } catch {
      // Non-JSON error body — keep the status-based message.
    }
    throw new ApiError(res.status, message);
  }

  return res.blob();
}

/**
 * Hands a fetched Blob to the browser as a file download.
 *
 * The object URL is revoked on the next tick rather than immediately: Firefox
 * cancels an in-flight download if the URL dies in the same frame as the click.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const api = {
  get: <T = unknown>(path: string, opts?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...opts, method: "GET" }),
  post: <T = unknown>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...opts, method: "POST", body }),
  put: <T = unknown>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...opts, method: "PUT", body }),
  patch: <T = unknown>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...opts, method: "PATCH", body }),
  delete: <T = unknown>(path: string, opts?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...opts, method: "DELETE" }),
};

// ============================================================================
// Centralized endpoint registry — ONLY endpoints that actually exist in the
// backend controllers (verified by reading every *.controller.ts file).
// Do not add a path here unless a controller method implements it.
// ============================================================================
export const ENDPOINTS = {
  auth: {
    login: "/auth/login",
    me: "/auth/me",
    refresh: "/auth/refresh",
    logout: "/auth/logout",
    // Password recovery. Note `forgot`, not `forget` — the frontend used to
    // call /auth/forget-password, which has never existed on this backend.
    forgotPassword: "/auth/forgot-password",
    validateResetToken: "/auth/reset-password/validate",
    resetPassword: "/auth/reset-password",
    changePassword: "/auth/change-password",
  },
  // Employees are exposed as /users — there is no /employees controller.
  // Route order matters on the backend: the literal paths (`assignable-roles`,
  // `team-leads`, `me/*`) are declared before `:id`, so they never collide.
  users: {
    base: "/users",
    byId: (id: string) => `/users/${id}`,
    assignableRoles: "/users/assignable-roles",
    teamLeads: "/users/team-leads",
    team: (id: string) => `/users/${id}/team`,
    leaveBalances: (id: string) => `/users/${id}/leave-balances`,
    accountSettings: (id: string) => `/users/${id}/account-settings`,
    leaveTypes: (id: string) => `/users/${id}/leave-types`,
    resetPassword: (id: string) => `/users/${id}/reset-password`,
    // Admin-issued reset links. Declared on PasswordResetAdminController, which
    // lives in AuthModule but mounts under /users to keep the employee-admin
    // surface in one place; the literal `password-reset-links` is registered
    // before `:id`, so it is never captured as a user id.
    passwordResetLinks: "/users/password-reset-links",
    passwordResetLinkHistory: (id: string) => `/users/${id}/password-reset-links`,
    photo: (id: string) => `/users/${id}/photo`,
    documents: (id: string) => `/users/${id}/documents`,
    documentById: (id: string, docId: string) => `/users/${id}/documents/${docId}`,
    documentsExport: "/users/documents/export",
    me: {
      profile: "/users/me/profile",
      leaveBalances: "/users/me/leave-balances",
      team: "/users/me/team",
      changePassword: "/users/me/change-password",
      photo: "/users/me/photo",
    },
  },
  roles: { base: "/roles", byId: (id: string) => `/roles/${id}` },
  permissions: { base: "/permissions", byId: (id: string) => `/permissions/${id}` },
  rolePermissions: { base: "/role-permissions", byId: (id: string) => `/role-permissions/${id}` },
  departments: { base: "/departments", byId: (id: string) => `/departments/${id}` },
  designations: { base: "/designations", byId: (id: string) => `/designations/${id}` },
  jobCategories: { base: "/job-categories", byId: (id: string) => `/job-categories/${id}` },
  shifts: { base: "/shifts", byId: (id: string) => `/shifts/${id}` },
  attendance: {
    base: "/attendance",
    byId: (id: string) => `/attendance/${id}`,
    // Working-day flags per calendar day, so reports can shade non-working
    // days instead of reimplementing the fallback ladder client-side.
    workingDayCalendar: "/attendance/working-day-calendar",
    // Self-service. The server takes the employee from the JWT, stamps its own
    // clock and decides Late from the assigned shift — none of which the
    // browser is allowed to supply. Declared before `:id` on the controller,
    // so `me/today` is never parsed as an attendance id.
    me: {
      today: "/attendance/me/today",
      history: "/attendance/me",
      checkIn: "/attendance/check-in",
      checkOut: "/attendance/check-out",
    },
  },
  leaveRequests: { base: "/leave-requests", byId: (id: string) => `/leave-requests/${id}` },
  // Legacy flat payroll (basic/allowance/bonus/deduction/tax/net per month).
  // Kept read-only for history; superseded by `payrollEngine` below.
  payroll: { base: "/payroll", byId: (id: string) => `/payroll/${id}` },

  // The flexible payroll engine (spec: Payroll Rule Builder + Config Center).
  // Every path verified against a controller under Backend/src/{payroll-settings,
  // salary-components,salary-structures,payroll-periods,payslips}. Route order
  // matters server-side: literal segments (`variables`, `test-formula`,
  // `preview`, `me`) are declared before `:id`, so they never collide.
  payrollEngine: {
    // Single global row — no :id, the backend pins it. GET + PATCH only.
    settings: "/payroll-settings",

    components: {
      base: "/salary-components",
      byId: (id: string) => `/salary-components/${id}`,
      // The whitelisted formula variables the builder may reference.
      variables: "/salary-components/variables",
      // Evaluate a formula against sample values — the "Test Rule" feature.
      testFormula: "/salary-components/test-formula",
    },

    structures: {
      base: "/salary-structures",
      byId: (id: string) => `/salary-structures/${id}`,
      // Component memberships nested under a structure.
      components: (id: string) => `/salary-structures/${id}/components`,
      component: (id: string, structureComponentId: string) =>
        `/salary-structures/${id}/components/${structureComponentId}`,
    },

    // Scope-priority assignments (company/department/designation/…/employee).
    // Listed with an optional ?structureId filter.
    assignments: {
      base: "/salary-structure-assignments",
      byId: (id: string) => `/salary-structure-assignments/${id}`,
    },

    // Per-employee component overrides. Listed with an optional ?userId filter.
    overrides: {
      base: "/employee-component-overrides",
      byId: (id: string) => `/employee-component-overrides/${id}`,
    },

    periods: {
      base: "/payroll-periods",
      byId: (id: string) => `/payroll-periods/${id}`,
      // The "Activate Payroll" readiness checklist. Declared before `:id`
      // server-side so `setup-status` is never read as a period id.
      setupStatus: "/payroll-periods/setup-status",
      // One-click setup: `quickSetupPreview` is a dry run (writes nothing) that
      // returns a create/skip line per item; `quickSetup` commits the missing
      // ones in a single transaction and is idempotent.
      quickSetupPreview: "/payroll-periods/quick-setup/preview",
      quickSetup: "/payroll-periods/quick-setup",
      // The run workflow: process (generate payslips) → approve (Admin) → lock.
      process: (id: string) => `/payroll-periods/${id}/process`,
      approve: (id: string) => `/payroll-periods/${id}/approve`,
      lock: (id: string) => `/payroll-periods/${id}/lock`,
    },

    payslips: {
      base: "/payslips",
      byId: (id: string) => `/payslips/${id}`,
      // Compute a payslip without persisting it (with a per-line "Why?").
      preview: "/payslips/preview",
      // The period payroll register + roll-ups (read-only aggregate). Declared
      // before `:id` server-side so `report` is never read as a payslip id.
      report: "/payslips/report",
      // The same register as a real .xlsx, built server-side from the report
      // data. Declared before `:id` server-side too.
      export: "/payslips/export",
      // Token-scoped self-service — resolves the employee from the JWT, no
      // payroll permission required (the same pattern as `/attendance/me`).
      me: "/payslips/me",
      meById: (id: string) => `/payslips/me/${id}`,
    },

    // ---- Phase 2 rule builders (spec §4–10, §16) --------------------------

    // Versioned rule builder: absence/late/repeated-late/leave/overtime/bonus.
    // `versions` walks the supersede chain oldest → newest (§16). Listed with
    // optional ?rule_type= and ?includeInactive= filters.
    rules: {
      base: "/payroll-rules",
      byId: (id: string) => `/payroll-rules/${id}`,
      versions: (id: string) => `/payroll-rules/${id}/versions`,
    },

    // Income-tax configs + progressive slabs; `preview` runs a sample annual
    // income through a config's slabs (gated by payroll.preview, like the
    // formula test) without touching a payslip.
    tax: {
      base: "/payroll-tax",
      byId: (id: string) => `/payroll-tax/${id}`,
      preview: "/payroll-tax/preview",
    },

    // Employee loans / salary advances. `schedule` (re)generates the
    // installment ladder from principal / installment amount. Listed with
    // optional ?userId= and ?status= filters.
    loans: {
      base: "/payroll-loans",
      byId: (id: string) => `/payroll-loans/${id}`,
      schedule: (id: string) => `/payroll-loans/${id}/schedule`,
      // Employee self-service (Phase 3): apply for an advance and track it.
      // Token-scoped and ungated — an employee never holds `payroll-loans.*`.
      me: "/payroll-loans/me",
      meById: (id: string) => `/payroll-loans/me/${id}`,
      // HR/Admin decision on a pending request (`payroll-loans.approve`).
      // Approving sets the real installment and generates the schedule.
      approve: (id: string) => `/payroll-loans/${id}/approve`,
      reject: (id: string) => `/payroll-loans/${id}/reject`,
    },

    // ---- Phase 3 expense claims -------------------------------------------

    // Reimbursements: an employee claims an out-of-pocket expense back, HR
    // approves, and the next payroll run pays it as a non-taxable earning.
    // The org-wide routes are permission-gated; the `me` routes are not — they
    // resolve the employee from the JWT, same as `/payslips/me`.
    reimbursements: {
      base: "/reimbursements",
      byId: (id: string) => `/reimbursements/${id}`,
      approve: (id: string) => `/reimbursements/${id}/approve`,
      reject: (id: string) => `/reimbursements/${id}/reject`,
      me: "/reimbursements/me",
      meById: (id: string) => `/reimbursements/me/${id}`,
    },
  },
  // Role-scoped dashboard aggregates. One request per dashboard instead of
  // stitching five list calls together in the browser — and, more importantly,
  // the only way an Employee can get figures like "working days so far this
  // month", which need the working-week ladder and the holiday calendar that
  // `working-days.view` gates. `me` is token-scoped and ungated; `team` narrows
  // to the caller's roster server-side; `admin` needs `employees.view`.
  dashboard: {
    me: "/dashboard/me",
    team: "/dashboard/team",
    admin: "/dashboard/admin",
  },

  notifications: {
    base: "/notifications",
    byId: (id: string) => `/notifications/${id}`,
    // The signed-in user's own bell. `base` is the *sender's* view and is
    // gated on `notifications.view` (HR/Admin only), so an ordinary employee
    // reading from it gets a 403 — `me` is the route their bell must use.
    me: "/notifications/me",
    markRead: (id: string) => `/notifications/me/${id}/read`,
    markAllRead: "/notifications/me/read-all",
  },

  // Company details + branding. Single global row, so no :id — the backend
  // pins it to id = 1. `branding` is @Public(): the login screen renders the
  // logo and themes from primary_color before any token exists.
  companySettings: { base: "/company-settings", branding: "/company-settings/branding" },

  leaveTypes: { base: "/leave-types", byId: (id: string) => `/leave-types/${id}` },

  // Global default + per-department/designation overrides. `resolve` applies
  // the designation -> department -> global fallback and reports which tier won.
  workingDays: {
    base: "/working-days",
    scope: "/working-days/scope",
    resolve: "/working-days/resolve",
  },

  // The appraisal workflow — one facade controller, three roles.
  appraisal: {
    forms: "/appraisal/forms",
    formsExportExcel: "/appraisal/forms/export/excel",
    form: (id: string) => `/appraisal/forms/${id}`,
    formQuestions: (id: string) => `/appraisal/forms/${id}/questions`,
    publishForm: (id: string) => `/appraisal/forms/${id}/publish`,
    formStatus: (id: string) => `/appraisal/forms/${id}/status`,
    duplicateForm: (id: string) => `/appraisal/forms/${id}/duplicate`,
    formVersions: (id: string) => `/appraisal/forms/${id}/versions`,
    formAssignments: (id: string) => `/appraisal/forms/${id}/assignments`,
    assignment: (id: string) => `/appraisal/assignments/${id}`,
    myTeam: "/appraisal/my-team",
    teamStats: "/appraisal/my-team/stats",
    evaluate: (employeeId: string) => `/appraisal/evaluate/${employeeId}`,
    myEvaluations: "/appraisal/my-evaluations",
    allEvaluations: "/appraisal/evaluations",
    // One employee's history/breakdown/trend. Same shape as `myEvaluations`,
    // but HR-scoped, so the Statistics tab can be aimed at anyone the caller
    // is allowed to see rather than only the JWT's own employee.
    employeeEvaluations: (id: string) => `/appraisal/employees/${id}/evaluations`,
    analytics: "/appraisal/analytics",

    // The reusable question bank. Distinct from `formQuestions` above: those
    // are a form's link rows, these are the shared question records.
    questions: "/appraisal/questions",
    question: (id: string) => `/appraisal/questions/${id}`,
    questionUsage: (id: string) => `/appraisal/questions/${id}/usage`,

    // Team Lead roster grants — HR-only.
    teamLeadAssignments: "/appraisal/team-lead-assignments",
    teamLeadAssignment: (id: string) => `/appraisal/team-lead-assignments/${id}`,
    teamLeadAssignmentMembers: (id: string) =>
      `/appraisal/team-lead-assignments/${id}/members`,

    // Submit -> approve/reject/reopen.
    approveReview: (id: string) => `/appraisal/reviews/${id}/approve`,
    rejectReview: (id: string) => `/appraisal/reviews/${id}/reject`,
    reopenReview: (id: string) => `/appraisal/reviews/${id}/reopen`,
    reviewApprovals: (id: string) => `/appraisal/reviews/${id}/approvals`,
    reviewDetail: (id: string) => `/appraisal/reviews/${id}/detail`,

    // Filtered reporting. `stats`/`results`/`compare` all take the same filter
    // query, so an export always covers exactly what is on screen.
    stats: "/appraisal/stats",
    statsExportExcel: "/appraisal/stats/export/excel",
    results: "/appraisal/results",
    compare: "/appraisal/compare",
    compareExportExcel: "/appraisal/compare/export/excel",

    notifications: "/appraisal/notifications",
    notificationRead: (id: string) => `/appraisal/notifications/${id}/read`,

    teamLeadDashboard: "/appraisal/dashboard/team-lead",
    employeeDashboard: "/appraisal/dashboard/employee",
  },

  // Transactional mail. Single global SMTP row (no :id, same pattern as
  // company-settings), 11 templates addressed by their stable `template_key`
  // rather than by uuid, and the outbound queue.
  smtpSettings: {
    base: "/smtp-settings",
    status: "/smtp-settings/status",
    test: "/smtp-settings/test",
  },
  // `placeholders` is declared before `:key` on the controller, so it is never
  // captured as a template key. Keep that order in mind if adding literals here.
  emailTemplates: {
    base: "/email-templates",
    placeholders: "/email-templates/placeholders",
    byKey: (key: string) => `/email-templates/${key}`,
    versions: (key: string) => `/email-templates/${key}/versions`,
    preview: (key: string) => `/email-templates/${key}/preview`,
    restore: (key: string) => `/email-templates/${key}/restore`,
    reset: (key: string) => `/email-templates/${key}/reset`,
  },
  emailQueue: {
    base: "/email-queue",
    stats: "/email-queue/stats",
    byId: (id: string) => `/email-queue/${id}`,
    retry: (id: string) => `/email-queue/${id}/retry`,
    cancel: (id: string) => `/email-queue/${id}/cancel`,
  },
} as const;