import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from '../users/user.entity';
import { PerformanceReview } from '../performance-review/performance-review.entity';

export enum AppraisalNotificationType {
  /** Sent to a Team Lead an hour before shift end while reviews are pending. */
  SHIFT_REMINDER = 'SHIFT_REMINDER',
  /** Daily roll-up of everything still outstanding. */
  PENDING_DIGEST = 'PENDING_DIGEST',
  /** HR reopened a locked review; the reviewer can edit it again. */
  REVIEW_REOPENED = 'REVIEW_REOPENED',
  /** HR approved a submitted review. */
  REVIEW_APPROVED = 'REVIEW_APPROVED',
}

/**
 * An addressed, deduplicated in-app notification for the appraisal vertical.
 *
 * Deliberately separate from the existing `notifications` table, which is an
 * announcement board — it has a title, a message and an author, but no
 * recipient, no read state and no dedupe key, so it cannot express "remind this
 * lead once before this shift".
 */
@Entity('appraisal_notifications')
@Index('IDX_an_recipient_unread', ['recipient', 'is_read', 'created_at'])
export class AppraisalNotification {
  @PrimaryGeneratedColumn('uuid')
  notification_id!: string;

  @ManyToOne(() => User, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'recipient_user_id',
  })
  recipient!: User;

  @Column({
    type: 'varchar',
    length: 40,
  })
  type!: AppraisalNotificationType;

  @Column({
    type: 'varchar',
    length: 200,
  })
  title!: string;

  @Column({
    type: 'text',
  })
  message!: string;

  /** The review this notification is about, when it is about one. */
  @ManyToOne(() => PerformanceReview, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'related_review_id',
  })
  relatedReview?: PerformanceReview | null;

  /**
   * Stable identity of the event this notification represents, e.g.
   * `SHIFT_REMINDER:<leadId>:<yyyy-mm-dd>:<shiftId>`. A partial unique index
   * (`UQ_an_dedupe_key`, WHERE NOT NULL) makes re-sending a no-op at the
   * database level, which is what lets the reminder cron run every 15 minutes
   * across a wider trigger window without spamming. Leave null for
   * notifications that are genuinely allowed to repeat.
   */
  @Column({
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  dedupe_key?: string | null;

  @Column({
    type: 'boolean',
    default: false,
  })
  is_read!: boolean;

  @CreateDateColumn()
  created_at!: Date;
}
