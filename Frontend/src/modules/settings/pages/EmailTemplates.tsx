// ============================================================================
// /settings/email-templates — the eleven transactional templates.
//
// What is being edited here is a *fragment*, not a document. The renderer wraps
// every body in a shared branded shell — logo, colours, address, footer, all
// pulled from Company Settings at send time. That is why the editor shows raw
// HTML without a <html> wrapper and why the preview looks considerably richer
// than the textarea: pasting a full document in here would nest one inside the
// other.
//
// Preview is a server round-trip rather than a client-side render. The
// substitution, the HTML-escaping of every value, and the branding injection all
// live in TemplateRendererService; reimplementing any of it in the browser would
// produce a preview that differs from what the recipient receives — and an
// escaping bug in the copy would be invisible precisely where it matters.
//
// The rendered HTML is shown inside a sandboxed <iframe srcDoc>. Injecting it
// into this document would run the template's markup with the app's origin,
// cookies and DOM in reach; the sandbox gives an accurate visual with none of
// that authority.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Code2,
  Eye,
  History,
  Loader2,
  Mail,
  RotateCcw,
  Save,
  Undo2,
  X,
} from "lucide-react";

import SettingsLayout from "@/modules/settings/pages/SettingsLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useAuth } from "@/app/providers/AuthContext";
import { useToast } from "@/app/providers/ToastContext";
import { ApiError } from "@/lib/apiClient";
import {
  emailTemplatesApi,
  type EmailTemplate,
  type EmailTemplateVersion,
  type PlaceholderDescriptor,
  type RenderedEmail,
  type UpdateEmailTemplatePayload,
} from "@/modules/settings/api/mailApi";

const GROUP_LABELS: Record<PlaceholderDescriptor["group"], string> = {
  company: "Company",
  employee: "Employee",
  event: "This email",
};

