// ============================================================================
// Mail API — SMTP settings, email templates, and the outbound email queue.
//
// Kept out of settingsApi.ts because none of these routes have a demo-fallback
// counterpart and none ever should. A mocked "SMTP saved" or "test email sent"
// would be actively misleading: the whole point of the test button is to find
// out whether the real mail server answers. Every call here talks to the real
// API or throws.
//
// Route inventory, verified against the controllers:
//   /smtp-settings        GET, GET /status, PATCH, POST /test
//   /email-templates      GET, GET /placeholders, GET /:key, GET /:key/versions,
//                         POST /:key/preview, PATCH /:key, POST /:key/restore,
//                         POST /:key/reset
//   /email-queue          GET, GET /stats, GET /:id, POST /:id/retry,
//                         POST /:id/cancel
//
// Permission keys (seeded in migration 1787100000000):
//   email-settings.view / .update / .test
//   email-templates.view / .update
//   email-queue.view      — list, stats, detail
//   email-queue.manage    — retry and cancel. A separate key, so read-only
//                           auditors can watch delivery without being able to
//                           re-send mail to a customer.
//
// Bodies are snake_case throughout, matching the DTOs. No camelCase translation
// layer here: the global ValidationPipe runs with `whitelist: true`, so a
// camelCase key is silently stripped rather than rejected, and the request would
// appear to succeed while changing nothing.
// ============================================================================

import { api, ENDPOINTS } from "@/lib/apiClient";
import type { PaginatedResult } from "@/modules/employees/types/employee.types";

// ---------------------------------------------------------------------------
// SMTP settings
// ---------------------------------------------------------------------------

export const SMTP_ENCRYPTIONS = ["none", "tls", "ssl"] as const;
export type SmtpEncryption = (typeof SMTP_ENCRYPTIONS)[number];

/**
 * Mirrors SmtpSettingsResponse in Backend/src/mail/smtp-settings.service.ts.
 *
 * There is deliberately no `password` field. The backend returns only
 * `password_set`, because a settings screen that renders the SMTP password back
 * to the browser hands the credential to anyone who reaches that screen — or to
 * anything reading the response. The UI shows "configured / not configured" and
 * offers to replace it, never to reveal it.
 */
export type SmtpSettings = {
  host: string | null;
  port: number;
  username: string | null;
  password_set: boolean;
  encryption: SmtpEncryption;
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  enabled: boolean;
  /** True when SMTP_HOST is set in the environment: the DB row is ignored entirely. */
  env_override: boolean;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  last_test_error: string | null;
};

/** All optional — the backend patches only the keys present. */
export type UpdateSmtpSettingsPayload = {
  host?: string;
  port?: number;
  username?: string;
  /** Write-only. Send "" to clear the stored credential; omit to leave it as-is. */
  password?: string;
  encryption?: SmtpEncryption;
  from_name?: string;
  from_email?: string;
  reply_to?: string;
  enabled?: boolean;
};

/** Whether the queue processor can currently send, and why not if it can't. */
export type SmtpStatus = { ready: boolean; reason: string | null };

export type SendTestEmailResult = { message?: string; [key: string]: unknown };

export const smtpSettingsApi = {
  get: () => api.get<SmtpSettings>(ENDPOINTS.smtpSettings.base),

  status: () => api.get<SmtpStatus>(ENDPOINTS.smtpSettings.status),

  /** 409 while `env_override` is active — the environment owns the config. */
  update: (payload: UpdateSmtpSettingsPayload) =>
    api.patch<SmtpSettings>(ENDPOINTS.smtpSettings.base, payload),

  /**
   * Sends synchronously, bypassing the queue, so a failure surfaces as a 503
   * carrying the SMTP server's own message. Show that message verbatim: "test
   * failed" without the reason leaves an admin guessing between a wrong port, a
   * rejected credential and a blocked outbound connection.
   */
  test: (to: string) => api.post<SendTestEmailResult>(ENDPOINTS.smtpSettings.test, { to }),
};

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

