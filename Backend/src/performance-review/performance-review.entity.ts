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
  // Employee Attendance For This Evaluation Day
  // ==========================================

  @ManyToOne(() => Attendance, (attendance) => attendance.performanceReviews, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'attendance_id',
  })
  attendance!: Attendance;

  // ==========================================
  // Evaluation Type
  // Daily | Weekly | Monthly
  // ==========================================

  @Column({
    type: 'enum',
    enum: EvaluationType,
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
  // Draft | Submitted | Completed
  // ==========================================

  @Column({
    type: 'varchar',
    length: 20,
    default: 'Draft',
  })
  status!: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  comments?: string;

  // ==========================================
  // Review Answers
  // ==========================================

  @OneToMany(() => PerformanceReviewAnswer, (answer) => answer.review, {
    cascade: true,
  })
  answers!: PerformanceReviewAnswer[];

  // ==========================================
  // Timestamps
  // ==========================================

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
