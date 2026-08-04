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

export enum ReviewApprovalAction {
  SUBMIT = 'SUBMIT',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  REOPEN = 'REOPEN',
}

/**
 * Append-only trail of a review's lifecycle.
 *
 * One row per SUBMIT (by the reviewer, on lock), APPROVE / REJECT / REOPEN
 * (by HR). Rows are never updated or deleted: the point of the trail is that
 * the record of what happened at each step survives whatever happens next.
 * `PerformanceReview.approvals` exposes them oldest-first.
 */
@Entity('review_approvals')
@Index('IDX_ra_review', ['review', 'created_at'])
export class ReviewApproval {
  @PrimaryGeneratedColumn('uuid')
  approval_id!: string;

  @ManyToOne(() => PerformanceReview, (review) => review.approvals, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'review_id',
  })
  review!: PerformanceReview;

  @Column({
    type: 'varchar',
    length: 20,
  })
  action!: ReviewApprovalAction;

  /**
   * Who performed the action. SET NULL rather than CASCADE, matching
   * `audit_logs.actor_user_id`: deleting a user must not erase the record of
   * what they approved.
   */
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'actor_user_id',
  })
  actor?: User | null;

  /** Optional note attached to the action, e.g. a reopen reason. */
  @Column({
    type: 'text',
    nullable: true,
  })
  comment?: string | null;

  @CreateDateColumn()
  created_at!: Date;
}
