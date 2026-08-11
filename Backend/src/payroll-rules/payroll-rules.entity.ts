import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * A configurable payroll rule (spec §4–8, §16 versioning).
 *
 * One table holds every kind of rule — absence, late, repeated-late, leave,
 * overtime, bonus — discriminated by `rule_type`, with the type-specific
 * settings in the `config` jsonb (validated against the shapes in
 * payroll-rule.constants.ts before it is ever stored). A rule targets a scope
 * (company → employee) exactly like a salary-structure assignment, and the
 * resolver picks the highest-priority active rule per type for an employee on a
 * date.
 *
 * Rules are **versioned, never overwritten**: editing an active rule inserts a
 * new row (version + 1) and closes the old one by setting its `effective_to`
 * and `superseded_by`. The §16 Rule Versioning UI walks that chain. Because a
 * payslip snapshots its full calculation, historical payslips never move when a
 * rule is superseded.
 */
@Entity('payroll_rules')
@Index('idx_payroll_rules_type_active', ['rule_type', 'is_active'])
export class PayrollRule {
  @PrimaryGeneratedColumn('uuid')
  rule_id!: string;

  /** absent | late | repeated_late | leave | overtime | bonus | appraisal. */
  @Column({ length: 20 })
  rule_type!: string;

  @Column({ length: 100 })
  name!: string;

  /** company | job_category | department | designation | employee. */
  @Column({ length: 20, default: 'company' })
  scope_type!: string;

  /** Null for company scope; otherwise the target entity's id. */
  @Column({ type: 'uuid', nullable: true })
  scope_id?: string | null;

  /** Type-specific settings; shape depends on rule_type (see constants). */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  config!: Record<string, unknown>;

  /** Tie-breaker among same-scope, same-type rules; larger wins. */
  @Column({ type: 'int', default: 0 })
  priority!: number;

  @Column({ default: true })
  is_active!: boolean;

  // ---- Effective dating ---------------------------------------------------

  @Column({ type: 'date', nullable: true })
  effective_from?: Date | null;

  @Column({ type: 'date', nullable: true })
  effective_to?: Date | null;

  // ---- Versioning ---------------------------------------------------------

  /** 1 for the first cut of a rule; incremented each time it is superseded. */
  @Column({ type: 'int', default: 1 })
  version!: number;

  /** The rule_id of the version that replaced this one, if any. */
  @Column({ type: 'uuid', nullable: true })
  superseded_by?: string | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