const GROUP_ORDER: PlaceholderDescriptor["group"][] = ["company", "employee", "event"];

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function EmailTemplatesPage() {
  const status = useBackendStatus();
  const { hasPermission } = useAuth();
  const { showSuccess, showError } = useToast();

  const canUpdate = hasPermission("email-templates.update");
  // Coarse role gate on the route, precise permission gate here: a 403 rendered
  // as an empty error box reads like an outage rather than a missing grant.
  const canView = hasPermission("email-templates.view");

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [placeholders, setPlaceholders] = useState<PlaceholderDescriptor[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [enabled, setEnabled] = useState(true);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [preview, setPreview] = useState<RenderedEmail | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const [versions, setVersions] = useState<EmailTemplateVersion[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsLoading, setVersionsLoading] = useState(false);

  const selected = useMemo(
    () => templates.find((t) => t.template_key === selectedKey) ?? null,
    [templates, selectedKey],
  );

  const dirty = useMemo(() => {
    if (!selected) return false;
    return (
      subject !== selected.subject ||
      bodyHtml !== selected.body_html ||
      enabled !== selected.enabled
    );
  }, [selected, subject, bodyHtml, enabled]);

  /** Load the editor fields from a template row. */
  const hydrate = useCallback((template: EmailTemplate) => {
    setSubject(template.subject);
    setBodyHtml(template.body_html);
    setEnabled(template.enabled);
    setPreview(null);
    setVersionsOpen(false);
  }, []);

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [list, tokens] = await Promise.all([
        emailTemplatesApi.list(),
        // The token picker is a convenience; losing it must not cost the editor.
        emailTemplatesApi.placeholders().catch(() => [] as PlaceholderDescriptor[]),
      ]);
      setTemplates(list);
      setPlaceholders(tokens);
      setSelectedKey((prev) => {
        const stillThere = prev && list.some((t) => t.template_key === prev);
        return stillThere ? prev : (list[0]?.template_key ?? null);
      });
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Couldn't load the email templates.",
      );
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void load();
  }, [load]);

  // Re-hydrate whenever the selection changes, or the selected row is replaced
  // by a save/restore/reset response.
  useEffect(() => {
    if (selected) hydrate(selected);
  }, [selected, hydrate]);

  /** Replace one row in place; the selection and scroll position survive. */
  const replaceTemplate = useCallback((updated: EmailTemplate) => {
    setTemplates((prev) =>
      prev.map((t) => (t.template_key === updated.template_key ? updated : t)),
    );
  }, []);

  const handleSave = async () => {
    if (!selected) return;

    if (!subject.trim()) {
      showError("Subject can't be empty.");
      return;
    }
    if (!bodyHtml.trim()) {
      showError("Body can't be empty.");
      return;
    }

    // Diffed so a save that only flips `enabled` doesn't cut a content version.
    const payload: UpdateEmailTemplatePayload = {};
    if (subject !== selected.subject) payload.subject = subject;
    if (bodyHtml !== selected.body_html) payload.body_html = bodyHtml;
    if (enabled !== selected.enabled) payload.enabled = enabled;

    if (Object.keys(payload).length === 0) {
      showSuccess("Nothing to save.", "No changes were made.");
      return;
    }

    setSaving(true);
    try {
      const updated = await emailTemplatesApi.update(selected.template_key, payload);
      replaceTemplate(updated);
      showSuccess(
        "Template saved.",
        updated.version !== selected.version ? `Now at version ${updated.version}.` : undefined,
      );
    } catch (err) {
      showError(
        err instanceof ApiError ? err.message : "Couldn't save the template.",
        "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    if (!selected) return;
    setPreviewing(true);
    try {
      // The unsaved draft is sent, so the preview reflects what is on screen
      // rather than what was last persisted.
      const rendered = await emailTemplatesApi.preview(selected.template_key, {
        subject,
        body_html: bodyHtml,
      });
      setPreview(rendered);
    } catch (err) {
      showError(err instanceof ApiError ? err.message : "Couldn't render the preview.");
    } finally {
      setPreviewing(false);
    }
  };

  const handleLoadVersions = async () => {
    if (!selected) return;
    if (versionsOpen) {
      setVersionsOpen(false);
      return;
    }
    setVersionsLoading(true);
    try {
      setVersions(await emailTemplatesApi.versions(selected.template_key));
      setVersionsOpen(true);
    } catch (err) {
      showError(err instanceof ApiError ? err.message : "Couldn't load the version history.");
    } finally {
      setVersionsLoading(false);
    }
  };

  const handleRestore = async (version: number) => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await emailTemplatesApi.restore(selected.template_key, version);
      replaceTemplate(updated);
      setVersionsOpen(false);
      showSuccess(`Restored version ${version}.`, `Saved as version ${updated.version}.`);
    } catch (err) {
      showError(err instanceof ApiError ? err.message : "Couldn't restore that version.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await emailTemplatesApi.reset(selected.template_key);
      replaceTemplate(updated);
      showSuccess("Template reset to the shipped default.");
    } catch (err) {
      showError(err instanceof ApiError ? err.message : "Couldn't reset the template.");
    } finally {
      setSaving(false);
    }
  };

  /** Append a token at the end of the body — no cursor tracking, just a shortcut. */
  const insertToken = (token: string) => {
    if (!canUpdate) return;
    setBodyHtml((prev) => (prev ? `${prev}${token}` : token));
  };

  const groupedPlaceholders = useMemo(() => {
    const groups = new Map<PlaceholderDescriptor["group"], PlaceholderDescriptor[]>();
    for (const p of placeholders) {
      const list = groups.get(p.group);
      if (list) list.push(p);
      else groups.set(p.group, [p]);
    }
    return GROUP_ORDER.filter((g) => groups.has(g)).map((g) => ({
      group: g,
      items: groups.get(g) ?? [],
    }));
  }, [placeholders]);

  return (
    <SettingsLayout activeTab="/settings/email-templates">
      <BackendStatusBanner status={status} />

      {!canView ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          <p className="font-semibold">You don't have access to the email templates.</p>
          <p className="mt-0.5">
            Viewing templates requires the{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">email-templates.view</code>{" "}
            permission. Ask an administrator to grant it from Settings → Roles.
          </p>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 rounded-2xl bg-white p-10 text-sm text-gray-400 shadow-sm ring-1 ring-gray-100">
          <Loader2 size={16} className="animate-spin" />
          Loading email templates…
        </div>
      ) : loadError || templates.length === 0 ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700"
        >
          {loadError ?? "No email templates are configured."}{" "}
          <button type="button" onClick={() => void load()} className="font-semibold underline">
            Try again
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[16rem_1fr]">
          {/* ---- Template list ---- */}
          <aside className="rounded-2xl bg-white p-2 shadow-sm ring-1 ring-gray-100 lg:sticky lg:top-4 lg:self-start">
            <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Templates ({templates.length})
            </p>
            <nav className="max-h-[60vh] space-y-0.5 overflow-y-auto lg:max-h-[70vh]">
              {templates.map((template) => {
                const active = template.template_key === selectedKey;
                return (
                  <button
                    key={template.template_key}
                    type="button"
                    onClick={() => setSelectedKey(template.template_key)}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                      active
                        ? "bg-brand-light/60 font-medium text-gray-900"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <Mail size={14} className="shrink-0 text-gray-400" />
                    <span className="min-w-0 flex-1 truncate">{template.name}</span>
                    {!template.enabled && (
                      <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                        Off
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* ---- Editor ---- */}
          {selected && (
            <div className="min-w-0 space-y-5">
              <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 sm:p-6">
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-gray-900">{selected.name}</h2>
                    <p className="mt-0.5 text-sm text-gray-500">
                      {selected.description || "No description."}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                      <code className="rounded bg-gray-100 px-1.5 py-0.5">
                        {selected.template_key}
                      </code>
                      <span>Version {selected.version}</span>
                      <span>Updated {formatDateTime(selected.updated_at)}</span>
                    </p>
                  </div>

                  <label
                    className={`flex shrink-0 items-center gap-2 text-sm ${
                      canUpdate ? "text-gray-700" : "text-gray-400"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={!canUpdate}
                      onChange={(e) => setEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/60 disabled:cursor-not-allowed"
                    />
                    Enabled
                  </label>
                </div>

                {!enabled && (
                  <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
                    While this template is disabled its trigger is skipped silently — the action
                    that would have sent it still succeeds, no email goes out.
                  </p>
                )}

                <label className="mb-4 block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">Subject</span>
                  <input
                    type="text"
                    value={subject}
                    disabled={!canUpdate}
                    onChange={(e) => setSubject(e.target.value)}
                    maxLength={255}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:ring-2 focus:ring-brand/60 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                    <Code2 size={13} className="text-gray-400" />
                    Body (HTML fragment)
                  </span>
                  <textarea
                    value={bodyHtml}
                    disabled={!canUpdate}
                    onChange={(e) => setBodyHtml(e.target.value)}
                    rows={16}
                    spellCheck={false}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 font-mono text-xs leading-relaxed text-gray-900 outline-none transition focus:ring-2 focus:ring-brand/60 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                  />
                  <span className="mt-1 block text-xs text-gray-400">
                    The header, logo, colours and footer are applied automatically from Company
                    Settings — write only the message body.
                  </span>
                </label>

                {/* ---- Actions ---- */}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handlePreview()}
                      disabled={previewing}
                      className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                    >
                      {previewing ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Eye size={14} />
                      )}
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleLoadVersions()}
                      disabled={versionsLoading}
                      className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                    >
                      {versionsLoading ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <History size={14} />
                      )}
                      History
                    </button>
                  </div>

                  {canUpdate && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleReset()}
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
                      >
                        <RotateCcw size={14} />
                        Reset to default
                      </button>
                      {dirty && (
                        <button
                          type="button"
                          onClick={() => hydrate(selected)}
                          disabled={saving}
                          className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
                        >
                          <Undo2 size={14} />
                          Discard
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={saving || !dirty}
                        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand-dark px-5 py-2 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Save
                      </button>
                    </div>
                  )}
                </div>
              </section>

              {/* ---- Version history ---- */}
              {versionsOpen && (
                <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 sm:p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-900">Version History</h3>
                    <button
                      type="button"
                      onClick={() => setVersionsOpen(false)}
                      className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100"
                      aria-label="Close version history"
                    >
                      <X size={15} />
                    </button>
                  </div>

                  {versions.length === 0 ? (
                    <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
                      No earlier versions — this template hasn't been edited yet.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {versions.map((version) => (
                        <li
                          key={version.email_template_version_id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
                              Version {version.version}
                              {version.version === selected.version && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                                  <Check size={9} /> Current
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-gray-500">
                              {version.subject}
                            </p>
                            <p className="mt-0.5 text-xs text-gray-400">
                              {formatDateTime(version.created_at)}
                              {version.changed_by_email && ` · ${version.changed_by_email}`}
                            </p>
                          </div>
                          {canUpdate && version.version !== selected.version && (
                            <button
                              type="button"
                              onClick={() => void handleRestore(version.version)}
                              disabled={saving}
                              className="shrink-0 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                            >
                              Restore
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {/* ---- Preview ---- */}
              {preview && (
                <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 sm:p-6">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900">Preview</h3>
                      <p className="mt-0.5 truncate text-xs text-gray-500">
                        Subject: {preview.subject}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreview(null)}
                      className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100"
                      aria-label="Close preview"
                    >
                      <X size={15} />
                    </button>
                  </div>

                  {/* Sandboxed with no allow-* flags: the frame gets a unique opaque
                  origin and cannot run script, submit forms or navigate the parent.
                  Rendering template HTML inline would give it this app's origin. */}
                  <iframe
                    title="Email preview"
                    srcDoc={preview.html}
                    sandbox=""
                    className="h-[32rem] w-full rounded-xl border border-gray-200 bg-white"
                  />
                  <p className="mt-2 text-xs text-gray-400">
                    Rendered by the server with sample data and your company branding — this is
                    what recipients receive.
                  </p>
                </section>
              )}

              {/* ---- Placeholders ---- */}
              {groupedPlaceholders.length > 0 && (
                <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 sm:p-6">
                  <h3 className="text-sm font-semibold text-gray-900">Available Placeholders</h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {canUpdate
                      ? "Click a token to append it to the body. Values are HTML-escaped when the email is rendered."
                      : "Values are HTML-escaped when the email is rendered."}
                  </p>

                  <div className="mt-4 space-y-4">
                    {groupedPlaceholders.map(({ group, items }) => (
                      <div key={group}>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                          {GROUP_LABELS[group]}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {items.map((placeholder) => (
                            <button
                              key={placeholder.key}
                              type="button"
                              onClick={() => insertToken(placeholder.token)}
                              disabled={!canUpdate}
                              title={canUpdate ? "Append to body" : undefined}
                              className="rounded-full bg-gray-100 px-2.5 py-1 font-mono text-xs text-gray-600 transition hover:bg-brand-light/60 hover:text-gray-900 disabled:cursor-default disabled:hover:bg-gray-100 disabled:hover:text-gray-600"
                            >
                              {placeholder.token}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      )}
    </SettingsLayout>
  );
}
