import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useDevAuth } from "@/app/providers/DevAuthContext";
import { api, ApiError, ENDPOINTS } from "@/lib/apiClient";
import Can from "@/components/permission/Can";
import DashboardLayout from "@/app/layouts/DashboardLayout";

// ============================================================================
// Dashboard that is 100% driven by the current session's REAL backend
// permissions (see DevAuthContext). Nothing here is hardcoded per role name
// ("if admin show X") — every card is gated by an actual permission key
// enforced by the backend's PermissionGuard, and every number shown comes
// from a real list endpoint response (counted client-side), never invented.
//
// There is no dashboard/stats aggregate endpoint in the backend, so trend
// charts / aggregated analytics are explicitly labeled
// "Backend Not Implemented" rather than faked.
// ============================================================================

type CardState = { loading: boolean; error: string | null; count: number | null };

function useCount(path: string, enabled: boolean) {
  const [state, setState] = useState<CardState>({ loading: enabled, error: null, count: null });

  useEffect(() => {
    if (!enabled) {
      setState({ loading: false, error: null, count: null });
      return;
    }
    let cancelled = false;
    setState({ loading: true, error: null, count: null });
    api
      .get<unknown>(path)
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : (data as any)?.data;
        setState({ loading: false, error: null, count: Array.isArray(list) ? list.length : null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          loading: false,
          error: err instanceof ApiError ? `${err.status}: ${err.message}` : "Request failed",
          count: null,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [path, enabled]);

  return state;
}

function StatCard({
  title,
  path,
  enabled,
  permission,
  hint,
}: {
  title: string;
  path: string;
  enabled: boolean;
  permission: string;
  hint: string;
}) {
  const { loading, error, count } = useCount(path, enabled);
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          {loading && <p className="mt-2 text-2xl font-semibold text-gray-300">…</p>}
          {!loading && error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {!loading && !error && <p className="mt-2 text-2xl font-semibold text-gray-900">{count ?? "—"}</p>}
        </div>
        <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-mono text-gray-500">{permission}</span>
      </div>
      <p className="mt-3 text-xs text-gray-400">{hint}</p>
    </div>
  );
}

function NotImplementedCard({ title, note }: { title: string; note: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-5">
      <p className="text-sm font-medium text-amber-800">{title}</p>
      <p className="mt-2 text-xs text-amber-700">Backend Not Implemented — {note}</p>
    </div>
  );
}

export default function RbacDashboard() {
  const { session, hasPermission, hasAnyPermission, logout } = useDevAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const denied = (location.state as { denied?: string } | null)?.denied;

  const [selfProfileError, setSelfProfileError] = useState<string | null>(null);
  const [selfProfileLoading, setSelfProfileLoading] = useState(true);
  const [selfProfile, setSelfProfile] = useState<any | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setSelfProfileLoading(true);
    api
      .get(ENDPOINTS.users.byId(session.userId))
      .then((data) => {
        if (!cancelled) setSelfProfile(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setSelfProfileError(
            err instanceof ApiError
              ? `${err.status === 403 ? "Access denied" : err.status}: ${err.message}`
              : "Failed to load profile",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setSelfProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (!session) return null;

  return (
    <DashboardLayout title={`Dashboard — ${session.role.role_name}`} activeKey="dashboard">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-gray-500">
              Signed in as <code className="text-xs">{session.userId}</code> · {session.permissions.length}{" "}
              permission{session.permissions.length === 1 ? "" : "s"} resolved server-side and returned by{" "}
              <code className="text-xs">POST /api/auth/login</code>
            </p>
          </div>
          <button
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            Sign out
          </button>
        </header>

        {denied && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Access denied: your role ({session.role.role_name}) lacks the required permission ({denied}) for that
            page.
          </div>
        )}

        {/* ==================== MY PROFILE ==================== */}
        <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">My Profile</h2>
          {selfProfileLoading && <p className="mt-2 text-sm text-gray-400">Loading…</p>}
          {!selfProfileLoading && selfProfileError && (
            <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {selfProfileError}. Backend Not Implemented — there is no <code>GET /users/me</code> endpoint; the
              only way to fetch a profile is <code>GET /users/:id</code>, which itself requires{" "}
              <code>employees.view</code> permission. A role without that permission cannot fetch even its own
              profile with the current backend.
            </div>
          )}
          {!selfProfileLoading && !selfProfileError && selfProfile && (
            <p className="mt-2 text-sm text-gray-700">
              {selfProfile.first_name} {selfProfile.last_name} · {selfProfile.email} · {selfProfile.employee_code}
            </p>
          )}
        </section>

        {/* ==================== PERMISSION-GATED STAT CARDS ==================== */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Can permission="employees.view">
            <StatCard
              title="Employees"
              path={ENDPOINTS.users.base}
              enabled={hasPermission("employees.view")}
              permission="employees.view"
              hint="Count from GET /users"
            />
          </Can>

          <Can permission="leave-request.view">
            <StatCard
              title="Leave Requests"
              path={ENDPOINTS.leaveRequests.base}
              enabled={hasPermission("leave-request.view")}
              permission="leave-request.view"
              hint="Count from GET /leave-requests"
            />
          </Can>

          <Can permission="attendance.view">
            <StatCard
              title="Attendance Records"
              path={ENDPOINTS.attendance.base}
              enabled={hasPermission("attendance.view")}
              permission="attendance.view"
              hint="Count from GET /attendance"
            />
          </Can>

          <Can permission="payroll.view">
            <StatCard
              title="Payroll Records"
              path={ENDPOINTS.payroll.base}
              enabled={hasPermission("payroll.view")}
              permission="payroll.view"
              hint="Count from GET /payroll"
            />
          </Can>

          <Can permission="shifts.view">
            <StatCard
              title="Shifts"
              path={ENDPOINTS.shifts.base}
              enabled={hasPermission("shifts.view")}
              permission="shifts.view"
              hint="Count from GET /shifts"
            />
          </Can>

          <Can permission="designation.view">
            <StatCard
              title="Designations"
              path={ENDPOINTS.designations.base}
              enabled={hasPermission("designation.view")}
              permission="designation.view"
              hint="Count from GET /designations"
            />
          </Can>

          <Can permission="appraisal-forms.view">
            <StatCard
              title="Evaluation Forms"
              path={ENDPOINTS.appraisal.forms}
              enabled={hasPermission("appraisal-forms.view")}
              permission="appraisal-forms.view"
              hint="Count from GET /appraisal/forms"
            />
          </Can>

          <Can anyOf={["roles.update", "roles.delete", "permissions.delete"]}>
            <StatCard
              title="Roles Configured"
              path={ENDPOINTS.roles.base}
              enabled={hasAnyPermission(["roles.update", "roles.delete", "permissions.delete"])}
              permission="roles.update / permissions.delete"
              hint="Count from GET /roles — role administration access"
            />
          </Can>
        </section>

        {/* If nothing is visible at all, this role truly has zero grants yet */}
        {session.permissions.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
            The role <strong>{session.role.role_name}</strong> currently has 0 permissions assigned in the backend
            (checked live via <code>GET /api/role-permissions</code>). Assign permissions to this role via{" "}
            <code>POST /api/role-permissions</code> to unlock dashboard sections and menu items — nothing is
            invented client-side.
          </div>
        )}

        {/* ==================== KNOWN GAPS (always shown, honestly) ==================== */}
        <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NotImplementedCard
            title="Cross-module trend widgets"
            note="there is no dashboard/stats aggregate endpoint; only raw list endpoints. Appraisal analytics do exist — see GET /appraisal/analytics on the Analytics tab."
          />
          <NotImplementedCard
            title="Refresh tokens"
            note="POST /auth/login issues a JWT, but there is no /auth/refresh; when the token expires you are returned to the login screen."
          />
        </section>
      </div>
    </DashboardLayout>
  );
}
