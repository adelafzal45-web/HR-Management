import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Check,
} from 'typeorm';

import type { ThemeConfig } from './theme-config.type';
import type {
  AttendanceMode,
  BiometricDeviceConfig,
} from './biometric-device.type';
import type { CelebrationConfig } from './celebration-config.type';

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

  /**
   * Admin-configurable design theme (semantic colours, radii, shadows,
   * typography, layout, mode/density). One jsonb blob replaced wholesale by the
   * Appearance settings screen; null means "no override" and the frontend uses
   * its DEFAULT_THEME. Explicit `type` is required for a nullable column typed as
   * a union (`ThemeConfig | null`) — the metadata builder can't infer it.
   */
  @Column({ type: 'jsonb', nullable: true })
  theme_config!: ThemeConfig | null;

  /**
   * Company-wide attendance policy. 'Manual' (default): employees clock in/out
   * themselves and any connected biometric device is ignored. 'Device': a
   * physical ZKTeco terminal records attendance and self check-in is disabled.
   * HR flips this on the Biometric settings screen. Scalar + DB CHECK, mirroring
   * the per-row `attendance_source`.
   */
  @Column({ length: 20, default: 'Manual' })
  attendance_mode!: AttendanceMode;

  /**
   * Biometric device connection the real-time listener dials. One nullable jsonb
   * blob (mirroring `theme_config`); null means "not configured" and the
   * biometric service uses its built-in defaults. Deliberately NOT on the public
   * branding payload — a device address is internal. Explicit `type` is required
   * for a nullable union column.
   */
  @Column({ type: 'jsonb', nullable: true })
  biometric_device!: BiometricDeviceConfig | null;

  /**
   * Admin-configurable birthday & work-anniversary announcement (backlog #2b):
   * whether it runs, at what time, and the announcement heading. One nullable
   * jsonb blob (mirroring `theme_config` / `biometric_device`); null means "no
   * override" and the scheduler falls back to CELEBRATION_CONFIG_DEFAULTS — i.e.
   * the original hard-coded enabled/08:00/heading defaults. Deliberately NOT on
   * the public branding payload — nothing here is needed before login. Explicit
   * `type` is required for a nullable union column.
   */
  @Column({ type: 'jsonb', nullable: true })
  celebration_config!: CelebrationConfig | null;

  // ---- Certificate signatories ----------------------------------------
  //
  // Who signs an employment or experience certificate, and the image of their
  // signature. All four are optional and independent: a company with only a CEO
  // configured prints one block, and one with neither still produces a valid
  // certificate under a generic "Authorised Signatory".
  //
  // Certificates only. Payslips and ID cards are unaffected.

  @Column({ length: 150, nullable: true })
  ceo_name?: string;

  @Column({ length: 500, nullable: true })
  ceo_signature_url?: string;

  @Column({ length: 150, nullable: true })
  cofounder_name?: string;

  @Column({ length: 500, nullable: true })
  cofounder_signature_url?: string;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
