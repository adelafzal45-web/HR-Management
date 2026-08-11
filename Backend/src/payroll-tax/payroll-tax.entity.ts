import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';

import { moneyDefaultZero } from '../payroll-engine/decimal.transformer';

/**
 * An income-tax configuration (spec §10) — a named, effective-dated, versioned
 * set of progressive slabs. Only one config is active at a time for a currency;
 * the engine resolves the active config for the period date and runs the
 * employee's annual taxable income through its slabs.
 *
 * Versioned like payroll rules: a new tax year's brackets are a new config, so
 * historical payslips (which snapshot their tax line) never move when rates
 * change.
 */
@Entity('tax_configs')
@Index('idx_tax_configs_active', ['is_active'])
export class TaxConfig {
  @PrimaryGeneratedColumn('uuid')
  tax_config_id!: string;

  @Column({ length: 100 })
  name!: string;

  /** Free-form label for the tax regime (e.g. 'FBR Salaried 2026'). */
  @Column({ length: 60, nullable: true, type: 'varchar' })
  regime?: string | null;

  @Column({ length: 3, default: 'PKR' })
  currency!: string;

  /**
   * Whether slabs are applied to annualized income (income × periods/year) then
   * divided back down. True is the standard progressive model; false applies
   * the slab table to each period's taxable income directly.
   */
  @Column({ default: true })
  annualize!: boolean;

  @Column({ default: true })
  is_active!: boolean;

  @OneToMany(() => TaxSlab, (slab) => slab.config, { cascade: true })
  slabs!: TaxSlab[];

  // ---- Effective dating + versioning --------------------------------------

  @Column({ type: 'date', nullable: true })
  effective_from?: Date | null;

  @Column({ type: 'date', nullable: true })
  effective_to?: Date | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}

/**
 * One progressive bracket of a tax config. Charges `base_tax` plus
 * `rate_percent` on income above `lower_bound`, up to `upper_bound` (null = the
 * top, open-ended bracket).
 */
@Entity('tax_slabs')
export class TaxSlab {
  @PrimaryGeneratedColumn('uuid')
  slab_id!: string;

  @ManyToOne(() => TaxConfig, (config) => config.slabs, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tax_config_id' })
  config!: TaxConfig;

  @Column({ type: 'uuid' })
  tax_config_id!: string;

  /** Annual income floor (exclusive) this bracket starts above. */
  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: moneyDefaultZero,
  })
  lower_bound!: number;

  /** Annual income ceiling (inclusive); null = open-ended top bracket. */
  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v?: number | null) => v ?? null,
      from: (v: string | number | null) =>
        v === null || v === undefined ? null : Number(v),
    },
  })
  upper_bound?: number | null;

  /** Flat annual tax charged at this bracket before the marginal rate. */
  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: moneyDefaultZero,
  })
  base_tax!: number;

  /** Marginal rate on income above lower_bound, as a percentage. */
  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
    transformer: moneyDefaultZero,
  })
  rate_percent!: number;

  @Column({ type: 'int', default: 0 })
  display_order!: number;
}
