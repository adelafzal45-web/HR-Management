// ============================================================================
// /settings/celebrations — the birthday & work-anniversary announcement config
// (backlog #2b) plus the manual "send now" trigger.
//
// A thin editor over one jsonb blob on the company-settings row
// (`celebration_config`), reusing the company-settings.view/.update permissions
// — the same "config lives on company_settings" pattern the biometric screen
// uses, so no new permission keys. A null blob means "never configured": the API
// layer substitutes the backend defaults, so this form always shows the exact
// wording the scheduler would use before anything is saved.
//
// The announcement is a single group post — the configurable heading plus the
// auto 🎂/🎊 list of celebrant names composed by the backend. No per-person
// wishes are sent, so only the heading, the enable toggle and the send time are
// editable here.
//
// Modelled on SlackSettings.tsx (Card/Field, permission gating, load→form→save,
// loading/403/error states). The Toggle matches PayrollSettings.tsx.
// ============================================================================

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Clock,
  Loader2,
  MessageSquare,
  PartyPopper,
  RotateCcw,
  Send,
} from "lucide-react";

import SettingsLayout from "@/modules/settings/pages/SettingsLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useAuth } from "@/app/providers/AuthContext";
import { useToast } from "@/app/providers/ToastContext";
import { ApiError } from "@/lib/apiClient";
import {
  celebrationSettingsApi,
  CELEBRATION_DEFAULTS,
  type AnnouncementResult,
  type CelebrationConfig,
} from "@/modules/settings/api/celebrationSettingsApi";

/** All three fields are primitive, so a field-by-field compare skips no-op saves. */
const sameConfig = (a: CelebrationConfig, b: CelebrationConfig): boolean =>
  a.enabled === b.enabled &&
  a.send_time === b.send_time &&
  a.heading === b.heading;

/**
 * Turn the backend's AnnouncementResult into a human sentence for the toast.
 * "Send now" forces the run, so `already-announced` shouldn't occur — it is
 * still handled for completeness.
 */
function describeAnnouncement(result: AnnouncementResult): string {
  if (!result.announced) {
    switch (result.reason) {
      case "no-celebrations":
        return "No birthdays or work anniversaries fall on today.";
      case "busy":
        return "Another announcement is already in progress — try again in a moment.";
      case "already-announced":
        return "Today's celebrations have already been announced.";
      default:
        return "Nothing was announced.";
    }
  }
  const groups: string[] = [];
  if (result.birthdays > 0) {
    groups.push(`${result.birthdays} birthday${result.birthdays === 1 ? "" : "s"}`);
  }
  if (result.anniversaries > 0) {
    groups.push(
      `${result.anniversaries} work ${result.anniversaries === 1 ? "anniversary" : "anniversaries"}`,
    );
  }
  const who = groups.length > 0 ? groups.join(" and ") : "today's celebrations";
  const people = `${result.informed} ${result.informed === 1 ? "person" : "people"}`;
  const slack = result.slack.sent
    ? "Posted to Slack."
    : `Slack post skipped${result.slack.reason ? `: ${result.slack.reason}` : ""}.`;
  return `Announced ${who} to ${people}. ${slack}`;
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
  placeholder,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  hint?: React.ReactNode;
}) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-sm font-medium text-gray-700">{label}</span>
      <input
        type="text"
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

