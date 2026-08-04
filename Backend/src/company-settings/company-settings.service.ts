import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CompanySettings } from './company-settings.entity';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';

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
   */
  async getBranding(): Promise<{
    company_name: string;
    logo_url?: string;
    logo_collapsed_url?: string;
    favicon_url?: string;
    primary_color: string;
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
      email: settings.email,
      phone: settings.phone,
      address: settings.address,
      website: settings.website,
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

    await this.companySettingsRepository.update(1, dto);
    return this.get();
  }
}
