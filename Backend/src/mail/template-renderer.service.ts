import { Injectable, Logger } from '@nestjs/common';

import { CompanySettingsService } from '../company-settings/company-settings.service';
import { EMAIL_SHELL_HTML } from './templates/default-templates';

/**
 * The complete set of placeholders a template may use.
 *
 * An allow-list, not an open substitution map. Two reasons:
 *
 *   1. An admin editing a template gets a definitive list of what is available,
 *      instead of discovering by trial that `{{salary}}` renders as literal text.
 *   2. Nothing outside this list can ever be interpolated, so a future context
 *      object that happens to carry a sensitive field cannot leak it into an
 *      email by a template author guessing the key name.
 */
export const ALLOWED_PLACEHOLDERS = [
  // Branding, resolved from Company Settings
  'company_name',
  'company_address',
  'company_website',
  'company_phone',
  'support_email',
  'logo_url',
  'primary_color',
  'year',
  // Recipient
  'employee_name',
  'employee_first_name',
  'employee_id',
  'employee_email',
  'previous_email',
  'department',
  'designation',
  'joining_date',
  // Event / action
  'reset_link',
  'login_url',
  'profile_url',
  'expiry_minutes',
  'event_time',
  'actor_name',
  'changed_fields',
  // Appraisal
  'dashboard_url',
  'team_lead_name',
  'reviewer_name',
  'form_name',
  'review_period',
  'review_status',
  'review_action',
  'review_comment',
  'pending_count',
  'pending_employees',
  'shift_end_time',
  'evaluation_date',
  // Leave
  'leave_type',
  'start_date',
  'end_date',
  'days_count',
  'action',
  'total_days',
  'remaining_balance',
  'decision_reason',
] as const;

export type PlaceholderKey = (typeof ALLOWED_PLACEHOLDERS)[number];

/** Values supplied per-send. Branding keys are filled in by the renderer. */
export type TemplateContext = Partial<
  Record<PlaceholderKey, string | number | null | undefined>
>;

/**
 * Placeholders whose value is a URL rather than text.
 *
 * These are the dangerous ones. A `{{reset_link}}` that an attacker can steer
 * turns a legitimately branded, correctly-signed company email into a
 * credible phishing page — the recipient has every reason to trust it. So these
 * are validated as absolute http(s) URLs and escaped for attribute context;
 * anything else is dropped rather than rendered.
 */
const URL_PLACEHOLDERS = new Set<PlaceholderKey>([
  'reset_link',
  'login_url',
  'profile_url',
  'logo_url',
  'company_website',
]);

/** The base URL the frontend is served from, used to build links in emails. */
export const APP_BASE_URL = (
  process.env.APP_BASE_URL ?? 'http://localhost:5173'
).replace(/\/+$/, '');

/**
 * Escapes text for HTML body/attribute context.
 *
 * Every substituted value goes through this. An employee whose surname is
 * `<script>` would otherwise inject that script into the inbox of every
 * recipient of an "Account Created" notification — stored XSS with an email
 * client as the sink. The single-quote and backtick cases matter because these
 * values land inside inline `style="..."` and `href="..."` attributes.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

/**
 * Validates and escapes a URL for an href.
 *
 * Rejects anything that is not absolute http(s) — which is what blocks
 * `javascript:` and `data:` URIs from reaching an anchor. Returns null when the
 * value is unusable so the caller can substitute nothing rather than a
 * half-formed link.
 */
