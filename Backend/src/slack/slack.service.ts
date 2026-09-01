import { Injectable, Logger } from '@nestjs/common';

import { SlackSettingsService } from './slack-settings.service';
import { AuditService, type AuditActor } from '../audit/audit.service';

/** Shape of a chat.postMessage reply we care about. Slack sends much more. */
interface SlackPostMessageResponse {
  ok: boolean;
  error?: string;
  warning?: string;
  channel?: string;
  ts?: string;
}

/** Result of a successful post, handed back to the caller. */
export interface SlackSendResult {
  channel: string;
  ts?: string;
}

/** Where a message is going and what it says. */
export interface SlackMessageInput {
  /** Overrides the configured default channel for this one message. */
  channel?: string;
  text: string;
}

const POST_MESSAGE_URL = 'https://slack.com/api/chat.postMessage';

/**
 * Short, human-readable hints for the Slack error codes an admin is most likely
 * to hit while wiring this up. The raw code is always kept — this only appends
 * context, so the surfaced message stays diagnostic rather than being replaced.
 */
const ERROR_HINTS: Record<string, string> = {
  invalid_auth: 'the bot token was rejected',
  not_authed: 'no bot token was sent',
  token_revoked: 'the bot token has been revoked',
  account_inactive: "the token's workspace is inactive",
  channel_not_found: 'the channel does not exist or the bot cannot see it',
  not_in_channel: 'the bot is not a member of the channel — invite it first',
  is_archived: 'the channel is archived',
  msg_too_long: 'the message text is too long',
  no_text: 'the message had no text',
  rate_limited: 'Slack is rate-limiting requests — try again shortly',
  missing_scope: 'the bot token lacks the chat:write scope',
};

function describeSlackError(body: SlackPostMessageResponse | null): string {
  const code = body?.error;
  if (!code) return 'Slack rejected the message for an unknown reason.';
  const hint = ERROR_HINTS[code];
  return hint ? `${code} (${hint})` : code;
}

/**
 * The reusable Slack transport.
 *
 * `sendMessage` is the one method the rest of the application calls (the
 * birthday/anniversary announcer #2 and the appraisal reminder #3 will inject
 * this service and call it). It posts synchronously via the Slack Web API using
 * Node's global `fetch` — no new dependency, no queue.
 *
 * Deliberately does NOT consult `enabled`: like SMTP's transport, this is the
 * raw wire and the test button must be able to exercise it before an admin flips
 * the switch on. Callers that should respect the master switch consult
 * `SlackSettingsService.validate()` first.
 */
@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);

  constructor(
    private readonly slackSettings: SlackSettingsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Posts one message to a channel.
   *
   * Slack's chat.postMessage returns HTTP 200 even for logical failures (bad
   * token, unknown channel, bot not in channel), carrying `{ ok: false, error }`
   * in the body — so `res.ok` alone is not success. The body's `ok` is
   * authoritative, and its `error` code is surfaced verbatim (with a hint) the
   * way the SMTP path surfaces the mail server's own message.
   *
   * Throws on any failure so the caller decides how to react.
   */
  async sendMessage(input: SlackMessageInput): Promise<SlackSendResult> {
    const config = await this.slackSettings.getEffective();

    if (!config.token) {
      throw new Error('No Slack bot token is configured.');
    }

    const channel = input.channel?.trim() || config.default_channel;
    if (!channel) {
      throw new Error(
        'No Slack channel specified and no default channel is configured.',
      );
    }

    let response: Response;
    try {
      response = await fetch(POST_MESSAGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `Bearer ${config.token}`,
        },
        body: JSON.stringify({ channel, text: input.text }),
      });
    } catch (error) {
      // Network-level failure (DNS, TLS, offline) — never carries the token.
      throw new Error(
        `Could not reach Slack: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const body = (await response
      .json()
      .catch(() => null)) as SlackPostMessageResponse | null;

    if (!response.ok) {
      // A genuine transport-level status (e.g. 429/5xx). Include the body's
      // error code when Slack still populated one.
      throw new Error(
        `Slack API returned HTTP ${response.status}: ${describeSlackError(body)}`,
      );
    }

    if (!body || body.ok !== true) {
      throw new Error(describeSlackError(body));
    }

    return { channel: body.channel ?? channel, ts: body.ts };
  }

  /**
   * Posts a message, but only when Slack is configured and the master switch is
   * on. Unlike `sendMessage` (the raw wire, which the test button must exercise
   * regardless), this is the entry point for the automated announcers (#2
   * birthday/anniversary, #3 appraisal reminders): a disabled or half-configured
   * integration silently no-ops instead of throwing. Returns whether it sent
   * and, if not, the reason straight from `SlackSettingsService.validate()`.
   */
  async postIfEnabled(
    input: SlackMessageInput,
  ): Promise<{ sent: boolean; reason?: string; channel?: string }> {
    const reason = await this.slackSettings.validate();
    if (reason) return { sent: false, reason };

    const result = await this.sendMessage(input);
    return { sent: true, channel: result.channel };
  }

  /**
   * Sends a test message synchronously and records the result.
   *
   * The analog of MailService.sendTest: the admin who clicked "Send test
   * message" needs Slack's actual error in the HTTP response, and the outcome is
   * persisted as `last_test_ok` / `last_test_error` for the settings screen. The
   * thrown error's message is Slack's own, which is the only diagnostically
   * useful thing here.
   */
  async sendTest(
    channel: string | undefined,
    actor?: AuditActor,
  ): Promise<{ message: string; channel: string }> {
    const text =
      ':white_check_mark: Test message from your HR Management system. ' +
      'If you can read this, the Slack integration is configured correctly.';

    try {
      const result = await this.sendMessage({ channel, text });

      await this.slackSettings.recordTestResult(true);
      await this.audit.record({
        actor: actor ?? {},
        action: 'slack.settings.test',
        entityType: 'slack_settings',
        entityId: '1',
        after: { channel: result.channel, result: 'ok' },
      });

      return {
        message: `Test message sent to ${result.channel}.`,
        channel: result.channel,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);

      await this.slackSettings.recordTestResult(false, detail);
      await this.audit.record({
        actor: actor ?? {},
        action: 'slack.settings.test',
        entityType: 'slack_settings',
        entityId: '1',
        after: { channel: channel ?? null, result: 'failed', error: detail },
      });

      // Rethrown for the controller to translate into a 503.
      throw error;
    }
  }
}
