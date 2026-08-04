import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Check,
} from 'typeorm';

/**
 * Single-row global company settings table.
 *
 * Holds company identity (legal name, registration, industry), operational
 * config (timezone, currency, default working days), and branding (display
 * name, logo URLs for standard + collapsed sidebar, favicon, contact details,
 * primary theme color).
 *
 * By design, id is always 1. The database-level CHECK constraint ensures only
 * one row can exist. The controller enforces GET/PATCH against id=1 only.
 */
@Entity('company_settings')
@Check('"id" = 1')
export class CompanySettings {
  @PrimaryColumn({ type: 'integer', default: 1 })
  id!: number;

  @Column({ length: 200 })
  legal_company_name!: string;

  @Column({ length: 100, nullable: true })
  registration_number?: string;

  @Column({ length: 100, nullable: true })
  industry?: string;

  @Column({ length: 50, default: 'UTC' })
  timezone!: string;

  @Column({ length: 10, default: 'USD' })
  currency!: string;

  @Column({ length: 50, default: 'Mon-Fri' })
  working_days!: string;

  @Column({ length: 200 })
  company_name!: string;

  @Column({ length: 500, nullable: true })
  logo_url?: string;

  @Column({ length: 500, nullable: true })
  logo_collapsed_url?: string;

  @Column({ length: 500, nullable: true })
  favicon_url?: string;

  @Column({ length: 255, nullable: true })
  email?: string;

  @Column({ length: 50, nullable: true })
  phone?: string;

  @Column({ type: 'text', nullable: true })
  address?: string;

  @Column({ length: 255, nullable: true })
  website?: string;

  @Column({ length: 20, default: '#F1B344' })
  primary_color!: string;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
