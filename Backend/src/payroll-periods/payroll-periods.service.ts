import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PayrollPeriod } from './payroll-periods.entity';
import { PayrollSettings } from '../payroll-settings/payroll-settings.entity';
import { Payslip } from '../payslips/payslips.entity';
import { SalaryComponent } from '../salary-components/salary-components.entity';
import { SalaryStructureAssignment } from '../salary-structures/salary-structures.entity';
import { CreatePayrollPeriodDto } from './dto/create-payroll-period.dto';
import { UpdatePayrollPeriodDto } from './dto/update-payroll-period.dto';
import {
  PayrollCalculationService,
  PeriodRunResult,
} from '../payroll-engine/payroll-calculation.service';
import { PayrollTaxService } from '../payroll-tax/payroll-tax.service';

/** Statuses from which a run may still be (re)processed. */
const PROCESSABLE_STATUSES = ['draft', 'pending_approval', 'approved'];

/** One line of the "Activate Payroll" checklist (spec §1 setup gate). */
export interface SetupCheck {
  key: string;
  label: string;
  passed: boolean;
  required: boolean;
  detail: string;
}

/** The overall setup readiness — `ready` is true only when every required check passes. */
export interface SetupStatus {
  ready: boolean;
  checks: SetupCheck[];
}

/**
 * Owns the payroll period lifecycle (spec §1 + the process/approve/lock
 * workflow). CRUD is limited so a period cannot be edited or deleted once it
 * carries payslips; state advances only through the dedicated transitions,
 * each of which respects the global settings (approval on/off, locking on/off).
 */
@Injectable()
export class PayrollPeriodsService {
  constructor(
    @InjectRepository(PayrollPeriod)
    private readonly periodRepository: Repository<PayrollPeriod>,
    @InjectRepository(PayrollSettings)
    private readonly settingsRepository: Repository<PayrollSettings>,
    @InjectRepository(Payslip)
    private readonly payslipRepository: Repository<Payslip>,
    @InjectRepository(SalaryComponent)
    private readonly componentRepository: Repository<SalaryComponent>,
    @InjectRepository(SalaryStructureAssignment)
    private readonly assignmentRepository: Repository<SalaryStructureAssignment>,
    private readonly calculationService: PayrollCalculationService,
    private readonly taxService: PayrollTaxService,
  ) {}

  async create(dto: CreatePayrollPeriodDto): Promise<PayrollPeriod> {
    if (dto.period_end < dto.period_start) {
      throw new BadRequestException(
        'period_end cannot be earlier than period_start.',
      );
    }

    const settings = await this.getSettings();
    const period = this.periodRepository.create({
      name: dto.name,
      frequency: dto.frequency ?? settings.frequency,
      period_start: new Date(dto.period_start),
      period_end: new Date(dto.period_end),
      pay_date: dto.pay_date ? new Date(dto.pay_date) : null,
      working_days:
        dto.working_days ??
        (settings.working_days_source === 'fixed'
          ? settings.fixed_working_days
          : 0),
      status: 'draft',
      notes: dto.notes ?? null,
    });
    return this.periodRepository.save(period);
  }

  findAll(): Promise<PayrollPeriod[]> {
    return this.periodRepository.find({
      order: { period_start: 'DESC' },
    });
  }

  async findOne(id: string): Promise<PayrollPeriod> {
    const period = await this.periodRepository.findOne({
      where: { period_id: id },
      relations: { preparedBy: true, approvedBy: true },
    });
    if (!period) {
      throw new NotFoundException(`Payroll period "${id}" not found.`);
    }
    return period;
  }

  async update(
    id: string,
    dto: UpdatePayrollPeriodDto,
  ): Promise<PayrollPeriod> {
    const period = await this.findOne(id);
    if (period.status !== 'draft') {
      throw new ConflictException(
        `Only a draft period can be edited (this one is "${period.status}"). Create a new period instead.`,
      );
    }

    const nextStart = dto.period_start
      ? new Date(dto.period_start)
      : period.period_start;
    const nextEnd = dto.period_end
      ? new Date(dto.period_end)
      : period.period_end;
    if (nextEnd < nextStart) {
      throw new BadRequestException(
        'period_end cannot be earlier than period_start.',
      );
    }

    Object.assign(period, {
      name: dto.name ?? period.name,
      frequency: dto.frequency ?? period.frequency,
      period_start: nextStart,
      period_end: nextEnd,
      pay_date:
        dto.pay_date !== undefined
          ? dto.pay_date
            ? new Date(dto.pay_date)
            : null
          : period.pay_date,
      working_days: dto.working_days ?? period.working_days,
      notes: dto.notes ?? period.notes,
    });
    return this.periodRepository.save(period);
  }

  async remove(id: string): Promise<{ message: string }> {
    const period = await this.findOne(id);
    if (period.status !== 'draft') {
      throw new ConflictException(
        `Only a draft period can be deleted (this one is "${period.status}").`,
      );
    }
    await this.periodRepository.delete(id);
    return { message: 'Payroll period deleted successfully' };
  }

  // ---- Workflow transitions -----------------------------------------------

