import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

import { User } from '../../users/user.entity';

/**
 * Delivery states, as a runtime list so validation DTOs and the union type
 * cannot drift apart. Mirrors the CHECK constraint in the migration.
 */
export const EMAIL_QUEUE_STATUSES = [
  'pending',
  'sending',
  'sent',
  'failed',
  'cancelled',
] as const;

export type EmailQueueStatus = (typeof EMAIL_QUEUE_STATUSES)[number];

/**
 * One outbound email, queued rather than sent inline.
 *
 * Why a queue at all: sending is a network call to a third-party server that can
 * hang or fail. Doing it inside the request that triggered it would make
 * creating an employee as slow and as failure-prone as the mail server, and a
 * timeout there would roll back an employee record over an email.
 *
 * `subject` and `body_html` hold the *rendered* output, not a template
 * reference. The message that eventually leaves is therefore the one that was
 * composed at enqueue time — editing a template does not retroactively rewrite
 * mail already in flight, and the queue row is an accurate record of what the
 * recipient actually received.
 */
@Entity('email_queue')
export class EmailQueue {
  @PrimaryGeneratedColumn('uuid')
  email_queue_id!: string;

  /** Kept for filtering and reporting; nullable for ad-hoc sends like the SMTP test. */
  @Column({ type: 'varchar', length: 60, nullable: true })
  template_key?: string | null;

  @Column({ type: 'varchar', length: 255 })
  to_email!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  to_name?: string | null;

  @Column({ type: 'varchar', length: 255 })
  subject!: string;

  @Column({ type: 'text' })
  body_html!: string;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: EmailQueueStatus;

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @Column({ type: 'integer', default: 5 })
  max_attempts!: number;

  /**
   * When this row becomes eligible to send. Drives the retry backoff: a failure
   * pushes this forward instead of blocking the queue or spinning on a server
   * that is refusing connections.
   */
  @Column({ type: 'timestamptz', default: () => 'now()' })
  next_attempt_at!: Date;

  @Column({ type: 'text', nullable: true })
  last_error?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  sent_at?: Date | null;

  /** SET NULL, so a deleted employee does not erase the delivery record. */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'related_user_id' })
  relatedUser?: User | null;

  @Column({ type: 'uuid', nullable: true })
  related_user_id?: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
