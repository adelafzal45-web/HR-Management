import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TaxConfig, TaxSlab } from './payroll-tax.entity';
import { CreateTaxConfigDto, TaxSlabDto } from './dto/create-tax-config.dto';
import { UpdateTaxConfigDto } from './dto/update-tax-config.dto';
import { PreviewTaxDto } from './dto/preview-tax.dto';
import { PayrollSettings } from '../payroll-settings/payroll-settings.entity';
import {
  computeTax,
  periodsPerYear,
  TaxComputation,
  TaxSlabInput,
} from '../payroll-engine/tax-calculation';

/**
 * CRUD for tax configs + slabs (spec §10) and the two evaluation entry points:
 * `preview` (annual-income dry run for the builder) and `computeMonthlyTax`
 * (what the payroll engine calls for a period). The slab arithmetic itself
 * lives in the pure `tax-calculation.ts`.
 */
@Injectable()
export class PayrollTaxService {
  constructor(
    @InjectRepository(TaxConfig)
    private readonly configRepository: Repository<TaxConfig>,
    @InjectRepository(TaxSlab)
    private readonly slabRepository: Repository<TaxSlab>,
    @InjectRepository(PayrollSettings)
    private readonly settingsRepository: Repository<PayrollSettings>,
  ) {}

  async create(dto: CreateTaxConfigDto): Promise<TaxConfig> {
    this.assertSlabs(dto.slabs);
    const config = this.configRepository.create({
      name: dto.name,
      regime: dto.regime ?? null,
      currency: dto.currency ?? 'PKR',
      annualize: dto.annualize ?? true,
      is_active: dto.is_active ?? true,
      effective_from: dto.effective_from ? new Date(dto.effective_from) : null,
      effective_to: dto.effective_to ? new Date(dto.effective_to) : null,
      version: 1,
      slabs: this.buildSlabs(dto.slabs),
    });
    return this.configRepository.save(config);
  }

  findAll(): Promise<TaxConfig[]> {
    return this.configRepository.find({
      relations: { slabs: true },
      order: { is_active: 'DESC', created_at: 'DESC' },
    });
  }

  async findOne(id: string): Promise<TaxConfig> {
    const config = await this.configRepository.findOne({
      where: { tax_config_id: id },
      relations: { slabs: true },
    });
    if (!config) {
      throw new NotFoundException(`Tax config "${id}" not found.`);
    }
    config.slabs.sort((a, b) => a.lower_bound - b.lower_bound);
    return config;
  }

  async update(id: string, dto: UpdateTaxConfigDto): Promise<TaxConfig> {
    const config = await this.findOne(id);

    if (dto.name !== undefined) config.name = dto.name;
    if (dto.regime !== undefined) config.regime = dto.regime ?? null;
    if (dto.currency !== undefined) config.currency = dto.currency;
    if (dto.annualize !== undefined) config.annualize = dto.annualize;
    if (dto.is_active !== undefined) config.is_active = dto.is_active;
    if (dto.effective_from !== undefined) {
      config.effective_from = dto.effective_from
        ? new Date(dto.effective_from)
        : null;
    }
    if (dto.effective_to !== undefined) {
      config.effective_to = dto.effective_to
        ? new Date(dto.effective_to)
        : null;
    }

    if (dto.slabs !== undefined) {
      this.assertSlabs(dto.slabs);
      // Replace the whole ladder — slabs are always edited as a set.
      await this.slabRepository.delete({ tax_config_id: id });
      config.slabs = this.buildSlabs(dto.slabs);
    }

    await this.configRepository.save(config);
    return this.findOne(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.findOne(id);
    await this.configRepository.delete(id);
    return { message: 'Tax config deleted successfully' };
  }

  /**
   * The active tax config effective on a date (defaults to today), or null if
   * none is configured. The engine calls this per run.
   */
  async getActiveConfig(onDate: Date = new Date()): Promise<TaxConfig | null> {
    const configs = await this.configRepository.find({
      where: { is_active: true },
      relations: { slabs: true },
      order: { created_at: 'DESC' },
    });
    const effective = configs.filter((c) => {
      if (c.effective_from && new Date(c.effective_from) > onDate) return false;
      if (c.effective_to && new Date(c.effective_to) < onDate) return false;
      return true;
    });
    return effective[0] ?? null;
  }

  /** Annual-income dry run for the builder's "preview tax on ₨X" panel. */
  async preview(dto: PreviewTaxDto): Promise<TaxComputation & { config_name: string }> {
    const config = dto.tax_config_id
      ? await this.findOne(dto.tax_config_id)
      : await this.getActiveConfig();
    if (!config) {
      throw new NotFoundException('No active tax config to preview against.');
    }
    const settings = await this.settingsRepository.findOne({ where: { id: 1 } });
    const periods = periodsPerYear(settings?.frequency ?? 'monthly');
    const result = computeTax(dto.annual_taxable, this.toSlabInputs(config), periods);
    return { ...result, config_name: config.name };
  }

  /**
   * The monthly tax for an employee's per-period taxable income, honoring the
   * config's `annualize` flag. Called by the payroll engine, which knows only
   * the period's taxable base.
   */
  computeMonthlyTax(
    monthlyTaxable: number,
    config: TaxConfig,
    frequency: string,
  ): TaxComputation {
    const slabs = this.toSlabInputs(config);
    const periods = periodsPerYear(frequency);
    if (config.annualize) {
      return computeTax(monthlyTaxable * periods, slabs, periods);
    }
    // Slabs are per-period: no annualization, monthly == the computed liability.
    return computeTax(monthlyTaxable, slabs, 1);
  }

  private toSlabInputs(config: TaxConfig): TaxSlabInput[] {
    return (config.slabs ?? []).map((s) => ({
      lower_bound: s.lower_bound,
      upper_bound: s.upper_bound ?? null,
      base_tax: s.base_tax,
      rate_percent: s.rate_percent,
    }));
  }

  private buildSlabs(slabs: TaxSlabDto[]): TaxSlab[] {
    return [...slabs]
      .sort((a, b) => a.lower_bound - b.lower_bound)
      .map((s, index) =>
        this.slabRepository.create({
          lower_bound: s.lower_bound,
          upper_bound: s.upper_bound ?? null,
          base_tax: s.base_tax,
          rate_percent: s.rate_percent,
          display_order: s.display_order ?? index,
        }),
      );
  }

  /**
   * A progressive ladder must be non-overlapping and ascending, and only the
   * top bracket may be open-ended. Caught here so a malformed table is a 400
   * rather than a wrong tax at run time.
   */
  private assertSlabs(slabs: TaxSlabDto[]): void {
    if (!slabs || slabs.length === 0) {
      throw new BadRequestException('A tax config needs at least one slab.');
    }
    const ordered = [...slabs].sort((a, b) => a.lower_bound - b.lower_bound);
    for (let i = 0; i < ordered.length; i += 1) {
      const slab = ordered[i];
      if (slab.upper_bound != null && slab.upper_bound <= slab.lower_bound) {
        throw new BadRequestException(
          `Slab ${i + 1}: upper_bound must be greater than lower_bound.`,
        );
      }
      if (slab.upper_bound == null && i !== ordered.length - 1) {
        throw new BadRequestException(
          'Only the highest slab may have an open-ended (null) upper_bound.',
        );
      }
    }
  }
}
