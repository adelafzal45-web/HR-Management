import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PayrollRule } from './payroll-rules.entity';
import { CreatePayrollRuleDto } from './dto/create-payroll-rule.dto';
import { UpdatePayrollRuleDto } from './dto/update-payroll-rule.dto';
import { assertRuleConfigValid } from './payroll-rule-config.validator';
import { RuleType } from './payroll-rule.constants';

/**
 * CRUD + versioning for payroll rules (spec §4–8, §16).
 *
 * Create validates the config against its rule type and stores version 1.
 * Update never mutates an active rule in place: it stores a new version
 * (`version + 1`) and closes the previous row by deactivating it and pointing
 * its `superseded_by` at the new one. The resolver only ever sees active rows,
 * so a superseded rule silently drops out of calculation while remaining in the
 * history the versioning UI reads.
 */
@Injectable()
export class PayrollRulesService {
  constructor(
    @InjectRepository(PayrollRule)
    private readonly ruleRepository: Repository<PayrollRule>,
  ) {}

  async create(dto: CreatePayrollRuleDto): Promise<PayrollRule> {
    assertRuleConfigValid(dto.rule_type as RuleType, dto.config);
    this.assertEffectiveRange(dto.effective_from, dto.effective_to);

    const scopeType = dto.scope_type ?? 'company';
    this.assertScopePair(scopeType, dto.scope_id);

    const rule = this.ruleRepository.create({
      rule_type: dto.rule_type,
      name: dto.name,
      scope_type: scopeType,
      scope_id: scopeType === 'company' ? null : dto.scope_id,
      config: dto.config,
      priority: dto.priority ?? 0,
      is_active: dto.is_active ?? true,
      effective_from: dto.effective_from ? new Date(dto.effective_from) : null,
      effective_to: dto.effective_to ? new Date(dto.effective_to) : null,
      version: 1,
      superseded_by: null,
    });
    return this.ruleRepository.save(rule);
  }

  /** Active rules by default; pass includeInactive to see superseded history. */
  findAll(ruleType?: string, includeInactive = false): Promise<PayrollRule[]> {
    const where: Record<string, unknown> = {};
    if (ruleType) where.rule_type = ruleType;
    if (!includeInactive) where.is_active = true;
    return this.ruleRepository.find({
      where,
      order: { rule_type: 'ASC', priority: 'DESC', created_at: 'DESC' },
    });
  }

  async findOne(id: string): Promise<PayrollRule> {
    const rule = await this.ruleRepository.findOne({ where: { rule_id: id } });
    if (!rule) {
      throw new NotFoundException(`Payroll rule "${id}" not found.`);
    }
    return rule;
  }

  async update(id: string, dto: UpdatePayrollRuleDto): Promise<PayrollRule> {
    const current = await this.findOne(id);
    if (current.superseded_by) {
      throw new BadRequestException(
        'This rule version has already been superseded; edit its latest version instead.',
      );
    }

    const ruleType = (dto.rule_type ?? current.rule_type) as RuleType;
    const config = dto.config ?? current.config;
    assertRuleConfigValid(ruleType, config);

    const scopeType = dto.scope_type ?? current.scope_type;
    const scopeId =
      scopeType === 'company'
        ? null
        : dto.scope_id !== undefined
          ? dto.scope_id
          : current.scope_id;
    this.assertScopePair(scopeType, scopeId);

    const effectiveFrom =
      dto.effective_from !== undefined
        ? dto.effective_from
          ? new Date(dto.effective_from)
          : null
        : (current.effective_from ?? null);
    const effectiveTo =
      dto.effective_to !== undefined
        ? dto.effective_to
          ? new Date(dto.effective_to)
          : null
        : (current.effective_to ?? null);
    this.assertEffectiveRange(effectiveFrom, effectiveTo);

    // Store the new version, then close the old one.
    const next = this.ruleRepository.create({
      rule_type: ruleType,
      name: dto.name ?? current.name,
      scope_type: scopeType,
      scope_id: scopeId,
      config,
      priority: dto.priority ?? current.priority,
      is_active: dto.is_active ?? current.is_active,
      effective_from: effectiveFrom,
      effective_to: effectiveTo,
      version: current.version + 1,
      superseded_by: null,
    });
    const saved = await this.ruleRepository.save(next);

    await this.ruleRepository.update(current.rule_id, {
      is_active: false,
      superseded_by: saved.rule_id,
    });

    return saved;
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.findOne(id);
    await this.ruleRepository.delete(id);
    return { message: 'Payroll rule deleted successfully' };
  }

  /**
   * The full version lineage of a rule, oldest → newest, for the §16 UI. Walks
   * back to the root (the row nothing supersedes) then forward along
   * `superseded_by`, with a cycle guard.
   */
  async versions(id: string): Promise<PayrollRule[]> {
    const start = await this.findOne(id);

    // Walk back to the root.
    let root = start;
    const guard = new Set<string>([root.rule_id]);
    for (;;) {
      const predecessor = await this.ruleRepository.findOne({
        where: { superseded_by: root.rule_id },
      });
      if (!predecessor || guard.has(predecessor.rule_id)) break;
      guard.add(predecessor.rule_id);
      root = predecessor;
    }

    // Walk forward collecting the chain.
    const chain: PayrollRule[] = [root];
    const seen = new Set<string>([root.rule_id]);
    let cursor: PayrollRule | null = root;
    while (cursor?.superseded_by && !seen.has(cursor.superseded_by)) {
      const nextId: string = cursor.superseded_by;
      const nextRow = await this.ruleRepository.findOne({
        where: { rule_id: nextId },
      });
      if (!nextRow) break;
      seen.add(nextRow.rule_id);
      chain.push(nextRow);
      cursor = nextRow;
    }

    return chain;
  }

  /** effective_to, when both are set, must not precede effective_from. */
  /**
   * A scoped rule must name its target. Without this, a `department` rule with
   * no `scope_id` saves happily and then never matches anyone — the resolver's
   * `scopeMatches` requires a non-null id — so HR would see a configured rule
   * that silently never fires. Mirrors the pairing the structure-assignment DTO
   * enforces for the same scope model.
   */
  private assertScopePair(scopeType: string, scopeId?: string | null): void {
    if (scopeType === 'company') return;
    if (!scopeId) {
      throw new BadRequestException(
        `scope_id is required for a "${scopeType}"-scoped rule; omit it only for company scope.`,
      );
    }
  }

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
