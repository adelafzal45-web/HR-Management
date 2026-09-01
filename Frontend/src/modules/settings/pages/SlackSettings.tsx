// ============================================================================
// /settings/slack — Slack integration configuration and connectivity test.
//
// Two things this screen deliberately does NOT do:
//
// 1. It never renders the bot token. The API returns `token_set` and no token
//    value; the field here is a write-only replacement box that starts empty on
//    every load. "Configured" plus a way to replace is all an operator needs,
//    and it keeps the credential out of the DOM.
//
// 2. It does not summarise a failed test as "test failed". POST
//    /slack-settings/test posts synchronously and wraps Slack's error in a 503
//    carrying Slack's own code; that code is shown verbatim, because
//    `invalid_auth`, `channel_not_found` and `not_in_channel` call for
//    completely different fixes.
//
// Modelled on SmtpSettings.tsx, minus the outbound queue (Slack posts directly)
// and the env-override lock (Slack has no environment-variable escape hatch).
// ============================================================================

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Lock,
  MessageSquare,
  RotateCcw,
  Send,
  XCircle,
} from "lucide-react";

import SettingsLayout from "@/modules/settings/pages/SettingsLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useAuth } from "@/app/providers/AuthContext";
import { useToast } from "@/app/providers/ToastContext";
import { ApiError } from "@/lib/apiClient";
import {
  slackSettingsApi,
  type SlackSettings,
  type SlackStatus,
  type UpdateSlackSettingsPayload,
} from "@/modules/settings/api/slackApi";

/** The editable fields. `token` is separate — it is never pre-filled. */
type FormState = {
  default_channel: string;
  enabled: boolean;
};

const toForm = (settings: SlackSettings): FormState => ({
  default_channel: settings.default_channel ?? "",
  enabled: settings.enabled,
});

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
  icon?: typeof MessageSquare;
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

