import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Check,
} from 'typeorm';

/** Transport security for the SMTP connection. */
export type SmtpEncryption = 'none' | 'tls' | 'ssl';

/**
 * Single-row SMTP configuration, following the same shape as CompanySettings:
 * `id` is always 1 and a database CHECK enforces it. There is one mail server
 * per deployment, and a multi-row table would leave "which row is live?"
 * ambiguous.
 *
 * The password is stored AES-256-GCM encrypted (see `smtp-crypto.ts`), never in
 * plaintext, and the column is named `password_encrypted` for two reasons: a
 * reader cannot mistake it for a directly usable value, and AuditService's
 * redaction — which matches field names containing 'password' — catches it
 * automatically if it ever reaches an audit diff.
 */
@Entity('smtp_settings')
@Check('"id" = 1')
export class SmtpSettings {
  @PrimaryColumn({ type: 'integer', default: 1 })
  id!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  host?: string | null;

  @Column({ type: 'integer', default: 587 })
  port!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  username?: string | null;

  /** AES-256-GCM ciphertext, `iv:authTag:payload` base64. Never returned by the API. */
  @Column({ type: 'text', nullable: true })
  password_encrypted?: string | null;

  @Column({ type: 'varchar', length: 10, default: 'tls' })
  encryption!: SmtpEncryption;

  @Column({ type: 'varchar', length: 150, nullable: true })
  from_name?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  from_email?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reply_to?: string | null;

  /**
   * Master switch. Defaults to false so a partially-filled configuration cannot
   * start queueing mail that has no chance of being delivered.
   */
  @Column({ type: 'boolean', default: false })
  enabled!: boolean;

  // Result of the last "send test email" attempt, kept so the settings screen
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
