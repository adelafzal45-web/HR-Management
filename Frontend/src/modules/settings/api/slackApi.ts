// ============================================================================
// Slack API — org-wide Slack integration configuration and connectivity test.
//
// Kept out of settingsApi.ts for the same reason as mailApi.ts: none of these
// routes have a demo-fallback counterpart and none ever should. A mocked "Slack
// saved" or "test message sent" would be actively misleading — the whole point
// of the test button is to find out whether Slack actually accepts the token.
// Every call here talks to the real API or throws.
//
// Route inventory, verified against the controller:
//   /slack-settings   GET, GET /status, PATCH, POST /test
//
// Permission keys (seeded in migration 1789400000007):
//   slack-settings.view / .update / .test
//
// Bodies are snake_case, matching the DTOs. No camelCase translation layer: the
// global ValidationPipe runs with `whitelist: true`, so a camelCase key is
// silently stripped and the request would appear to succeed while changing
// nothing.
// ============================================================================

import { api, ENDPOINTS } from "@/lib/apiClient";

/**
 * Mirrors SlackSettingsResponse in Backend/src/slack/slack-settings.service.ts.
 *
 * There is deliberately no `token` field. The backend returns only `token_set`,
 * because a settings screen that renders the bot token back to the browser hands
 * the credential to anyone who reaches that screen — or to anything reading the
 * response. The UI shows "configured / not set" and offers to replace it, never
 * to reveal it.
 */
export type SlackSettings = {
  token_set: boolean;
  default_channel: string | null;
  enabled: boolean;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  last_test_error: string | null;
};

/** All optional — the backend patches only the keys present. */
export type UpdateSlackSettingsPayload = {
  /** Write-only. Send "" to clear the stored token; omit to leave it as-is. */
  token?: string;
  default_channel?: string;
  enabled?: boolean;
};

/** Whether Slack can currently post, and why not if it can't. */
export type SlackStatus = { ready: boolean; reason: string | null };

export type SendTestMessageResult = {
  message?: string;
  channel?: string;
  [key: string]: unknown;
};

export const slackSettingsApi = {
  get: () => api.get<SlackSettings>(ENDPOINTS.slackSettings.base),

  status: () => api.get<SlackStatus>(ENDPOINTS.slackSettings.status),

  update: (payload: UpdateSlackSettingsPayload) =>
    api.patch<SlackSettings>(ENDPOINTS.slackSettings.base, payload),

  /**
   * Posts synchronously so a failure surfaces as a 503 carrying Slack's own
   * error code. Show that code verbatim: "test failed" without the reason leaves
   * an admin guessing between a rejected token, an unknown channel and a bot
   * that was never invited to the channel.
   *
   * `channel` is optional — omitted, the test posts to the configured default.
   */
  test: (channel?: string) =>
    api.post<SendTestMessageResult>(
      ENDPOINTS.slackSettings.test,
      channel ? { channel } : {},
    ),
};