export type EmailTemplate = {
  email_template_id: string;
  template_key: string;
  name: string;
  description?: string | null;
  subject: string;
  /**
   * The body *fragment*, not a full document. The branded shell — header, logo,
   * colours, footer — is applied by the renderer at send time from Company
   * Settings, which is why editing branding updates all eleven templates at once
   * and why a preview looks different from what is stored here.
   */
  body_html: string;
  enabled: boolean;
  version: number;
  updated_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailTemplateVersion = {
  email_template_version_id: string;
  email_template_id: string;
  version: number;
  subject: string;
  body_html: string;
  changed_by_user_id?: string | null;
  changed_by_email?: string | null;
  created_at: string;
};

/** Group drives the editor's token picker sections. */
export type PlaceholderDescriptor = {
  key: string;
  token: string;
  group: "company" | "employee" | "event";
};

export type UpdateEmailTemplatePayload = {
  subject?: string;
  body_html?: string;
  name?: string;
  description?: string;
  enabled?: boolean;
};

/** Subject/body are optional: omitting them previews what is currently saved. */
export type PreviewEmailTemplatePayload = {
  subject?: string;
  body_html?: string;
  /** Values outside the renderer's allow-list are discarded server-side. */
  context?: Record<string, string>;
};

export type RenderedEmail = { subject: string; html: string };

export const emailTemplatesApi = {
  list: () => api.get<EmailTemplate[]>(ENDPOINTS.emailTemplates.base),

  placeholders: () => api.get<PlaceholderDescriptor[]>(ENDPOINTS.emailTemplates.placeholders),

  get: (key: string) => api.get<EmailTemplate>(ENDPOINTS.emailTemplates.byKey(key)),

  versions: (key: string) =>
    api.get<EmailTemplateVersion[]>(ENDPOINTS.emailTemplates.versions(key)),

  /**
   * Renders through the full pipeline — placeholder substitution, HTML escaping
   * and the branded shell — against unsaved edits. Previewing client-side would
   * show something the recipient never receives.
   */
  preview: (key: string, payload: PreviewEmailTemplatePayload = {}) =>
    api.post<RenderedEmail>(ENDPOINTS.emailTemplates.preview(key), payload),

  update: (key: string, payload: UpdateEmailTemplatePayload) =>
    api.patch<EmailTemplate>(ENDPOINTS.emailTemplates.byKey(key), payload),

  restore: (key: string, version: number) =>
    api.post<EmailTemplate>(ENDPOINTS.emailTemplates.restore(key), { version }),

  reset: (key: string) => api.post<EmailTemplate>(ENDPOINTS.emailTemplates.reset(key)),
};

// ---------------------------------------------------------------------------
// Email queue
// ---------------------------------------------------------------------------

export const EMAIL_QUEUE_STATUSES = [
  "pending",
  "sending",
  "sent",
  "failed",
  "cancelled",
] as const;
export type EmailQueueStatus = (typeof EMAIL_QUEUE_STATUSES)[number];

export type QueuedEmail = {
  email_queue_id: string;
  template_key?: string | null;
  to_email: string;
  to_name?: string | null;
  subject: string;
  body_html: string;
  status: EmailQueueStatus;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error?: string | null;
  sent_at?: string | null;
  related_user_id?: string | null;
  created_at: string;
  updated_at: string;
};

/** Counts per status. Always carries all five keys, zero-filled. */
export type EmailQueueStats = Record<EmailQueueStatus, number>;

export type EmailQueueQuery = {
  page?: number;
  limit?: number;
  search?: string;
  status?: EmailQueueStatus;
  template_key?: string;
};

function queueQueryString(query: EmailQueueQuery): string {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.limit) params.set("limit", String(query.limit));
  if (query.search?.trim()) params.set("search", query.search.trim());
  if (query.status) params.set("status", query.status);
  if (query.template_key) params.set("template_key", query.template_key);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const emailQueueApi = {
  list: (query: EmailQueueQuery = {}) =>
    api.get<PaginatedResult<QueuedEmail>>(
      `${ENDPOINTS.emailQueue.base}${queueQueryString(query)}`,
    ),

  stats: () => api.get<EmailQueueStats>(ENDPOINTS.emailQueue.stats),

  get: (id: string) => api.get<QueuedEmail>(ENDPOINTS.emailQueue.byId(id)),

  /** 409 unless the row is `failed` or `cancelled`. Requires email-queue.manage. */
  retry: (id: string) => api.post<QueuedEmail>(ENDPOINTS.emailQueue.retry(id)),

  /** 409 unless the row is `pending` or `failed`. Requires email-queue.manage. */
  cancel: (id: string) => api.post<QueuedEmail>(ENDPOINTS.emailQueue.cancel(id)),
};
