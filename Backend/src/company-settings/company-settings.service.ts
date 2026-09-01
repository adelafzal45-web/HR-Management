import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CompanySettings } from './company-settings.entity';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';
import type { ThemeConfig } from './theme-config.type';
import type {
  AttendanceMode,
  BiometricDeviceConfig,
} from './biometric-device.type';
import {
  BRANDING_UPLOAD,
  SIGNATURE_UPLOAD,
  deleteUpload,
  saveUpload,
  validateUpload,
  type UploadConfig,
  type UploadedFile,
} from '../common/upload/image-upload';

/**
 * The images the settings screens can upload, and where each one is stored.
 *
 * One map rather than an endpoint per screen: the upload route, the
 * replaced-file cleanup in `update`, and the "did this path come from us" check
 * on the DTO all need the same kind → column → directory association, and three
 * copies of it would eventually disagree.
 *
 * Logos and signatures land in different directories on purpose — `deleteUpload`
 * refuses a path outside the config it is given, so a tampered signature URL
 * cannot be used to delete the company logo.
 */
export const COMPANY_ASSET_KINDS = [
  'logo',
  'logo-collapsed',
  'favicon',
  'ceo-signature',
  'cofounder-signature',
] as const;
export type CompanyAssetKind = (typeof COMPANY_ASSET_KINDS)[number];

const COMPANY_ASSETS = {
  logo: { column: 'logo_url', config: BRANDING_UPLOAD },
  'logo-collapsed': { column: 'logo_collapsed_url', config: BRANDING_UPLOAD },
  favicon: { column: 'favicon_url', config: BRANDING_UPLOAD },
  'ceo-signature': { column: 'ceo_signature_url', config: SIGNATURE_UPLOAD },
  'cofounder-signature': {
    column: 'cofounder_signature_url',
    config: SIGNATURE_UPLOAD,
  },
} as const satisfies Record<
  CompanyAssetKind,
  { column: keyof CompanySettings; config: UploadConfig }
>;

/** The four signatory fields, as the certificate renderer needs them. */
export type Signatories = {
  ceo_name?: string;
  ceo_signature_url?: string;
  cofounder_name?: string;
  cofounder_signature_url?: string;
};

@Injectable()
export class CompanySettingsService {
  constructor(
    @InjectRepository(CompanySettings)
    private companySettingsRepository: Repository<CompanySettings>,
  ) {}

  /**
   * Get the single global company settings row.
   *
   * The migration seeds id=1 by default, so this should never be empty unless
   * the DB was manually altered. If somehow it is missing, throw 404 so the
   * client can surface a setup prompt.
   */
  async get(): Promise<CompanySettings> {
    const settings = await this.companySettingsRepository.findOne({
      where: { id: 1 },
    });

    if (!settings) {
      throw new NotFoundException(
        'Company settings not found. Run migrations to seed the default row.',
      );
    }

    return settings;
  }

  /**
   * Branding subset, safe to serve unauthenticated.
   *
   * The whole frontend themes itself from primary_color and renders the logo on
   * the login screen — i.e. before any token exists — so this cannot sit behind
   * a permission. Only the fields already visible on a public website are
   * returned; registration number, timezone, currency and the rest stay behind
   * `company-settings.view`.
   *
   * The signatory fields are deliberately not here. This payload is reachable
   * without a token, and a signature image is not something to hand to an
   * anonymous caller — `getSignatories` serves them to logged-in users instead.
   *
   * `theme_config` IS here on purpose: the whole app (not just the brand colour)
   * themes itself before login, so the design theme has to travel on the same
   * unauthenticated payload. It carries no secrets — only colours and sizing.
   */
  async getBranding(): Promise<{
    company_name: string;
    logo_url?: string;
    logo_collapsed_url?: string;
    favicon_url?: string;
    primary_color: string;
    theme_config: ThemeConfig | null;
    email?: string;
    phone?: string;
    address?: string;
    website?: string;
  }> {
    const settings = await this.get();

    return {
      company_name: settings.company_name,
      logo_url: settings.logo_url,
      logo_collapsed_url: settings.logo_collapsed_url,
      favicon_url: settings.favicon_url,
      primary_color: settings.primary_color,
      theme_config: settings.theme_config,
      email: settings.email,
      phone: settings.phone,
      address: settings.address,
      website: settings.website,
    };
  }

