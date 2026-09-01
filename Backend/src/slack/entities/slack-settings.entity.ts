import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Check,
} from 'typeorm';

/**
 * Single-row Slack integration configuration, following the same shape as
 * SmtpSettings / CompanySettings: `id` is always 1 and a database CHECK enforces
 * it. There is one Slack workspace credential per deployment, and a multi-row
 * table would leave "which row is live?" ambiguous.
 *
 * The bot token is stored AES-256-GCM encrypted (see `slack-crypto.ts`), never
 * in plaintext, and the column is named `bot_token_encrypted` for two reasons: a
 * reader cannot mistake it for a directly usable value, and AuditService's
 * redaction — which matches field names containing 'token' — catches it
 * automatically if it ever reaches an audit diff.
 */
@Entity('slack_settings')
@Check('"id" = 1')
export class SlackSettings {
  @PrimaryColumn({ type: 'integer', default: 1 })
  id!: number;

  /** AES-256-GCM ciphertext, `iv:authTag:payload` base64. Never returned by the API. */
  @Column({ type: 'text', nullable: true })
  bot_token_encrypted?: string | null;

  /** Where messages go by default, e.g. `#general` or a channel ID. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  default_channel?: string | null;

  /**
   * Master switch. Defaults to false so a partially-filled configuration cannot
   * start posting to Slack before a token and channel are in place.
   */
  @Column({ type: 'boolean', default: false })
  enabled!: boolean;

  // Result of the last "send test message" attempt, kept so the settings screen
  // can show whether the current configuration has ever actually worked rather
  // than only whether it validates.
  @Column({ type: 'timestamptz', nullable: true })
  last_test_at?: Date | null;

  @Column({ type: 'boolean', nullable: true })
  last_test_ok?: boolean | null;

  @Column({ type: 'text', nullable: true })
  last_test_error?: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
