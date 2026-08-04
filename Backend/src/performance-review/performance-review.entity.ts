import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../users/user.entity';
import { Attendance } from '../attendance/attendance.entity';

import { PerformanceReviewAnswer } from '../performance-review-answer/performance-review-answer.entity';
import { ReviewApproval } from './review-approval.entity';

import {
  AppraisalForms,
  EvaluationType,
} from '../appraisal-forms/appraisal-forms.entity';

@Entity('performance_reviews')
export class PerformanceReview {
  @PrimaryGeneratedColumn('uuid')
  review_id!: string;

  // ==========================================
  // Appraisal Form
  // ==========================================

  @ManyToOne(
    () => AppraisalForms,
    (appraisalForm) => appraisalForm.performanceReviews,
    {
      nullable: false,
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({
    name: 'form_id',
  })
  appraisalForm!: AppraisalForms;

  // ==========================================
  // Reviewer (Team Lead / Manager)
  // ==========================================

  @ManyToOne(() => User, (user) => user.reviewsGiven, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'reviewer_id',
  })
  reviewer!: User;

  // ==========================================
  // Employee Being Reviewed
  // ==========================================

  @ManyToOne(() => User, (user) => user.reviewsReceived, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'reviewee_id',
  })
  reviewee!: User;

  // ==========================================
  // Attendance Link
  // Optional: only day-bound (Daily) evaluations reference an attendance row.
  // Periodic reviews are not tied to a single day, so this stays null.
  // Matches the nullable attendance_id column in
  // 1785500000000-AppraisalVerticalFixes.
  // ==========================================

  @ManyToOne(() => Attendance, (attendance) => attendance.performanceReviews, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'attendance_id',
  })
  attendance?: Attendance | null;

  // ==========================================
  // Evaluation Type
  // Daily | Weekly | Monthly
  // ==========================================

  @Column({
    type: 'enum',
    enum: EvaluationType,
    enumName: 'performance_reviews_evaluation_type_enum',
  })
  evaluation_type!: EvaluationType;

  // ==========================================
  // Review Period
  // Examples:
  // Daily   -> 2026-08-01
  // Weekly  -> Week-32
  // Monthly -> August-2026
  // ==========================================

  @Column({
    type: 'varchar',
    length: 50,
  })
  review_period!: string;

  @Column({
    type: 'date',
  })
  review_date!: Date;

  // ==========================================
  // Total Score Percentage
  // ==========================================

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
  })
  total_score_percentage!: number;

  // ==========================================
  // Review Status
  // Draft | Submitted | Approved | Rejected
  //
  // A review is locked once it leaves Draft: submitting sets locked_at, and
  // further edits are rejected with 409 until HR reopens it (which clears
  // locked_at and returns the status to Draft). 'Completed' was the legacy
  // terminal value and was folded into 'Submitted' by the
  // AppraisalDynamicForms migration — nothing writes it anymore.
  // ==========================================

  @Column({
    type: 'varchar',
    length: 20,
    default: 'Draft',
  })
  status!: string;

  /** When the review was submitted (locked). */
  @Column({
    type: 'timestamp',
    nullable: true,
  })
  submitted_at?: Date | null;

  /** Set together with submitted_at; cleared by a reopen. */
  @Column({
    type: 'timestamp',
    nullable: true,
  })
  locked_at?: Date | null;

  /** Who approved (or last approved) this review; null until approval. */
  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'approved_by_user_id',
  })
  approvedBy?: User | null;

  @Column({
    type: 'timestamp',
    nullable: true,
  })
  approved_at?: Date | null;

  /** True when the scheduler created this review, not a human. */
  @Column({
    type: 'boolean',
    default: false,
  })
  is_auto_generated!: boolean;

  @Column({
    type: 'text',
    nullable: true,
  })
  comments?: string;

  // ==========================================
  // Reviewer's Recommendation
  // Added by 1785500000000-AppraisalVerticalFixes.
  // ==========================================

  @Column({
    type: 'text',
    nullable: true,
  })
  recommendation?: string;

  // ==========================================
  // Review Answers
  // ==========================================

  @OneToMany(() => PerformanceReviewAnswer, (answer) => answer.review, {
    cascade: true,
  })
  answers!: PerformanceReviewAnswer[];

  // ==========================================
  // Approval trail
  // Append-only: one row per submit / approve / reject / reopen.
  // ==========================================

  @OneToMany(() => ReviewApproval, (approval) => approval.review)
  approvals!: ReviewApproval[];

  // ==========================================
  // Timestamps
  // ==========================================

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