export function safeUrl(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  return escapeHtml(parsed.toString());
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

@Injectable()
export class TemplateRendererService {
  private readonly logger = new Logger(TemplateRendererService.name);

  constructor(private readonly companySettings: CompanySettingsService) {}

  /**
   * Reads branding from Company Settings.
   *
   * Only the fields that actually exist on the CompanySettings entity are used —
   * `company_name`, `logo_url`, `email`, `phone`, `address`, `website`,
   * `primary_color`. `support_email` maps to the company contact email, since
   * that is the address the organisation already publishes for contact and there
   * is no separate support-address column to invent a value for.
   *
   * A failure here degrades to sensible defaults rather than blocking the send:
   * an email that goes out with a plain header beats an email that never goes
   * out because a settings row was missing.
   */
  private async brandingContext(): Promise<Record<string, string>> {
    try {
      const settings = await this.companySettings.get();
      return {
        company_name:
          settings.company_name || settings.legal_company_name || 'HRMS',
        company_address: settings.address ?? '',
        company_website: settings.website ?? '',
        company_phone: settings.phone ?? '',
        support_email: settings.email ?? '',
        logo_url: this.absoluteLogoUrl(settings.logo_url),
        primary_color: this.safeColor(settings.primary_color),
        year: String(new Date().getFullYear()),
      };
    } catch (error) {
      this.logger.warn(
        `Could not read company settings for email branding; using defaults. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        company_name: 'HRMS',
        company_address: '',
        company_website: '',
        company_phone: '',
        support_email: '',
        logo_url: '',
        primary_color: '#F1B344',
        year: String(new Date().getFullYear()),
      };
    }
  }

  /**
   * Company Settings stores a server-relative logo path. An email client has no
   * concept of "this API's origin", so a relative path renders as a broken
   * image — it has to be made absolute against the public API base.
   */
  private absoluteLogoUrl(logoUrl?: string | null): string {
    if (!logoUrl) return '';
    if (/^https?:\/\//i.test(logoUrl)) return logoUrl;

    const apiBase = (
      process.env.API_PUBLIC_URL ?? 'http://localhost:3000'
    ).replace(/\/+$/, '');
    return `${apiBase}${logoUrl.startsWith('/') ? '' : '/'}${logoUrl}`;
  }

  /**
   * Constrains the theme colour to a hex literal.
   *
   * `primary_color` is interpolated into inline `style` attributes. Without this
   * check a value like `red;background:url(...)` would break out of the property
   * it was meant to set — CSS injection into a branded email.
   */
  private safeColor(color?: string | null): string {
    const fallback = '#F1B344';
    if (!color) return fallback;
    return /^#[0-9a-f]{3,8}$/i.test(color.trim()) ? color.trim() : fallback;
  }

  /**
   * Substitutes `{{placeholder}}` tokens.
   *
   * Deliberately does no escaping of its own. Every value reaching this method
   * is already safe: caller-supplied context has been through
   * `sanitizeContext`, and the structural fragments (`email_body`, `logo_block`,
   * `footer_contact_block`) are markup this service built itself. Escaping here
   * would double-encode the former and render the latter as visible tags. The
   * invariant is therefore "sanitize on the way in, never on the way out" —
   * which keeps exactly one place to audit.
   *
   * Unknown placeholders are left as-is rather than blanked, so a typo in a
   * template is visible in the preview instead of silently producing an empty
   * sentence that reads as if a value were legitimately missing.
   */
  private substitute(template: string, values: Record<string, string>): string {
    return template.replace(
      /\{\{\s*([a-z0-9_]+)\s*\}\}/gi,
      (match, rawKey: string) => {
        const key = rawKey.toLowerCase();
        return Object.prototype.hasOwnProperty.call(values, key)
          ? values[key]
          : match;
      },
    );
  }

  /**
   * Normalises a caller-supplied context into escaped, substitution-ready
   * strings. This is the single choke point where untrusted values are made
   * safe — every render path goes through it.
   */
  private sanitizeContext(context: TemplateContext): Record<string, string> {
    const safe: Record<string, string> = {};

    for (const key of ALLOWED_PLACEHOLDERS) {
      const value = context[key];
      if (value === undefined || value === null || value === '') {
        continue;
      }

      const asString = String(value);

      if (URL_PLACEHOLDERS.has(key)) {
        const url = safeUrl(asString);
        if (url === null) {
          this.logger.warn(
            `Dropped placeholder {{${key}}}: "${asString.slice(0, 80)}" is not a valid absolute http(s) URL.`,
          );
          continue;
        }
        safe[key] = url;
        continue;
      }

      safe[key] = escapeHtml(asString);
    }

    return safe;
  }

  /** The shell's logo image, or nothing when no logo is configured. */
  private logoBlock(logoUrl: string, companyName: string): string {
    if (!logoUrl) return '';
    return `<img src="${logoUrl}" alt="${companyName}" width="120" style="display:block;margin:0 auto 12px;max-width:180px;height:auto;border:0;" />`;
  }

  /** Footer contact lines, omitting rows with no configured value. */
  private footerContactBlock(values: Record<string, string>): string {
    const lines: string[] = [];

    if (values.company_address) {
      lines.push(
        `<div style="margin-bottom:4px;">${values.company_address}</div>`,
      );
    }

    const inline: string[] = [];
    if (values.company_phone) inline.push(values.company_phone);
    if (values.support_email) {
      inline.push(
        `<a href="mailto:${values.support_email}" style="color:#8a8a8a;text-decoration:underline;">${values.support_email}</a>`,
      );
    }
    if (values.company_website) {
      inline.push(
        `<a href="${values.company_website}" style="color:#8a8a8a;text-decoration:underline;">${values.company_website}</a>`,
      );
    }
    if (inline.length) {
      lines.push(`<div>${inline.join(' &nbsp;·&nbsp; ')}</div>`);
    }

    return lines.join('\n');
  }

  /**
   * Renders a subject + body fragment into a complete branded email.
   *
   * Order matters: the body fragment is substituted first, then inserted into
   * the shell, then the shell's own branding tokens are resolved. Doing it the
   * other way round would run substitution over content that already contained
   * user-supplied text, giving a placeholder-looking employee name a second pass
   * at being interpreted.
   */
  async render(
    subjectTemplate: string,
    bodyTemplate: string,
    context: TemplateContext = {},
  ): Promise<RenderedEmail> {
    const branding = await this.brandingContext();

    // Branding is escaped through the same path as caller context; a company
    // name containing an ampersand is as capable of breaking markup as an
    // employee name is.
    const values = {
      ...this.sanitizeContext(branding as TemplateContext),
      ...this.sanitizeContext(context),
    };

    // Defaults for links every template can reference, so a template author
    // never has to know the deployment's URLs.
    values.login_url ??= escapeHtml(`${APP_BASE_URL}/login`);
    values.profile_url ??= escapeHtml(`${APP_BASE_URL}/profile`);
    values.primary_color ??= '#F1B344';
    values.year ??= String(new Date().getFullYear());

    const subject = this.stripTags(this.substitute(subjectTemplate, values));
    const body = this.substitute(bodyTemplate, values);

    const html = this.substitute(EMAIL_SHELL_HTML, {
      ...values,
      email_subject: escapeHtml(subject),
      email_body: body,
      logo_block: this.logoBlock(
        values.logo_url ?? '',
        values.company_name ?? '',
      ),
      footer_contact_block: this.footerContactBlock(values),
    });

    return { subject, html };
  }

  /**
   * A subject line is plain text in every mail client. Escaped entities would
   * show up literally as "&amp;" in the inbox, so tags are removed and the
   * common entities the escaper introduced are turned back into characters.
   */
  private stripTags(value: string): string {
    return value
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim()
      .slice(0, 255);
  }

  /**
   * Representative values for the template-preview screen, so an admin sees a
   * realistic rendering instead of raw `{{tokens}}`.
   */
  sampleContext(): TemplateContext {
    return {
      employee_name: 'Ayesha Khan',
      employee_first_name: 'Ayesha',
      employee_id: 'TC-EMP-001',
      employee_email: 'ayesha.khan@example.com',
      previous_email: 'a.khan@example.com',
      department: 'Engineering',
      designation: 'Senior Software Engineer',
      joining_date: '15 Jan 2024',
      reset_link: `${APP_BASE_URL}/reset-password?token=sample-preview-token`,
      expiry_minutes: 60,
      event_time: new Date().toLocaleString('en-GB'),
      actor_name: 'HR Administrator',
      changed_fields: 'Phone number, Emergency contact',
    };
  }
}
