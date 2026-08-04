// ============================================================================
// /settings/smtp — SMTP configuration, connection test, and outbound queue.
//
// Three things this screen deliberately does NOT do:
//
// 1. It never renders the SMTP password. The API returns `password_set` and no
//    password value; the field here is a write-only replacement box that starts
//    empty on every load. "Configured" plus a way to replace is all an operator
//    needs, and it keeps the credential out of the DOM.
//
// 2. It does not let you edit anything while `env_override` is true. When
//    SMTP_HOST is set in the environment the backend ignores the database row
//    entirely and returns 409 on PATCH, so offering an enabled form would
//    promise a save that cannot happen. The form goes read-only behind a banner
//    that says where the values are actually coming from.
//
// 3. It does not summarise a failed test as "test failed". POST /smtp-settings/test
//    sends synchronously and wraps an SMTP error in a 503 carrying the server's
//    own message; that message is shown verbatim, because "connection refused"
//    and "535 authentication failed" call for completely different fixes.
// ============================================================================

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Inbox,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  Send,
  ServerCog,
  XCircle,
} from "lucide-react";

import SettingsLayout from "@/modules/settings/pages/SettingsLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useAuth } from "@/app/providers/AuthContext";
import { useToast } from "@/app/providers/ToastContext";
import { ApiError } from "@/lib/apiClient";
import {
  emailQueueApi,
  smtpSettingsApi,
  SMTP_ENCRYPTIONS,
  EMAIL_QUEUE_STATUSES,
  type EmailQueueStats,
  type EmailQueueStatus,
  type QueuedEmail,
  type SmtpEncryption,
  type SmtpSettings,
  type SmtpStatus,
  type UpdateSmtpSettingsPayload,
} from "@/modules/settings/api/mailApi";

const EMPTY_STATS: EmailQueueStats = {
  pending: 0,
  sending: 0,
  sent: 0,
  failed: 0,
  cancelled: 0,
};

/** The editable text fields. `password` is separate — it is never pre-filled. */
type FormState = {
  host: string;
  port: string;
  username: string;
  encryption: SmtpEncryption;
  from_name: string;
  from_email: string;
  reply_to: string;
  enabled: boolean;
};

const toForm = (settings: SmtpSettings): FormState => ({
  host: settings.host ?? "",
  port: String(settings.port ?? 587),
  username: settings.username ?? "",
  encryption: settings.encryption,
  from_name: settings.from_name ?? "",
  from_email: settings.from_email ?? "",
  reply_to: settings.reply_to ?? "",
  enabled: settings.enabled,
});

const ENCRYPTION_LABELS: Record<SmtpEncryption, string> = {
  none: "None (port 25)",
  tls: "STARTTLS (port 587)",
  ssl: "SSL/TLS (port 465)",
};

const STATUS_STYLES: Record<EmailQueueStatus, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  sending: "bg-sky-50 text-sky-700 ring-sky-200",
  sent: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  failed: "bg-rose-50 text-rose-700 ring-rose-200",
  cancelled: "bg-gray-100 text-gray-600 ring-gray-200",
};

