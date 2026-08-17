import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { EmployeeFieldSettings } from './employee-field-settings.entity';
import { UpdateEmployeeFieldSettingsDto } from './dto/update-employee-field-settings.dto';
import {
  DEFAULT_EMPLOYEE_FIELD_CONFIG,
  EMPLOYEE_CONFIGURABLE_FIELDS,
  EMPLOYEE_CONFIGURABLE_FIELD_SET,
  type EmployeeConfigurableField,
} from '../users/dto/validation.constants';

/** The shape returned to clients: the effective config plus when it changed. */
export interface EmployeeFieldSettingsView {
  field_config: Record<EmployeeConfigurableField, boolean>;
  updated_at: Date;
}

@Injectable()
export class EmployeeFieldSettingsService {
  constructor(
    @InjectRepository(EmployeeFieldSettings)
    private readonly repository: Repository<EmployeeFieldSettings>,
  ) {}

  /**
   * The single settings row (id=1).
   *
   * The migration seeds it, so it should always exist for the GET/PATCH paths;
   * a 404 here means the DB was set up without migrations. Enforcement uses the
   * tolerant `getEffectiveConfigOrDefaults` instead, so a missing row never
   * blocks employee creation.
   */
  private async getRow(): Promise<EmployeeFieldSettings> {
    const row = await this.repository.findOne({ where: { id: 1 } });

    if (!row) {
      throw new NotFoundException(
        'Employee field settings not found. Run migrations to seed the default row.',
      );
    }

    return row;
  }

  /**
   * Layers stored overrides over the built-in defaults and narrows to the known
   * configurable fields.
   *
   * The result always has exactly one boolean per configurable field: a field
   * absent from storage falls back to its default, and a stale key left in the
   * jsonb (a field later removed from the set) is dropped. Both callers — the
   * GET payload and the backend enforcement — depend on this being total.
   */
  private toEffectiveConfig(
    stored: Partial<Record<string, boolean>> | null | undefined,
  ): Record<EmployeeConfigurableField, boolean> {
    const effective = { ...DEFAULT_EMPLOYEE_FIELD_CONFIG };
    if (stored) {
      for (const field of EMPLOYEE_CONFIGURABLE_FIELDS) {
        const value = stored[field];
        if (typeof value === 'boolean') {
          effective[field] = value;
        }
      }
    }
    return effective;
  }

  /** GET payload: the row with its config normalised to the effective map. */
  async get(): Promise<EmployeeFieldSettingsView> {
    const row = await this.getRow();
    return {
      field_config: this.toEffectiveConfig(row.field_config),
      updated_at: row.updated_at,
    };
  }

  /**
   * Effective requiredness map for backend enforcement.
   *
   * Deliberately tolerant of a missing row: if settings were never seeded it
   * falls back to the defaults (which mirror the pre-feature hard-coded
   * behaviour) rather than throwing, so employee create/update never fails
   * merely because the config row is absent.
   */
  async getEffectiveConfigOrDefaults(): Promise<
    Record<EmployeeConfigurableField, boolean>
  > {
    const row = await this.repository.findOne({ where: { id: 1 } });
    return this.toEffectiveConfig(row?.field_config);
  }

  /**
   * Partial merge update.
   *
   * Every incoming key must be a configurable field and every value a boolean —
   * both checked here rather than in the DTO, since a class-validator decorator
   * can't validate a dynamic key set. A field omitted from the body keeps its
   * stored value.
   */
  async update(
    dto: UpdateEmployeeFieldSettingsDto,
  ): Promise<EmployeeFieldSettingsView> {
    const incoming = dto.field_config ?? {};

    for (const [key, value] of Object.entries(incoming)) {
      if (!EMPLOYEE_CONFIGURABLE_FIELD_SET.has(key)) {
        throw new BadRequestException(
          `Unknown employee field '${key}'. Configurable fields are: ${EMPLOYEE_CONFIGURABLE_FIELDS.join(', ')}.`,
        );
      }
      if (typeof value !== 'boolean') {
        throw new BadRequestException(
          `The required flag for '${key}' must be true or false`,
        );
      }
    }

    const row = await this.getRow();
    row.field_config = {
      ...(row.field_config ?? {}),
      ...incoming,
    } as Record<EmployeeConfigurableField, boolean>;

    await this.repository.save(row);

    return this.get();
  }
}