  /**
   * Who signs a certificate, for the client that renders one.
   *
   * Split out from `get()` because the two have different audiences. Generating
   * a certificate needs `employees.documents.view`, not `company-settings.view`,
   * so a team lead who may issue one cannot read the whole settings row — and
   * putting these four fields on the public branding payload would publish a
   * signature image to anyone at all.
   *
   * Authentication alone is the bar here: these names and signatures are printed
   * on every certificate the company issues, so they are not secret from the
   * staff who receive them.
   */
  async getSignatories(): Promise<Signatories> {
    const settings = await this.get();

    return {
      ceo_name: settings.ceo_name,
      ceo_signature_url: settings.ceo_signature_url,
      cofounder_name: settings.cofounder_name,
      cofounder_signature_url: settings.cofounder_signature_url,
    };
  }

  /**
   * Attendance policy + biometric device connection, for the biometric and
   * attendance services to consume internally. Not an HTTP surface of its own —
   * these are ordinary `company_settings` columns that ride the authenticated
   * GET/PATCH like every other field; this getter just narrows the read to what
   * the two services need without exposing the whole row to them.
   *
   * `device` is null until HR configures it on the Biometric settings screen;
   * the biometric service applies its built-in connection defaults in that case.
   */
  async getBiometricConfig(): Promise<{
    mode: AttendanceMode;
    device: BiometricDeviceConfig | null;
  }> {
    const settings = await this.get();

    return {
      mode: settings.attendance_mode,
      device: settings.biometric_device,
    };
  }

  /**
   * Update the global company settings row.
   *
   * The id is always 1 by design. The controller enforces this at the route
   * level, so the service doesn't need to validate it again.
   */
  async update(dto: UpdateCompanySettingsDto): Promise<CompanySettings> {
    // Every field is optional, so a body of `{}` (or one whose keys were all
    // stripped by the whitelist pipe) reaches here empty. TypeORM rejects an
    // empty changeset, so treat it as a no-op read instead.
    if (Object.keys(dto).length === 0) {
      return this.get();
    }

    const existing = await this.get();
    const changes = { ...dto };

    // '' is how a client clears an optional image or name; those columns are
    // nullable, so store null rather than an empty string that would read as a
    // zero-length path and render as a broken image.
    for (const key of Object.keys(changes) as (keyof typeof changes)[]) {
      if (changes[key] === '') changes[key] = undefined;
    }

    await this.companySettingsRepository.update(1, changes);
    const updated = await this.get();

    await this.deleteOrphanedAssets(existing, updated);

    return updated;
  }

  /**
   * Remove upload files the row no longer points at.
   *
   * Driven off the before and after rows rather than the DTO: a field sent with
   * the value it already had is not a replacement, and a field left out of the
   * PATCH must not be touched. Runs after the write, so a failed update never
   * destroys the file the row is still pointing at.
   *
   * An externally hosted URL is skipped by construction — `deleteUpload` ignores
   * any path outside the config's own directory.
   */
  private async deleteOrphanedAssets(
    before: CompanySettings,
    after: CompanySettings,
  ): Promise<void> {
    // Two columns may legitimately hold the same path — a company whose
    // collapsed logo is its full logo. Clearing one of them must not delete the
    // file the other still needs.
    const stillInUse = new Set(
      COMPANY_ASSET_KINDS.map((kind) => after[COMPANY_ASSETS[kind].column]),
    );

    await Promise.all(
      COMPANY_ASSET_KINDS.map((kind) => {
        const { column, config } = COMPANY_ASSETS[kind];
        const previous = before[column];
        if (!previous || stillInUse.has(previous)) return undefined;
        return deleteUpload(previous, config);
      }),
    );
  }

  /**
   * Store an uploaded logo, favicon or signature and point the settings row at
   * it.
   *
   * Kept out of the PATCH for the same reason notification attachments are: the
   * file is validated and written before anything references it, and the JSON
   * update contract stays plain JSON. Going through `update` means the image
   * this one replaces is cleaned up by the same code path a manual edit uses.
   */
  async saveAsset(
    kind: CompanyAssetKind,
    file?: UploadedFile,
  ): Promise<{ url: string }> {
    const { column, config } = COMPANY_ASSETS[kind];

    const validated = validateUpload(file, config);
    const url = await saveUpload(validated, config);

    // Cast because a computed key whose type is a union of literals widens to a
    // plain string index, which is not assignable to the DTO. `column` is one of
    // the five names above, so the shape is right.
    await this.update({ [column]: url } as UpdateCompanySettingsDto);

    return { url };
  }
}