function StatusPill({ status }: { status: EmailQueueStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function Card({
  title,
  description,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  description?: string;
  icon?: typeof ServerCog;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {Icon && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-light text-brand-dark">
              <Icon size={17} />
            </span>
          )}
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
        {label}
        {disabled && <Lock size={12} className="text-gray-400" />}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
      />
      {hint && <span className="mt-1 block text-xs text-gray-400">{hint}</span>}
    </label>
  );
}

export default function SmtpSettingsPage() {
  const status = useBackendStatus();
  const { hasPermission } = useAuth();
  const { showSuccess, showError } = useToast();

  const canUpdate = hasPermission("email-settings.update");
  const canTest = hasPermission("email-settings.test");
  const canViewQueue = hasPermission("email-queue.view");
  const canManageQueue = hasPermission("email-queue.manage");
  // The role gate on the route is coarse — an HR Manager can hold the role
  // without holding the mail permissions. Checking here turns what would be a
  // 403 mid-render into an explanation.
  const canView = hasPermission("email-settings.view");

  const [settings, setSettings] = useState<SmtpSettings | null>(null);
  const [readiness, setReadiness] = useState<SmtpStatus | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [password, setPassword] = useState("");
  const [clearPassword, setClearPassword] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const [stats, setStats] = useState<EmailQueueStats>(EMPTY_STATS);
  const [queue, setQueue] = useState<QueuedEmail[]>([]);
  const [queueFilter, setQueueFilter] = useState<EmailQueueStatus | "">("");
  const [queueLoading, setQueueLoading] = useState(false);
  const [busyRow, setBusyRow] = useState<string | null>(null);

  // The environment wins outright when SMTP_HOST is set, so the whole form is
  // read-only rather than partially editable — a half-editable form would leave
  // an operator unable to tell which values are live.
  const envOverride = settings?.env_override ?? false;
  const formLocked = !canUpdate || envOverride;

  const loadSettings = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [current, ready] = await Promise.all([
        smtpSettingsApi.get(),
        // Readiness is a supporting detail; a failure there must not blank the
        // form, so it is settled independently of the settings themselves.
        smtpSettingsApi.status().catch(() => null),
      ]);
      setSettings(current);
      setForm(toForm(current));
      setReadiness(ready);
      setPassword("");
      setClearPassword(false);
      // Seed the test address from the From address, but never overwrite one the
      // admin has already typed — this also runs after a save and after a test.
      // Written through the updater so `testTo` stays out of the dependency list:
      // as a dependency it would refetch the whole page on every keystroke.
      setTestTo((prev) => prev || (current.from_email ?? ""));
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Couldn't load the SMTP configuration.",
      );
    } finally {
      setLoading(false);
    }
  }, [canView]);

  const loadQueue = useCallback(async () => {
    if (!canViewQueue) return;
    setQueueLoading(true);
    try {
      const [statsResult, listResult] = await Promise.allSettled([
        emailQueueApi.stats(),
        emailQueueApi.list({
          page: 1,
          limit: 20,
          ...(queueFilter ? { status: queueFilter } : {}),
        }),
      ]);
      if (statsResult.status === "fulfilled") setStats(statsResult.value);
      if (listResult.status === "fulfilled") setQueue(listResult.value.data);
    } finally {
      setQueueLoading(false);
    }
  }, [canViewQueue, queueFilter]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  /**
   * Sends only what changed, plus the password when the admin actually typed one.
   *
   * An unchanged password must not be echoed back — the client does not have it
   * to echo, and sending an empty string would clear a working credential.
   */
  const buildPayload = useCallback((): UpdateSmtpSettingsPayload | null => {
    if (!form || !settings) return null;

    const payload: UpdateSmtpSettingsPayload = {};
    if (form.host.trim() !== (settings.host ?? "")) payload.host = form.host.trim();
    if (Number(form.port) !== settings.port) payload.port = Number(form.port);
    if (form.username.trim() !== (settings.username ?? "")) {
      payload.username = form.username.trim();
    }
    if (form.encryption !== settings.encryption) payload.encryption = form.encryption;
    if (form.from_name.trim() !== (settings.from_name ?? "")) {
      payload.from_name = form.from_name.trim();
    }
    if (form.from_email.trim() !== (settings.from_email ?? "")) {
      payload.from_email = form.from_email.trim();
    }
    if (form.reply_to.trim() !== (settings.reply_to ?? "")) {
      payload.reply_to = form.reply_to.trim();
    }
    if (form.enabled !== settings.enabled) payload.enabled = form.enabled;

    // "" is the documented way to clear the stored credential; a typed value
    // replaces it. Neither is inferred from the rest of the form.
    if (clearPassword) payload.password = "";
    else if (password) payload.password = password;

    return payload;
  }, [form, settings, password, clearPassword]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;

    const port = Number(form.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      showError("Port must be a whole number between 1 and 65535.");
      return;
    }

    const payload = buildPayload();
    if (!payload || Object.keys(payload).length === 0) {
      showSuccess("Nothing to save.", "No changes were made.");
      return;
    }

    setSaving(true);
    try {
      const updated = await smtpSettingsApi.update(payload);
      setSettings(updated);
      setForm(toForm(updated));
      setPassword("");
      setClearPassword(false);
      // The transport is rebuilt server-side on save, so re-read readiness
      // rather than leaving the previous verdict on screen.
      setReadiness(await smtpSettingsApi.status().catch(() => null));
      showSuccess("SMTP settings saved.");
    } catch (err) {
      showError(
        err instanceof ApiError ? err.message : "Couldn't save the SMTP settings.",
        "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testTo.trim()) {
      showError("Enter an address to send the test to.");
      return;
    }
    setTesting(true);
    setTestError(null);
    try {
      await smtpSettingsApi.test(testTo.trim());
      showSuccess("Test email sent.", `Check the inbox for ${testTo.trim()}.`);
      // last_test_at / last_test_ok are written by the send, so refresh to show
      // the outcome the backend recorded rather than an optimistic guess.
      void loadSettings();
    } catch (err) {
      // Shown in full: the SMTP server's own wording is the diagnostic.
      const message =
        err instanceof ApiError ? err.message : "The test email could not be sent.";
      setTestError(message);
      showError("Test email failed.", message);
    } finally {
      setTesting(false);
    }
  };

  const handleQueueAction = async (id: string, action: "retry" | "cancel") => {
    setBusyRow(id);
    try {
      const updated =
        action === "retry" ? await emailQueueApi.retry(id) : await emailQueueApi.cancel(id);
      setQueue((prev) =>
        prev.map((row) => (row.email_queue_id === id ? updated : row)),
      );
      showSuccess(action === "retry" ? "Email re-queued." : "Email cancelled.");
      void loadQueue();
    } catch (err) {
      showError(
        err instanceof ApiError ? err.message : `Couldn't ${action} that email.`,
      );
    } finally {
      setBusyRow(null);
    }
  };

  const lastTest = useMemo(() => {
    if (!settings?.last_test_at) return null;
    return {
      at: formatDateTime(settings.last_test_at),
      ok: settings.last_test_ok === true,
      error: settings.last_test_error,
    };
  }, [settings]);

  return (
    <SettingsLayout activeTab="/settings/smtp">
      <BackendStatusBanner status={status} />

      {!canView ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          <p className="font-semibold">You don't have access to the mail configuration.</p>
          <p className="mt-0.5">
            Viewing SMTP settings requires the{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">email-settings.view</code>{" "}
            permission. Ask an administrator to grant it from Settings → Roles.
          </p>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 rounded-2xl bg-white p-10 text-sm text-gray-400 shadow-sm ring-1 ring-gray-100">
          <Loader2 size={16} className="animate-spin" />
          Loading SMTP configuration…
        </div>
      ) : loadError || !settings || !form ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700"
        >
          {loadError ?? "Couldn't load the SMTP configuration."}{" "}
          <button type="button" onClick={() => void loadSettings()} className="font-semibold underline">
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {envOverride && (
            <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
              <Lock size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Managed by environment variables</p>
                <p className="mt-0.5 text-sky-700">
                  <code className="rounded bg-sky-100 px-1 py-0.5 text-xs">SMTP_HOST</code> is set
                  on the server, so these values come from the environment and the stored
                  configuration is ignored. Editing is disabled here — change the deployment's
                  variables instead.
                </p>
              </div>
            </div>
          )}

          {readiness && (
            <div
              className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${
                readiness.ready
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              {readiness.ready ? (
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              )}
              <div>
                <p className="font-semibold">
                  {readiness.ready ? "Outbound email is ready" : "Outbound email is not sending"}
                </p>
                {readiness.reason && <p className="mt-0.5">{readiness.reason}</p>}
              </div>
            </div>
          )}

          {/* ---- Server ---- */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <Card
              title="SMTP Server"
              description="Where outbound email is handed off for delivery."
              icon={ServerCog}
            >
              <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
                <Field
                  label="Host"
                  value={form.host}
                  onChange={(v) => set("host", v)}
                  placeholder="smtp.example.com"
                  disabled={formLocked}
                />
                <Field
                  label="Port"
                  type="number"
                  value={form.port}
                  onChange={(v) => set("port", v)}
                  placeholder="587"
                  disabled={formLocked}
                />
                <Field
                  label="Username"
                  value={form.username}
                  onChange={(v) => set("username", v)}
                  placeholder="postmaster@example.com"
                  disabled={formLocked}
                />

                <label className="mb-4 block">
                  <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                    Encryption
                    {formLocked && <Lock size={12} className="text-gray-400" />}
                  </span>
                  <select
                    value={form.encryption}
                    disabled={formLocked}
                    onChange={(e) => set("encryption", e.target.value as SmtpEncryption)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:ring-2 focus:ring-brand/60 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                  >
                    {SMTP_ENCRYPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {ENCRYPTION_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Password: write-only. Never populated from the server. */}
              <div className="rounded-xl bg-gray-50 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">Password</span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                      settings.password_set
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : "bg-gray-100 text-gray-600 ring-gray-200"
                    }`}
                  >
                    {settings.password_set ? "Configured" : "Not set"}
                  </span>
                </div>
                <input
                  type="password"
                  value={password}
                  autoComplete="new-password"
                  disabled={formLocked || clearPassword}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    settings.password_set ? "Leave blank to keep the current password" : "SMTP password"
                  }
                  className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60 disabled:cursor-not-allowed disabled:bg-gray-100"
                />
                <p className="mt-1.5 text-xs text-gray-400">
                  Stored encrypted (AES-256-GCM) and never sent back to the browser.
                </p>
                {settings.password_set && !formLocked && (
                  <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={clearPassword}
                      onChange={(e) => {
                        setClearPassword(e.target.checked);
                        if (e.target.checked) setPassword("");
                      }}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-brand focus:ring-brand/60"
                    />
                    Remove the stored password
                  </label>
                )}
              </div>
            </Card>

            {/* ---- Sender ---- */}
            <Card title="Sender" description="How recipients see mail from this system.">
              <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
                <Field
                  label="From Name"
                  value={form.from_name}
                  onChange={(v) => set("from_name", v)}
                  placeholder="TechnoCues HR"
                  disabled={formLocked}
                />
                <Field
                  label="From Email"
                  type="email"
                  value={form.from_email}
                  onChange={(v) => set("from_email", v)}
                  placeholder="no-reply@example.com"
                  disabled={formLocked}
                />
                <Field
                  label="Reply-To"
                  type="email"
                  value={form.reply_to}
                  onChange={(v) => set("reply_to", v)}
                  placeholder="hr@example.com"
                  disabled={formLocked}
                  hint="Optional. Where replies go if it isn't the From address."
                />
              </div>

              <label className="flex items-start gap-3 rounded-xl bg-gray-50 p-4">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  disabled={formLocked}
                  onChange={(e) => set("enabled", e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/60 disabled:cursor-not-allowed"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-800">
                    Send outbound email
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-500">
                    Turn this off to stop delivery without deleting the configuration. Queued
                    messages stay pending and send once it is turned back on.
                  </span>
                </span>
              </label>
            </Card>

            {canUpdate && !envOverride && (
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => void loadSettings()}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
                >
                  <RotateCcw size={15} />
                  Reset
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand-dark px-6 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving && <Loader2 size={15} className="animate-spin" />}
                  Save Settings
                </button>
              </div>
            )}
          </form>

          {/* ---- Test send ---- */}
          {canTest && (
            <Card
              title="Send a Test Email"
              description="Sends immediately, bypassing the queue, so failures surface here."
              icon={Send}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <input
                  type="email"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full flex-1 rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
                />
                <button
                  type="button"
                  onClick={() => void handleTest()}
                  disabled={testing}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {testing ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  Send Test
                </button>
              </div>

              {testError && (
                <div
                  role="alert"
                  className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
                >
                  <p className="font-semibold">The mail server rejected the test.</p>
                  {/* Verbatim, including the SMTP response code — it is the fix. */}
                  <p className="mt-1 break-words font-mono text-xs">{testError}</p>
                </div>
              )}

              {lastTest && (
                <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                  {lastTest.ok ? (
                    <CheckCircle2 size={13} className="text-emerald-600" />
                  ) : (
                    <XCircle size={13} className="text-rose-500" />
                  )}
                  Last test {lastTest.ok ? "succeeded" : "failed"} on {lastTest.at}
                  {!lastTest.ok && lastTest.error && (
                    <span className="break-words font-mono text-gray-400">— {lastTest.error}</span>
                  )}
                </p>
              )}
            </Card>
          )}

          {/* ---- Queue ---- */}
          {canViewQueue && (
            <Card
              title="Outbound Queue"
              description="The 20 most recent messages. The processor drains pending mail every 15 seconds."
              icon={Inbox}
              action={
                <button
                  type="button"
                  onClick={() => void loadQueue()}
                  disabled={queueLoading}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
                >
                  <RefreshCw size={13} className={queueLoading ? "animate-spin" : ""} />
                  Refresh
                </button>
              }
            >
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {EMAIL_QUEUE_STATUSES.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setQueueFilter((prev) => (prev === key ? "" : key))}
                    className={`rounded-xl px-3 py-2.5 text-left ring-1 transition ${
                      queueFilter === key
                        ? "bg-brand-light/50 ring-brand"
                        : "bg-gray-50 ring-transparent hover:bg-gray-100"
                    }`}
                  >
                    <span className="block text-lg font-semibold text-gray-900">{stats[key]}</span>
                    <span className="block text-xs capitalize text-gray-500">{key}</span>
                  </button>
                ))}
              </div>

              {queue.length === 0 ? (
                <p className="rounded-xl bg-gray-50 px-4 py-8 text-center text-sm text-gray-400">
                  {queueFilter ? `No ${queueFilter} messages.` : "No email has been queued yet."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[46rem] text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                        <th className="py-2 pr-3 font-medium">Recipient</th>
                        <th className="py-2 pr-3 font-medium">Subject</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 pr-3 font-medium">Attempts</th>
                        <th className="py-2 pr-3 font-medium">Queued</th>
                        {canManageQueue && <th className="py-2 font-medium">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {queue.map((row) => (
                        <tr key={row.email_queue_id} className="border-b border-gray-50 last:border-0">
                          <td className="py-2.5 pr-3">
                            <span className="block text-gray-900">{row.to_email}</span>
                            {row.template_key && (
                              <span className="block text-xs text-gray-400">{row.template_key}</span>
                            )}
                          </td>
                          <td className="max-w-xs truncate py-2.5 pr-3 text-gray-600">
                            {row.subject}
                          </td>
                          <td className="py-2.5 pr-3">
                            <StatusPill status={row.status} />
                            {row.status === "failed" && row.last_error && (
                              <span
                                title={row.last_error}
                                className="mt-1 block max-w-[16rem] truncate text-xs text-rose-500"
                              >
                                {row.last_error}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 text-gray-500">
                            {row.attempts}/{row.max_attempts}
                          </td>
                          <td className="py-2.5 pr-3 text-xs text-gray-500">
                            {formatDateTime(row.created_at)}
                          </td>
                          {canManageQueue && (
                            <td className="py-2.5">
                              <div className="flex gap-2">
                                {/* Mirrors the backend's 409 rules, so the buttons on
                                offer are exactly the transitions that will be accepted. */}
                                {(row.status === "failed" || row.status === "cancelled") && (
                                  <button
                                    type="button"
                                    disabled={busyRow === row.email_queue_id}
                                    onClick={() =>
                                      void handleQueueAction(row.email_queue_id, "retry")
                                    }
                                    className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                                  >
                                    Retry
                                  </button>
                                )}
                                {(row.status === "pending" || row.status === "failed") && (
                                  <button
                                    type="button"
                                    disabled={busyRow === row.email_queue_id}
                                    onClick={() =>
                                      void handleQueueAction(row.email_queue_id, "cancel")
                                    }
                                    className="rounded-full border border-rose-200 px-3 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                                  >
                                    Cancel
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </SettingsLayout>
  );
}
