import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { PayrollPeriod } from './payroll-periods.entity';
import { PayrollSettings } from '../payroll-settings/payroll-settings.entity';
import { Payslip } from '../payslips/payslips.entity';
import { SalaryComponent } from '../salary-components/salary-components.entity';
import {
  SalaryStructure,
  SalaryStructureAssignment,
  SalaryStructureComponent,
} from '../salary-structures/salary-structures.entity';
import { PayrollRule } from '../payroll-rules/payroll-rules.entity';
import { TaxConfig, TaxSlab } from '../payroll-tax/payroll-tax.entity';
import {
  QUICK_SETUP_COMPONENTS,
  QUICK_SETUP_STRUCTURE_NAME,
  QUICK_SETUP_TAX_CONFIG,
} from './payroll-quick-setup.constants';
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

/** One thing Quick Setup will create, or skip because it already exists. */
export interface QuickSetupItem {
  key: string;
  label: string;
  action: 'create' | 'skip';
  detail: string;
}

/** The dry-run answer to "what would one-click setup do?". */
export interface QuickSetupPreview {
  items: QuickSetupItem[];
  /** True when every item is a skip — the second run of an idempotent setup. */
  already_complete: boolean;
}

/** What Quick Setup actually did. */
export interface QuickSetupResult {
  created: string[];
  skipped: string[];
  setup: SetupStatus;
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
    private readonly dataSource: DataSource,
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

  // ---- One-click Quick Setup ----------------------------------------------

  /**
   * Dry run: what would "Set Up Payroll Automatically" create, and what is
   * already there? Writes nothing, so HR can read the list before committing.
   * The probes are exactly the ones `quickSetup` re-runs inside its transaction,
   * so the preview and the outcome agree unless someone else changes
   * configuration in between.
   */
  async previewQuickSetup(): Promise<QuickSetupPreview> {
    const items = await this.planQuickSetup(this.dataSource.manager);
    return {
      items,
      already_complete: items.every((i) => i.action === 'skip'),
    };
  }

