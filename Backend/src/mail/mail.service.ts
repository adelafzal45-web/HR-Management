import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { EmailQueue } from './entities/email-queue.entity';
import { EmailTemplateService } from './email-template.service';
import { MailTransportService } from './mail-transport.service';
import { SmtpSettingsService } from './smtp-settings.service';
import {
  TemplateRendererService,
  type TemplateContext,
} from './template-renderer.service';
import { AuditService, type AuditActor } from '../audit/audit.service';

export interface EnqueueInput {
  templateKey: string;
  to: string;
  toName?: string | null;
  context?: TemplateContext;
  relatedUserId?: string | null;
}

/** Why an enqueue did not produce a queued row. Useful in tests and logs. */
export type EnqueueOutcome =
  | { queued: true; emailQueueId: string }
  | {
      queued: false;
      reason: 'no-recipient' | 'template-missing' | 'template-disabled' | 'render-failed';
    };

/**
 * The mail API the rest of the application calls.
 *
 * One method matters: `enqueue`. Everything about it is shaped by a single rule —
 * **an email must never be able to fail the operation that triggered it.**
 * Creating an employee is the user's actual intent; notifying them is a
 * side-effect. So every failure mode here (missing template, disabled template,
 * unrenderable body, unreachable database) is logged and swallowed, and the
 * caller gets an outcome object rather than an exception.
 *
 * Rendering happens at enqueue time, not at send time. Two consequences, both
 * wanted: the stored row is exactly what the recipient will receive (so the log
 * is evidence, not a guess), and a template edited after enqueue does not
 * retroactively rewrite mail already in flight.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @InjectRepository(EmailQueue)
    private readonly queue: Repository<EmailQueue>,
    private readonly templates: EmailTemplateService,
    private readonly renderer: TemplateRendererService,
    private readonly transport: MailTransportService,
    private readonly smtpSettings: SmtpSettingsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Renders a template and queues it for delivery.
   *
   * Deliberately does NOT check whether SMTP is configured. A row queued while
   * the mail server is down is the correct outcome — the processor will send it
   * once configuration is fixed. Refusing to queue would silently discard the
   * welcome email of every employee created during an outage.
   */
  async enqueue(input: EnqueueInput): Promise<EnqueueOutcome> {
    if (!input.to) {
      this.logger.warn(
        `Skipped "${input.templateKey}": no recipient address for user ${input.relatedUserId ?? '-'}.`,
      );
      return { queued: false, reason: 'no-recipient' };
    }

    try {
      const template = await this.templates.findByKeyOrNull(input.templateKey);

      if (!template) {
        // A missing template means a code/migration mismatch, not a user error —
        // hence error level. It still must not throw into the caller's flow.
        this.logger.error(
          `Email template "${input.templateKey}" does not exist; nothing queued.`,
        );
        return { queued: false, reason: 'template-missing' };
      }

      if (!template.enabled) {
        this.logger.log(
          `Template "${input.templateKey}" is disabled; skipping send to ${input.to}.`,
        );
        return { queued: false, reason: 'template-disabled' };
      }

      const rendered = await this.renderer.render(
        template.subject,
        template.body_html,
        input.context ?? {},
      );

      const row = await this.queue.save(
        this.queue.create({
          template_key: template.template_key,
          to_email: input.to,
          to_name: input.toName ?? null,
          subject: rendered.subject,
          body_html: rendered.html,
          status: 'pending',
          related_user_id: input.relatedUserId ?? null,
        }),
      );

      this.logger.log(
        `Queued "${input.templateKey}" to ${input.to} (${row.email_queue_id}).`,
      );

      return { queued: true, emailQueueId: row.email_queue_id };
    } catch (error) {
      this.logger.error(
        `Failed to queue "${input.templateKey}" to ${input.to}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      return { queued: false, reason: 'render-failed' };
    }
  }

  /**
   * Queues the same template to many recipients.
   *
   * Sequential rather than `Promise.all`: each iteration renders, which reads
   * company settings, and firing a hundred concurrent renders to save a few
   * hundred milliseconds on an admin action is not a trade worth making.
   */
  async enqueueMany(inputs: EnqueueInput[]): Promise<EnqueueOutcome[]> {
    const outcomes: EnqueueOutcome[] = [];
    for (const input of inputs) {
      outcomes.push(await this.enqueue(input));
    }
    return outcomes;
  }

  /**
   * Sends a test message synchronously, bypassing the queue.
   *
   * Bypassing is the point: an admin who clicks "Test" needs the actual SMTP
   * error — wrong port, bad credentials, TLS mismatch — in the HTTP response. A
   * queued test would return 200 and fail two minutes later in a log the admin
   * is not watching, which would actively encourage shipping a broken
   * configuration.
   *
   * `verify()` runs first so an authentication failure is reported as such rather
   * than as a generic send error.
   */
  async sendTest(to: string, actor?: AuditActor): Promise<{ message: string }> {
    const rendered = await this.renderer.render(
      'Test email from {{company_name}}',
      TEST_EMAIL_BODY,
      { event_time: new Date().toLocaleString('en-GB') },
    );

    try {
      await this.transport.verify();
      await this.transport.send({
        to,
        subject: rendered.subject,
        html: rendered.html,
      });

      await this.smtpSettings.recordTestResult(true);
      await this.audit.record({
        actor: actor ?? {},
        action: 'email.settings.test',
        entityType: 'smtp_settings',
        entityId: '1',
        after: { to, result: 'ok' },
      });

      return { message: `Test email sent to ${to}.` };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);

      await this.smtpSettings.recordTestResult(false, detail);
      await this.audit.record({
        actor: actor ?? {},
        action: 'email.settings.test',
        entityType: 'smtp_settings',
        entityId: '1',
        after: { to, result: 'failed', error: detail },
      });

      // Rethrown for the controller to translate. The message is the SMTP
      // server's own, which is the only diagnostically useful thing here.
      throw error;
    }
  }
}

/**
 * Body for the test message. A literal rather than a database template: the
 * whole point of a test is to exercise SMTP, so it must work even when the
 * template table is empty or an admin has broken every template in it.
 */
const TEST_EMAIL_BODY = `
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#1f1f1f;font-weight:600;">SMTP is working</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4a4a4a;">
  This is a test message from your HR Management system. If you are reading it in
  your inbox, the SMTP configuration is correct and the application can deliver
  mail.
</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4a4a4a;">
  Sent at {{event_time}}.
</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:#8a8a8a;">
  No action is required. You can safely delete this message.
</p>
`;
