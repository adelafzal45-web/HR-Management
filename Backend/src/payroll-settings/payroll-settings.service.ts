import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PayrollSettings } from './payroll-settings.entity';
import { UpdatePayrollSettingsDto } from './dto/update-payroll-settings.dto';

/**
 * Reads and updates the single global payroll settings row (id=1).
 *
 * Mirrors CompanySettingsService: the migration seeds the row, so `get()`
 * should never miss; the id is always 1 by design and the controller enforces
 * that at the route level.
 */
@Injectable()
export class PayrollSettingsService {
  constructor(
    @InjectRepository(PayrollSettings)
    private readonly payrollSettingsRepository: Repository<PayrollSettings>,
  ) {}

  /** Get the single global payroll settings row. */
  async get(): Promise<PayrollSettings> {
    const settings = await this.payrollSettingsRepository.findOne({
      where: { id: 1 },
    });

    if (!settings) {
      throw new NotFoundException(
        'Payroll settings not found. Run migrations to seed the default row.',
      );
    }

    return settings;
  }

  /** Update the single global payroll settings row. */
  async update(dto: UpdatePayrollSettingsDto): Promise<PayrollSettings> {
    // A PATCH whose keys were all stripped by the whitelist pipe reaches here
    // empty; TypeORM rejects an empty changeset, so treat it as a no-op read.
    if (Object.keys(dto).length === 0) {
      return this.get();
    }

    await this.payrollSettingsRepository.update(1, dto);
    return this.get();
  }
}
