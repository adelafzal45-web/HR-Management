// ============================================================================
// Celebration settings API — the birthday & work-anniversary announcement
// config (backlog #2b) plus the manual "send now" trigger.
//
// The config is NOT its own resource: it is one jsonb blob on the company
// settings row (`celebration_config`), exactly like `theme_config` and
// `biometric_device`. So it is read with GET /company-settings and written with
// PATCH /company-settings — reusing company-settings.view/.update, no new
// permission keys. A null column means "never configured" → the backend runs
// with its defaults, which this file mirrors so the form shows the same wording
// the scheduler would use before anything is saved.
//
// Like slackApi.ts, every call here talks to the real API or throws — there is
// no demo fallback. A fabricated "announcement sent" would be actively
// misleading when the whole point of the button is to fire the real thing.
//
// Bodies are snake_case, matching the DTO. No camelCase translation layer: the
// backend's ValidationPipe runs with `whitelist: true`, so a camelCase key is
// silently stripped and the request would appear to succeed while changing
// nothing.
// ============================================================================

import { api, ENDPOINTS } from "@/lib/apiClient";

/**
 * Mirrors CelebrationConfig in
 * Backend/src/company-settings/celebration-config.type.ts.
 *
 * `send_time` is 'HH:MM' 24-hour, server-local. `heading` is the announcement
 * title and the first line of the broadcast/Slack summary; the 🎂/🎊 celebrant
 * list under it is composed by the backend. It is a single group post — no
 * per-person wishes are sent.
 */
export type CelebrationConfig = {
  enabled: boolean;
  send_time: string;
  heading: string;
};

/**
 * The backend defaults (CELEBRATION_CONFIG_DEFAULTS), reproduced so the form can
 * render them when the column is still null. Kept in sync with the backend by
 * hand — they are the original hard-coded defaults, so they change rarely.
 */
export const CELEBRATION_DEFAULTS: CelebrationConfig = {
  enabled: true,
  send_time: "08:00",
  heading: "🎉 Today's Celebrations",
};

/**
 * Outcome of a manual "send now" — mirrors AnnouncementResult in
 * Backend/src/celebrations/celebrations.types.ts. `announced` is false when
 * nothing went out; `reason` says why. `slack` echoes the Slack result only —
 * whether it posted and why not — never a token.
 */
export type AnnouncementResult = {
  announced: boolean;
  reason?: "no-celebrations" | "already-announced" | "busy";
  birthdays: number;
  anniversaries: number;
  informed: number;
  slack: { sent: boolean; reason?: string };
};

/** The slice of the company-settings row this screen reads. */
type CompanySettingsCelebrationView = {
  celebration_config: CelebrationConfig | null;
};

export const celebrationSettingsApi = {
  /**
   * The saved config, or the defaults when the column is still null so the form
   * shows exactly what the scheduler would use.
   */
  get: async (): Promise<CelebrationConfig> => {
    const settings = await api.get<CompanySettingsCelebrationView>(
      ENDPOINTS.companySettings.base,
    );
    return settings.celebration_config ?? CELEBRATION_DEFAULTS;
  },

  /**
   * Replace the whole blob — the backend DTO requires every field, and a null
   * column already stands in for "use defaults", so a partial config has no
   * meaning. Returns the persisted config (never null after a save).
   */
  update: async (config: CelebrationConfig): Promise<CelebrationConfig> => {
    const settings = await api.patch<CompanySettingsCelebrationView>(
      ENDPOINTS.companySettings.base,
      { celebration_config: config },
    );
    return settings.celebration_config ?? config;
  },

  /**
   * Fire today's announcement immediately. Bypasses the scheduled send-time
   * window and the once-per-day guard on the backend (so it can be re-sent), so
   * a failure here is a real failure — surface it.
   */
  sendNow: () => api.post<AnnouncementResult>(ENDPOINTS.celebrations.announce),
};