  /**
   * Generate payslips for the period, then advance the status: to
   * `pending_approval` when approval is enabled, otherwise straight to
   * `approved`. Re-processable while not locked/paid, so HR can re-run after a
   * correction. Records who prepared it.
   */
  async process(
    id: string,
    actorId: string,
  ): Promise<{ period: PayrollPeriod; run: PeriodRunResult }> {
    const period = await this.findOne(id);
    if (!PROCESSABLE_STATUSES.includes(period.status)) {
      throw new ConflictException(
        `A "${period.status}" period cannot be processed. Unlock or create a new period.`,
      );
    }

    // Hard gate (spec §1): refuse to run until the required setup is in place.
    const setup = await this.getSetupStatus();
    if (!setup.ready) {
      const missing = setup.checks
        .filter((c) => c.required && !c.passed)
        .map((c) => c.label)
        .join('; ');
      throw new BadRequestException(
        `Payroll setup is incomplete — resolve before processing: ${missing}.`,
      );
    }

    const settings = await this.getSettings();

    period.status = 'processing';
    period.prepared_by = actorId;
    period.processed_at = new Date();
    await this.periodRepository.save(period);

    const run = await this.calculationService.generateForPeriod(id);

    period.status = settings.approval_enabled ? 'pending_approval' : 'approved';
    if (!settings.approval_enabled) {
      period.approved_by = null;
      period.approved_at = new Date();
    }
    const saved = await this.periodRepository.save(period);

    return { period: saved, run };
  }

  /** Administrator approval of a processed run (spec: Admin approves HR's run). */
  async approve(id: string, actorId: string): Promise<PayrollPeriod> {
    const settings = await this.getSettings();
    if (!settings.approval_enabled) {
      throw new BadRequestException(
        'Approval is disabled in payroll settings; runs are approved automatically on processing.',
      );
    }

    const period = await this.findOne(id);
    if (period.status !== 'pending_approval') {
      throw new ConflictException(
        `Only a period pending approval can be approved (this one is "${period.status}").`,
      );
    }

    period.status = 'approved';
    period.approved_by = actorId;
    period.approved_at = new Date();
    return this.periodRepository.save(period);
  }

  /**
   * Freeze an approved period and its payslips against further edits. Requires
   * locking to be enabled in settings.
   */
  async lock(id: string): Promise<PayrollPeriod> {
    const settings = await this.getSettings();
    if (!settings.payroll_locking_enabled) {
      throw new BadRequestException(
        'Payroll locking is disabled in payroll settings.',
      );
    }

    const period = await this.findOne(id);
    if (period.status !== 'approved') {
      throw new ConflictException(
        `Only an approved period can be locked (this one is "${period.status}").`,
      );
    }

    period.status = 'locked';
    period.locked_at = new Date();
    const saved = await this.periodRepository.save(period);

    await this.payslipRepository.update(
      { period_id: id },
      { status: 'locked' },
    );

    return saved;
  }

  // ---- Setup readiness (the "Activate Payroll" hard gate) -----------------

  /**
   * The setup checklist that gates processing (spec §1). A period cannot be
   * processed until every *required* check passes: a saved settings row, at
   * least one active salary component, and at least one active structure
   * assignment. A configured tax config is surfaced but optional (payroll runs
   * fine with zero tax). Drives both the server-side gate in `process` and the
   * frontend Setup Checklist banner.
   */
  async getSetupStatus(): Promise<SetupStatus> {
    const [settings, activeComponents, activeAssignments, activeTaxConfig] =
      await Promise.all([
        this.settingsRepository.findOne({ where: { id: 1 } }),
        this.componentRepository.count({ where: { is_active: true } }),
        this.assignmentRepository.count({ where: { is_active: true } }),
        this.taxService.getActiveConfig(),
      ]);
    const hasTaxConfig = !!activeTaxConfig;

    const checks: SetupCheck[] = [
      {
        key: 'settings',
        label: 'Payroll settings saved',
        passed: !!settings,
        required: true,
        detail: settings
          ? `Frequency ${settings.frequency}, currency ${settings.currency}.`
          : 'The payroll settings row is missing — run the payroll migrations.',
      },
      {
        key: 'components',
        label: 'At least one active salary component',
        passed: activeComponents > 0,
        required: true,
        detail: `${activeComponents} active component(s).`,
      },
      {
        key: 'assignments',
        label: 'At least one active structure assignment',
        passed: activeAssignments > 0,
        required: true,
        detail: `${activeAssignments} active assignment(s).`,
      },
      {
        key: 'tax',
        label: 'Income-tax config (optional)',
        passed: hasTaxConfig,
        required: false,
        detail: hasTaxConfig
          ? `Active tax config "${activeTaxConfig?.name}".`
          : 'No tax config — payroll runs with zero income tax until one is added.',
      },
    ];

    const ready = checks.every((c) => !c.required || c.passed);
    return { ready, checks };
  }

  private async getSettings(): Promise<PayrollSettings> {
    const settings = await this.settingsRepository.findOne({
      where: { id: 1 },
    });
    if (!settings) {
      throw new NotFoundException(
        'Payroll settings have not been initialised. Run the payroll migrations.',
      );
    }
    return settings;
  }
}