function Toggle({
  checked,
  onChange,
  label,
  help,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  help: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start justify-between gap-4 rounded-xl border border-gray-100 p-4 transition ${
        disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:bg-gray-50"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">{help}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition disabled:cursor-not-allowed ${
          checked ? "bg-brand" : "bg-gray-200"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

export default function CelebrationSettingsPage() {
  const status = useBackendStatus();
  const { hasPermission } = useAuth();
  const { showSuccess, showError, showInfo, showWarning } = useToast();

  const canView = hasPermission("company-settings.view");
  const canUpdate = hasPermission("company-settings.update");

  const [settings, setSettings] = useState<CelebrationConfig | null>(null);
  const [form, setForm] = useState<CelebrationConfig | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const formLocked = !canUpdate;

  const loadSettings = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const current = await celebrationSettingsApi.get();
      setSettings(current);
      setForm(current);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Couldn't load the celebration settings.",
      );
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const set = useCallback(
    <K extends keyof CelebrationConfig>(key: K, value: CelebrationConfig[K]) => {
      setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    [],
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form || !settings) return;

    if (sameConfig(form, settings)) {
      showSuccess("Nothing to save.", "No changes were made.");
      return;
    }
    // The backend rejects a blank heading with a 400; catching it here gives a
    // clearer message than the raw validation error.
    if (!form.heading.trim()) {
      showError(
        "The heading is required.",
        "Enter an announcement heading before saving.",
      );
      return;
    }

    setSaving(true);
    try {
      const updated = await celebrationSettingsApi.update({
        enabled: form.enabled,
        send_time: form.send_time,
        heading: form.heading.trim(),
      });
      setSettings(updated);
      setForm(updated);
      showSuccess("Celebration settings saved.");
    } catch (err) {
      showError(
        err instanceof ApiError ? err.message : "Couldn't save the celebration settings.",
        "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSendNow = async () => {
    setSending(true);
    try {
      const result = await celebrationSettingsApi.sendNow();
      const summary = describeAnnouncement(result);
      if (result.announced) {
        showSuccess("Celebrations announced.", summary);
      } else if (result.reason === "no-celebrations") {
        showInfo("Nothing to announce.", summary);
      } else {
        showWarning("Announcement not sent.", summary);
      }
    } catch (err) {
      showError(
        err instanceof ApiError ? err.message : "Couldn't send the announcement.",
        "Please try again.",
      );
    } finally {
      setSending(false);
      setConfirmOpen(false);
    }
  };

  return (
    <SettingsLayout activeTab="/settings/celebrations">
      <BackendStatusBanner status={status} />

      {!canView ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          <p className="font-semibold">You don't have access to the celebration settings.</p>
          <p className="mt-0.5">
            Viewing this page requires the{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">company-settings.view</code>{" "}
            permission. Ask an administrator to grant it from Settings → Roles.
          </p>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 rounded-2xl bg-white p-10 text-sm text-gray-400 shadow-sm ring-1 ring-gray-100">
          <Loader2 size={16} className="animate-spin" />
          Loading celebration settings…
        </div>
      ) : loadError || !settings || !form ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700"
        >
          {loadError ?? "Couldn't load the celebration settings."}{" "}
          <button
            type="button"
            onClick={() => void loadSettings()}
            className="font-semibold underline"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* ---- Schedule ---- */}
            <Card
              title="Daily Announcement"
              description="When enabled, birthdays and work anniversaries are announced once a day — to everyone's notification bell and to Slack (when Slack posting is on)."
              icon={PartyPopper}
            >
              <div className="space-y-4">
                <Toggle
                  checked={form.enabled}
                  onChange={(v) => set("enabled", v)}
                  disabled={formLocked}
                  label="Announce celebrations daily"
                  help="Turn off to stop the daily announcement without losing your settings."
                />
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                    <Clock size={14} className="text-gray-400" />
                    Send time
                  </span>
                  <input
                    type="time"
                    value={form.send_time}
                    disabled={formLocked}
                    onChange={(e) => set("send_time", e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:ring-2 focus:ring-brand/60 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 sm:w-48"
                  />
                  <span className="mt-1 block text-xs text-gray-400">
                    Server local time. The announcement fires at the first check after this time each day.
                  </span>
                </label>
              </div>
            </Card>

            {/* ---- Wording ---- */}
            <Card
              title="Message Wording"
              description="The heading for the daily announcement. The 🎂/🎊 list of names is added automatically underneath."
              icon={MessageSquare}
            >
              <Field
                label="Broadcast heading"
                value={form.heading}
                onChange={(v) => set("heading", v)}
                placeholder={CELEBRATION_DEFAULTS.heading}
                disabled={formLocked}
                hint="The title of the bell announcement and the first line of the Slack post. The 🎂/🎊 list of names is added automatically underneath."
              />
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

          {/* ---- Manual send ---- */}
          {canUpdate && (
            <Card
              title="Send Today's Celebrations Now"
              description="Runs the announcement immediately — the notification bell for everyone and the Slack post. Ignores the schedule and the once-a-day guard, so it can be re-sent."
              icon={Send}
            >
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={sending}
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                Send today's celebrations now
              </button>
              <p className="mt-2 text-xs text-gray-400">
                Uses the currently saved wording — save your changes above first if you've edited anything.
              </p>
            </Card>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Send today's celebrations now?"
        description="This notifies every employee and posts to Slack right away, using the saved wording. It bypasses the daily schedule and can be sent more than once."
        confirmLabel="Send now"
        cancelLabel="Cancel"
        tone="brand"
        icon={<PartyPopper size={20} className="text-brand" />}
        loading={sending}
        onConfirm={() => void handleSendNow()}
        onCancel={() => setConfirmOpen(false)}
      />
    </SettingsLayout>
  );
}