  /**
   * Stand payroll up in one click: settings row, three standard components, a
   * "Standard Staff" structure assigned company-wide from the 1st of this month,
   * an FBR-style tax config, and a default absent rule.
   *
   * **Idempotent** — every step is guarded by an existence check, so a second
   * call creates nothing and reports everything as skipped. Runs in a single
   * transaction: a half-configured payroll is worse than an unconfigured one,
   * because the hard gate would let a run start against it.
   *
   * Everything it writes is an ordinary configurable record. Nothing here is
   * special-cased by the engine, and HR can edit or delete any of it afterwards.
   */
  async quickSetup(): Promise<QuickSetupResult> {
    const created: string[] = [];
    const skipped: string[] = [];

    await this.dataSource.transaction(async (manager) => {
      // 1. Global settings row (entity defaults are the spec's defaults: PKR,
      //    monthly, attendance working days, 8h/day, close day 20, OT off).
      const settingsRepo = manager.getRepository(PayrollSettings);
      const settings = await settingsRepo.findOne({ where: { id: 1 } });
      if (settings) {
        skipped.push('Payroll settings');
      } else {
        await settingsRepo.save(settingsRepo.create({ id: 1 }));
        created.push('Payroll settings (PKR, monthly, close day 20, OT off)');
      }

      // 2. Standard components, keyed by their unique code.
      const componentRepo = manager.getRepository(SalaryComponent);
      const componentIds: string[] = [];
      for (const spec of QUICK_SETUP_COMPONENTS) {
        const existing = await componentRepo.findOne({
          where: { code: spec.code },
        });
        if (existing) {
          componentIds.push(existing.component_id);
          skipped.push(`Component "${spec.name}"`);
          continue;
        }
        const saved = await componentRepo.save(
          componentRepo.create({
            code: spec.code,
            name: spec.name,
            type: spec.type,
            calculation_type: spec.calculation_type,
            amount: spec.amount,
            is_taxable: spec.is_taxable,
            include_in_gross: spec.include_in_gross,
            display_order: spec.display_order,
            is_active: true,
            is_recurring: true,
          }),
        );
        componentIds.push(saved.component_id);
        created.push(`Component "${spec.name}" — ${spec.description}`);
      }

      // 3. The structure, its memberships, and a company-wide assignment. The
      //    assignment carries no base_salary, so BASIC falls back to each
      //    employee's own `users.salary` — one structure fits everyone.
      const structureRepo = manager.getRepository(SalaryStructure);
      let structure = await structureRepo.findOne({
        where: { name: QUICK_SETUP_STRUCTURE_NAME },
      });
      if (structure) {
        skipped.push(`Structure "${QUICK_SETUP_STRUCTURE_NAME}"`);
      } else {
        structure = await structureRepo.save(
          structureRepo.create({
            name: QUICK_SETUP_STRUCTURE_NAME,
            description:
              'Created by Quick Setup. Basic comes from each employee record; ' +
              'allowances and deductions are the components below.',
            is_active: true,
          }),
        );
        created.push(`Structure "${QUICK_SETUP_STRUCTURE_NAME}"`);
      }

      const structureComponentRepo = manager.getRepository(
        SalaryStructureComponent,
      );
      for (const [index, componentId] of componentIds.entries()) {
        const already = await structureComponentRepo.findOne({
          where: {
            structure_id: structure.structure_id,
            component_id: componentId,
          },
        });
        if (already) continue;
        await structureComponentRepo.save(
          structureComponentRepo.create({
            structure_id: structure.structure_id,
            component_id: componentId,
            display_order: (index + 1) * 10,
          }),
        );
      }

      const assignmentRepo = manager.getRepository(SalaryStructureAssignment);
      const activeAssignments = await assignmentRepo.count({
        where: { is_active: true },
      });
      if (activeAssignments > 0) {
        skipped.push('Structure assignment');
      } else {
        const now = new Date();
        const firstOfMonth = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
        );
        await assignmentRepo.save(
          assignmentRepo.create({
            structure_id: structure.structure_id,
            scope_type: 'company',
            scope_id: null,
            base_salary: null,
            effective_from: firstOfMonth,
            is_active: true,
          }),
        );
        created.push(
          `Company-wide assignment of "${QUICK_SETUP_STRUCTURE_NAME}" ` +
            `effective ${firstOfMonth.toISOString().slice(0, 10)}`,
        );
      }

      // 4. Tax config + slabs. Skipped whenever any active config exists, so an
      //    HR-authored table is never shadowed by the starter one.
      const taxConfigRepo = manager.getRepository(TaxConfig);
      const activeTax = await taxConfigRepo.findOne({
        where: { is_active: true },
      });
      if (activeTax) {
        skipped.push('Income-tax config');
      } else {
        const config = await taxConfigRepo.save(
          taxConfigRepo.create({
            name: QUICK_SETUP_TAX_CONFIG.name,
            regime: QUICK_SETUP_TAX_CONFIG.regime,
            currency: QUICK_SETUP_TAX_CONFIG.currency,
            annualize: true,
            is_active: true,
            version: 1,
          }),
        );
        const slabRepo = manager.getRepository(TaxSlab);
        await slabRepo.save(
          QUICK_SETUP_TAX_CONFIG.slabs.map((slab, index) =>
            slabRepo.create({
              tax_config_id: config.tax_config_id,
              lower_bound: slab.lower_bound,
              upper_bound: slab.upper_bound,
              base_tax: slab.base_tax,
              rate_percent: slab.rate_percent,
              display_order: index,
            }),
          ),
        );
        created.push(
          `Tax config "${QUICK_SETUP_TAX_CONFIG.name}" with ` +
            `${QUICK_SETUP_TAX_CONFIG.slabs.length} annual slabs (review the rates)`,
        );
      }

      // 5. A default absent rule — one day's basic per unpaid absent day. The
      //    engine already falls back to this when no rule exists; creating it
      //    explicitly makes the policy visible and editable in the Rules screen.
      const ruleRepo = manager.getRepository(PayrollRule);
      const absentRule = await ruleRepo.findOne({
        where: { rule_type: 'absent', is_active: true },
      });
      if (absentRule) {
        skipped.push('Absence rule');
      } else {
        await ruleRepo.save(
          ruleRepo.create({
            rule_type: 'absent',
            name: 'Standard absence deduction',
            scope_type: 'company',
            scope_id: null,
            config: { mode: 'per_day', multiplier: 1 },
            priority: 0,
            is_active: true,
            version: 1,
          }),
        );
        created.push(
          'Absence rule — one day of basic pay per unpaid absent day',
        );
      }
    });