export default function SlackSettingsPage() {
  const status = useBackendStatus();
  const { hasPermission } = useAuth();
  const { showSuccess, showError } = useToast();

  const canUpdate = hasPermission("slack-settings.update");
  const canTest = hasPermission("slack-settings.test");
  // The role gate on the route is coarse — an HR Manager can hold the role
  // without holding the slack permissions. Checking here turns what would be a
  // 403 mid-render into an explanation.
  const canView = hasPermission("slack-settings.view");

  const [settings, setSettings] = useState<SlackSettings | null>(null);
  const [readiness, setReadiness] = useState<SlackStatus | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [token, setToken] = useState("");
  const [clearToken, setClearToken] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [testChannel, setTestChannel] = useState("");
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const formLocked = !canUpdate;

  const loadSettings = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [current, ready] = await Promise.all([
        slackSettingsApi.get(),
        // Readiness is a supporting detail; a failure there must not blank the
        // form, so it is settled independently of the settings themselves.
        slackSettingsApi.status().catch(() => null),
      ]);
      setSettings(current);
      setForm(toForm(current));
      setReadiness(ready);
      setToken("");
      setClearToken(false);
      // Seed the test channel from the configured default, but never overwrite
      // one the admin has already typed — this also runs after a save and after
      // a test. Written through the updater so `testChannel` stays out of the
      // dependency list; as a dependency it would refetch on every keystroke.
      setTestChannel((prev) => prev || (current.default_channel ?? ""));
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Couldn't load the Slack configuration.",
      );
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  /**
   * Sends only what changed, plus the token when the admin actually typed one.
   *
   * An unchanged token must not be echoed back — the client does not have it to
   * echo, and sending an empty string would clear a working credential.
   */
  const buildPayload = useCallback((): UpdateSlackSettingsPayload | null => {
    if (!form || !settings) return null;

    const payload: UpdateSlackSettingsPayload = {};
    if (form.default_channel.trim() !== (settings.default_channel ?? "")) {
      payload.default_channel = form.default_channel.trim();
    }
    if (form.enabled !== settings.enabled) payload.enabled = form.enabled;

    // "" is the documented way to clear the stored token; a typed value replaces
    // it. Neither is inferred from the rest of the form.
    if (clearToken) payload.token = "";
    else if (token) payload.token = token;

    return payload;
  }, [form, settings, token, clearToken]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;

    const payload = buildPayload();
    if (!payload || Object.keys(payload).length === 0) {
      showSuccess("Nothing to save.", "No changes were made.");
      return;
    }

    setSaving(true);
    try {
      const updated = await slackSettingsApi.update(payload);
      setSettings(updated);
      setForm(toForm(updated));
      setToken("");
      setClearToken(false);
      // Re-read readiness rather than leaving the previous verdict on screen.
      setReadiness(await slackSettingsApi.status().catch(() => null));
      showSuccess("Slack settings saved.");
    } catch (err) {
      showError(
        err instanceof ApiError ? err.message : "Couldn't save the Slack settings.",
        "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestError(null);
    try {
      const result = await slackSettingsApi.test(testChannel.trim() || undefined);
      showSuccess(
        "Test message sent.",
        result.channel ? `Posted to ${result.channel}.` : undefined,
      );
      // last_test_at / last_test_ok are written by the send, so refresh to show
      // the outcome the backend recorded rather than an optimistic guess.
      void loadSettings();
    } catch (err) {
      // Shown in full: Slack's own error code is the diagnostic.
      const message =
        err instanceof ApiError ? err.message : "The test message could not be sent.";
      setTestError(message);
      showError("Test message failed.", message);
    } finally {
      setTesting(false);
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
    <SettingsLayout activeTab="/settings/slack">
      <BackendStatusBanner status={status} />

      {!canView ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          <p className="font-semibold">You don't have access to the Slack configuration.</p>
          <p className="mt-0.5">
            Viewing Slack settings requires the{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">slack-settings.view</code>{" "}
            permission. Ask an administrator to grant it from Settings → Roles.
          </p>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 rounded-2xl bg-white p-10 text-sm text-gray-400 shadow-sm ring-1 ring-gray-100">
          <Loader2 size={16} className="animate-spin" />
          Loading Slack configuration…
        </div>
      ) : loadError || !settings || !form ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700"
        >
          {loadError ?? "Couldn't load the Slack configuration."}{" "}
          <button type="button" onClick={() => void loadSettings()} className="font-semibold underline">
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-6">
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
                  {readiness.ready ? "Slack is ready to post" : "Slack is not posting"}
                </p>
                {readiness.reason && <p className="mt-0.5">{readiness.reason}</p>}
              </div>
            </div>
          )}

          {/* ---- Workspace ---- */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <Card
              title="Slack Workspace"
              description="A bot-token connection to your workspace. Invite the bot to any channel it should post in."
              icon={MessageSquare}
            >
              {/* Bot token: write-only. Never populated from the server. */}
              <div className="mb-4 rounded-xl bg-gray-50 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">Bot token</span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                      settings.token_set
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : "bg-gray-100 text-gray-600 ring-gray-200"
                    }`}
                  >
                    {settings.token_set ? "Configured" : "Not set"}
                  </span>
                </div>
                <input
                  type="password"
                  value={token}
                  autoComplete="new-password"
                  disabled={formLocked || clearToken}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={
                    settings.token_set ? "Leave blank to keep the current token" : "xoxb-…"
                  }
                  className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60 disabled:cursor-not-allowed disabled:bg-gray-100"
                />
                <p className="mt-1.5 text-xs text-gray-400">
                  A bot user OAuth token (starts with <code className="rounded bg-gray-100 px-1 py-0.5">xoxb-</code>)
                  with the <code className="rounded bg-gray-100 px-1 py-0.5">chat:write</code> scope. Stored
                  encrypted (AES-256-GCM) and never sent back to the browser.
                </p>
                {settings.token_set && !formLocked && (
                  <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={clearToken}
                      onChange={(e) => {
                        setClearToken(e.target.checked);
                        if (e.target.checked) setToken("");
                      }}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-brand focus:ring-brand/60"
                    />
                    Remove the stored token
                  </label>
                )}
              </div>

              <Field
                label="Default channel"
                value={form.default_channel}
                onChange={(v) => set("default_channel", v)}
                placeholder="#general"
                disabled={formLocked}
                hint="Where messages post when no channel is specified — e.g. #general or a channel ID (C0123ABCD). The bot must be a member of it."
              />

              <label className="flex items-start gap-3 rounded-xl bg-gray-50 p-4">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  disabled={formLocked}
                  onChange={(e) => set("enabled", e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/60 disabled:cursor-not-allowed"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-800">Post to Slack</span>
                  <span className="mt-0.5 block text-xs text-gray-500">
                    Turn this off to stop posting without deleting the configuration. Features
                    that announce to Slack (birthdays, reminders) check this switch first.
                  </span>
                </span>
              </label>
            </Card>

            {canUpdate && (
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
              title="Send a Test Message"
              description="Posts immediately, so failures surface here with Slack's own error."
              icon={Send}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <input
                  type="text"
                  value={testChannel}
                  onChange={(e) => setTestChannel(e.target.value)}
                  placeholder={settings.default_channel ?? "#channel or channel ID"}
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
              <p className="mt-2 text-xs text-gray-400">
                Leave the channel blank to post to the configured default.
              </p>

              {testError && (
                <div
                  role="alert"
                  className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
                >
                  <p className="font-semibold">Slack rejected the test.</p>
                  {/* Verbatim, including Slack's error code — it is the fix. */}
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
        </div>
      )}
    </SettingsLayout>
  );
}
