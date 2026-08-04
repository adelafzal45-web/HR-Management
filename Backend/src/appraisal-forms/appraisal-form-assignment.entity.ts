import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { AppraisalForms } from './appraisal-forms.entity';
import { Department } from '../department/department.entity';
import { Designation } from '../designation/designation.entity';
import { User } from '../users/user.entity';

/**
 * Assigns a published form to an audience.
 *
 * Exactly one of `department` / `designation` / `user` is set — the DB enforces
 * this with a CHECK constraint (see the AppraisalAssignments migration), and
 * the service validates it before insert so callers get a 400 rather than a
 * constraint violation.
 *
 * When resolving which form applies to an employee, the most specific
 * assignment wins: user → designation → department. Ties within a tier are
 * broken by the newest `created_at`.
 *
 * This supersedes the single `department_id` / `designation_id` columns on
 * `appraisal_forms`, which are left in place for backward compatibility but
 * are no longer read by the appraisal workflow.
 */
@Entity('appraisal_form_assignments')
export class AppraisalFormAssignment {
  @PrimaryGeneratedColumn('uuid')
  assignment_id!: string;

  @ManyToOne(() => AppraisalForms, (form) => form.assignments, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'form_id' })
  form!: AppraisalForms;

  @ManyToOne(() => Department, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'department_id' })
  department?: Department | null;

  @ManyToOne(() => Designation, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'designation_id' })
  designation?: Designation | null;

  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
