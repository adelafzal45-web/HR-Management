import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { PerformanceReview } from '../performance-review/performance-review.entity';
import { AppraisalFormQuestion } from '../appraisal-form-questions/appraisal-form-questions.entity';
import { AppraisalFormAssignment } from './appraisal-form-assignment.entity';
import { Department } from '../department/department.entity';
import { Designation } from '../designation/designation.entity';
import { User } from '../users/user.entity';

/** Lifecycle of a form: questions are editable only while Draft. */
export enum FormStatus {
  DRAFT = 'Draft',
  PUBLISHED = 'Published',
  ARCHIVED = 'Archived',
}

export enum EvaluationType {
  DAILY = 'Daily',
  WEEKLY = 'Weekly',
  MONTHLY = 'Monthly',
}

@Entity('appraisal_forms')
export class AppraisalForms {
  @PrimaryGeneratedColumn('uuid')
  form_id!: string;

  @Column({
    unique: true,
    length: 150,
  })
  form_name!: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  description?: string;

  @Column({
    type: 'enum',
    enum: EvaluationType,
  })
  evaluation_type!: EvaluationType;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'Draft',
  })
  status!: string;

  @ManyToOne(() => Department, (department) => department.appraisalForms, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'department_id',
  })
  department?: Department;

  @ManyToOne(() => Designation, (designation) => designation.appraisalForms, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'designation_id',
  })
  designation?: Designation;

  @ManyToOne(() => User, (user) => user.createdAppraisalForms, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'created_by',
  })
  createdBy?: User;

  @Column({
    default: true,
  })
  is_active!: boolean;

  @Column({
    type: 'int',
    default: 1,
  })
  version!: number;

  // ==========================================
  // Performance Reviews
  // ==========================================

  @OneToMany(() => PerformanceReview, (review) => review.appraisalForm)
  performanceReviews!: PerformanceReview[];

  // ==========================================
  // Appraisal Form Questions
  // ==========================================

  @OneToMany(
    () => AppraisalFormQuestion,
    (formQuestion) => formQuestion.appraisalForm,
  )
  formQuestions!: AppraisalFormQuestion[];

  // ==========================================
  // Assignments (department / designation / employee)
  // ==========================================

  @OneToMany(() => AppraisalFormAssignment, (assignment) => assignment.form)
  assignments!: AppraisalFormAssignment[];

  // ==========================================
  // Timestamps
  // ==========================================

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
