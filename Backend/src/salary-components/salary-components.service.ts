import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SalaryComponent } from './salary-components.entity';
import { CreateSalaryComponentDto } from './dto/create-salary-component.dto';
import { UpdateSalaryComponentDto } from './dto/update-salary-component.dto';
import { TestFormulaDto } from './dto/test-formula.dto';
import {
  evaluateFormula,
  FormulaError,
  FormulaScope,
  PAYROLL_VARIABLES,
  PAYROLL_VARIABLE_NAMES,
  validateFormula,
} from '../payroll-engine/formula/formula-evaluator';

/** The result of a "Test Rule" evaluation. */
export interface FormulaTestResult {
  ok: boolean;
  result: number | null;
  error: string | null;
  /** The full scope used, so the UI can show which values fed the result. */
  scope: FormulaScope;
}

/**
 * Demo values for a formula test when the caller supplies none. Chosen to make
 * percentages and per-day math read cleanly (BASIC 100000, 26 working days).
 */
const DEMO_SCOPE: FormulaScope = {
  BASIC: 100000,
  GROSS: 150000,
  WORKING_DAYS: 26,
  PRESENT_DAYS: 24,
  ABSENT_DAYS: 2,
  PAID_LEAVE: 1,
  UNPAID_LEAVE: 1,
  OT_HOURS: 5,
  OT_AMOUNT: 3000,
  LATE_MINUTES: 30,
  HOURLY_RATE: 480.77,
  DAILY_RATE: 3846.15,
  BONUS: 0,
  TAX: 0,
  LOAN_DEDUCTION: 0,
};

@Injectable()
export class SalaryComponentsService {
  constructor(
    @InjectRepository(SalaryComponent)
    private readonly componentRepository: Repository<SalaryComponent>,
  ) {}

  async create(dto: CreateSalaryComponentDto): Promise<SalaryComponent> {
    this.assertFormulaConsistent(dto.calculation_type, dto.formula);
    this.assertEffectiveRange(dto.effective_from, dto.effective_to);

    const existing = await this.componentRepository.findOne({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException(
        `A salary component with code "${dto.code}" already exists.`,
      );
    }

    const component = this.componentRepository.create(dto);
    return this.componentRepository.save(component);
  }

  findAll(): Promise<SalaryComponent[]> {
    return this.componentRepository.find({
      order: { display_order: 'ASC', name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<SalaryComponent> {
    const component = await this.componentRepository.findOne({
      where: { component_id: id },
    });
    if (!component) {
      throw new NotFoundException(`Salary component "${id}" not found.`);
    }
    return component;
  }

  async update(
    id: string,
    dto: UpdateSalaryComponentDto,
  ): Promise<SalaryComponent> {
    const component = await this.findOne(id);

    // Validate the merged result so flipping to formula-type without a formula
    // (or vice versa) is caught here rather than at calculation time.
    this.assertFormulaConsistent(
      dto.calculation_type ?? component.calculation_type,
      dto.formula ?? component.formula ?? undefined,
    );
    this.assertEffectiveRange(
      dto.effective_from ?? component.effective_from ?? undefined,
      dto.effective_to ?? component.effective_to ?? undefined,
    );

    if (dto.code && dto.code !== component.code) {
      const clash = await this.componentRepository.findOne({
        where: { code: dto.code },
      });
      if (clash) {
        throw new ConflictException(
          `A salary component with code "${dto.code}" already exists.`,
        );
      }
    }

    if (Object.keys(dto).length === 0) {
      return component;
    }

    await this.componentRepository.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.findOne(id);
    await this.componentRepository.delete(id);
    return { message: 'Salary component deleted successfully' };
  }

  /**
   * Evaluate a formula against sample values (the "Test Rule" feature). Never
   * throws for a bad formula — returns the error in the payload so the builder
   * can render it inline.
   */
  testFormula(dto: TestFormulaDto): FormulaTestResult {
    const scope: FormulaScope = { ...DEMO_SCOPE };
    if (dto.sample) {
      for (const name of PAYROLL_VARIABLE_NAMES) {
        const provided = dto.sample[name];
        if (typeof provided === 'number' && Number.isFinite(provided)) {
          scope[name] = provided;
        }
      }
    }

    try {
      const result = evaluateFormula(dto.formula, scope);
      return { ok: true, result, error: null, scope };
    } catch (err) {
      const message =
        err instanceof FormulaError ? err.message : 'Invalid formula.';
      return { ok: false, result: null, error: message, scope };
    }
  }

  /** The whitelist, exposed so the builder can list the variables it may use. */
  listVariables(): Array<{ name: string; description: string }> {
    return PAYROLL_VARIABLE_NAMES.map((name) => ({
      name,
      description: PAYROLL_VARIABLES[name],
    }));
  }

  /**
   * A formula-typed component must carry a syntactically valid formula, and a
   * non-formula component must not smuggle one in. Keeps the calculation service
   * from having to defend against inconsistent rows at run time.
   */
  private assertFormulaConsistent(
    calculationType: string,
    formula?: string | null,
  ): void {
    if (calculationType === 'formula') {
      if (!formula || formula.trim() === '') {
        throw new BadRequestException(
          'A formula is required when calculation_type is "formula".',
        );
      }
      const error = validateFormula(formula);
      if (error) {
        throw new BadRequestException(`Invalid formula: ${error}`);
      }
    }
  }

  /**
   * effective_to, when both are set, must not precede effective_from. Accepts
   * the DTO's ISO strings and the entity's `Date` columns alike — a 'date'
   * column round-trips as either depending on the driver, so both are coerced
   * to a comparable `YYYY-MM-DD` string first.
   */
  private assertEffectiveRange(
    from?: string | Date | null,
    to?: string | Date | null,
  ): void {
    const fromKey = this.toDateKey(from);
    const toKey = this.toDateKey(to);
    if (fromKey && toKey && toKey < fromKey) {
      throw new BadRequestException(
        'effective_to cannot be earlier than effective_from.',
      );
    }
  }

  private toDateKey(value?: string | Date | null): string | null {
    if (!value) return null;
    return value instanceof Date ? value.toISOString().slice(0, 10) : value;
  }
}
