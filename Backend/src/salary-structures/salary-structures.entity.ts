import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';

import { moneyTransformer } from '../payroll-engine/decimal.transformer';
import { SalaryComponent } from '../salary-components/salary-components.entity';

/**
 * A named salary structure (spec §3, "Salary Structure Builder").
 *
 * A structure is an ordered bundle of components ("Standard Staff", "Manager",
 * "Contractor") that is then assigned to a scope — company-wide, a department,
 * a designation, a job category, or one employee — with an effective date. The
 * calculation service resolves which structure applies to an employee for a
 * given period by scope priority (see SCOPE_PRIORITY).
 */
@Entity('salary_structures')
export class SalaryStructure {
  @PrimaryGeneratedColumn('uuid')
  structure_id!: string;

  @Column({ length: 100, unique: true })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ default: true })
  is_active!: boolean;

  @OneToMany(() => SalaryStructureComponent, (component) => component.structure)
  components!: SalaryStructureComponent[];

  @OneToMany(
    () => SalaryStructureAssignment,
    (assignment) => assignment.structure,
  )
  assignments!: SalaryStructureAssignment[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}

/**
 * A component's membership in a structure, with optional per-structure
 * overrides of the component's own calculation. This is what lets "Basic" be
 * 60% of a manager's package but a flat figure elsewhere without cloning the
 * component.
 */
@Entity('salary_structure_components')
export class SalaryStructureComponent {
  @PrimaryGeneratedColumn('uuid')
  structure_component_id!: string;

  @ManyToOne(() => SalaryStructure, (structure) => structure.components, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'structure_id' })
  structure!: SalaryStructure;

  @Column({ type: 'uuid' })
  structure_id!: string;

  @ManyToOne(() => SalaryComponent, {
    nullable: false,
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'component_id' })
  component!: SalaryComponent;

  @Column({ type: 'uuid' })
  component_id!: string;

  /** Overrides SalaryComponent.calculation_type for this structure only. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  override_calculation_type?: string | null;

  /** Overrides SalaryComponent.amount for this structure only. */
  @Column({
    type: 'decimal',
    precision: 14,
    scale: 4,
    nullable: true,
    transformer: moneyTransformer,
  })
  override_amount?: number | null;

  /** Overrides SalaryComponent.formula for this structure only. */
  @Column({ type: 'text', nullable: true })
  override_formula?: string | null;

  @Column({ type: 'int', default: 0 })
  display_order!: number;
}

/**
 * Assigns a structure to a scope with an effective window (spec §12/§13).
 *
 * `scope_type` = 'company' has a null `scope_id`; the others carry the id of
 * the department/designation/job category/employee. `base_salary`, when set,
 * establishes BASIC for the matched employees (otherwise the engine falls back
 * to `users.salary`). Priority resolution picks the highest-priority scope that
 * matches, filtered to assignments effective on the period date.
 */
@Entity('salary_structure_assignments')
export class SalaryStructureAssignment {
  @PrimaryGeneratedColumn('uuid')
  assignment_id!: string;

  @ManyToOne(() => SalaryStructure, (structure) => structure.assignments, {
    nullable: false,
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'structure_id' })
  structure!: SalaryStructure;

  @Column({ type: 'uuid' })
  structure_id!: string;

  /** company | job_category | department | designation | employee. */
  @Column({ length: 20 })
  scope_type!: string;

  /** Null for company scope; otherwise the target entity's id. */
  @Column({ type: 'uuid', nullable: true })
  scope_id?: string | null;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: moneyTransformer,
  })
  base_salary?: number | null;

  @Column({ type: 'date', nullable: true })
  effective_from?: Date | null;

  @Column({ type: 'date', nullable: true })
  effective_to?: Date | null;

  @Column({ default: true })
  is_active!: boolean;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}

/**
 * A per-employee override of a single component (spec §12, the narrowest level
 * of the Company→Department→Designation→Employee chain). Lets HR bump one
 * person's Transport allowance without touching their structure.
 */
@Entity('employee_component_overrides')
export class EmployeeComponentOverride {
  @PrimaryGeneratedColumn('uuid')
  override_id!: string;

  @Column({ type: 'uuid' })
  user_id!: string;

  @ManyToOne(() => SalaryComponent, {
    nullable: false,
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'component_id' })
  component!: SalaryComponent;

  @Column({ type: 'uuid' })
  component_id!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  override_calculation_type?: string | null;

  @Column({
    type: 'decimal',
    precision: 14,
    scale: 4,
    nullable: true,
    transformer: moneyTransformer,
  })
  override_amount?: number | null;

  @Column({ type: 'text', nullable: true })
  override_formula?: string | null;

  @Column({ type: 'date', nullable: true })
  effective_from?: Date | null;

  @Column({ type: 'date', nullable: true })
  effective_to?: Date | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
