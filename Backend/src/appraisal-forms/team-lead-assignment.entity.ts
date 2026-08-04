import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../users/user.entity';
import { Department } from '../department/department.entity';

export enum TeamLeadAssignmentMode {
  /** The lead sees every active member of one department. */
  DEPARTMENT = 'DEPARTMENT',
  /** The lead sees exactly the members listed in the join table. */
  MEMBERS = 'MEMBERS',
}

/**
 * Who a Team Lead may see and evaluate.
 *
 * Before this existed, visibility was implicit: "every active member of my own
 * department", recomputed on every request. That could not express a lead who
 * owns a subset of a department, and it meant two leads in one department each
 * saw the other's reports.
 *
 * A lead may hold at most one DEPARTMENT row (enforced by the partial unique
 * index `UQ_tla_lead_department_mode`) and any number of MEMBERS rows. The
 * resolved roster is the union of both, which is what
 * `AppraisalFacadeService.resolveVisibleEmployeeIds` returns.
 */
@Entity('team_lead_assignments')
@Index('IDX_tla_team_lead', ['teamLead'])
export class TeamLeadAssignment {
  @PrimaryGeneratedColumn('uuid')
  assignment_id!: string;

  @ManyToOne(() => User, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'team_lead_id',
  })
  teamLead!: User;

  @Column({
    type: 'varchar',
    length: 20,
  })
  mode!: TeamLeadAssignmentMode;

  /**
   * Required when mode is DEPARTMENT, ignored otherwise. Enforced by
   * `CHK_tla_department_required` — a department-wide grant with no department
   * would silently resolve to an empty roster.
   */
  @ManyToOne(() => Department, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'department_id',
  })
  department?: Department | null;

  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'created_by',
  })
  createdBy?: User | null;

  @OneToMany(() => TeamLeadAssignmentMember, (member) => member.assignment, {
    cascade: true,
  })
  members!: TeamLeadAssignmentMember[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}

/**
 * One employee inside a MEMBERS-mode assignment. Composite primary key on
 * (assignment_id, user_id), so the same employee cannot be added twice to one
 * assignment.
 */
@Entity('team_lead_assignment_members')
@Index('IDX_tlam_user', ['user_id'])
export class TeamLeadAssignmentMember {
  // The two key columns are declared explicitly rather than inferred from the
  // relations. `@ManyToOne(..., { primary: true })` is not valid in TypeORM
  // 0.3 — RelationOptions has no `primary` — so a composite key over foreign
  // keys is expressed as @PrimaryColumn pairs with the relations mapped onto
  // the same column names via `@JoinColumn`.
  @PrimaryColumn({
    type: 'uuid',
  })
  assignment_id!: string;

  @PrimaryColumn({
    type: 'uuid',
  })
  user_id!: string;

  @ManyToOne(() => TeamLeadAssignment, (assignment) => assignment.members, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'assignment_id',
  })
  assignment!: TeamLeadAssignment;

  @ManyToOne(() => User, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
  })
  user!: User;

  @CreateDateColumn()
  created_at!: Date;
}