    return { created, skipped, setup: await this.getSetupStatus() };
  }

  /**
   * The shared probe set behind both the preview and the run. Takes an
   * `EntityManager` so the transaction can re-check with the same visibility it
   * will write under.
   */
  private async planQuickSetup(
    manager: EntityManager,
  ): Promise<QuickSetupItem[]> {
    const items: QuickSetupItem[] = [];

    const settings = await manager
      .getRepository(PayrollSettings)
      .findOne({ where: { id: 1 } });
    items.push({
      key: 'settings',
      label: 'Payroll settings',
      action: settings ? 'skip' : 'create',
      detail: settings
        ? `Already configured — ${settings.frequency}, ${settings.currency}.`
        : 'Create the settings row: PKR, monthly, attendance working days, 8h/day, payslip close day 20, overtime off.',
    });

    for (const spec of QUICK_SETUP_COMPONENTS) {
      const existing = await manager
        .getRepository(SalaryComponent)
        .findOne({ where: { code: spec.code } });
      items.push({
        key: `component:${spec.code}`,
        label: `Salary component — ${spec.name}`,
        action: existing ? 'skip' : 'create',
        detail: existing
          ? `"${existing.name}" already exists with code ${spec.code}.`
          : spec.description,
      });
    }

    const structure = await manager
      .getRepository(SalaryStructure)
      .findOne({ where: { name: QUICK_SETUP_STRUCTURE_NAME } });
    items.push({
      key: 'structure',
      label: `Salary structure — ${QUICK_SETUP_STRUCTURE_NAME}`,
      action: structure ? 'skip' : 'create',
      detail: structure
        ? 'A structure with this name already exists.'
        : 'Bundle the three components into one reusable structure.',
    });

    const activeAssignments = await manager
      .getRepository(SalaryStructureAssignment)
      .count({ where: { is_active: true } });
    items.push({
      key: 'assignment',
      label: 'Company-wide structure assignment',
      action: activeAssignments > 0 ? 'skip' : 'create',
      detail:
        activeAssignments > 0
          ? `${activeAssignments} active assignment(s) already cover your employees.`
          : 'Assign the structure to everyone from the 1st of this month. Basic pay still comes from each employee record.',
    });

    const activeTax = await manager
      .getRepository(TaxConfig)
      .findOne({ where: { is_active: true } });
    items.push({
      key: 'tax',
      label: 'Income-tax slabs',
      action: activeTax ? 'skip' : 'create',
      detail: activeTax
        ? `Active config "${activeTax.name}" already in place.`
        : `Create "${QUICK_SETUP_TAX_CONFIG.name}" with ${QUICK_SETUP_TAX_CONFIG.slabs.length} annual slabs. Review the rates against the current finance act.`,
    });

    const absentRule = await manager
      .getRepository(PayrollRule)
      .findOne({ where: { rule_type: 'absent', is_active: true } });
    items.push({
      key: 'absent-rule',
      label: 'Absence deduction rule',
      action: absentRule ? 'skip' : 'create',
      detail: absentRule
        ? `Rule "${absentRule.name}" already active.`
        : 'Deduct one day of basic pay per unpaid absent day.',
    });

    return items;
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
