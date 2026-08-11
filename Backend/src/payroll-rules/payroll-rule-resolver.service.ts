import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PayrollRule } from './payroll-rules.entity';
import { RuleType, ACTIVE_RULE_TYPES } from './payroll-rule.constants';
import { ScopeType, SCOPE_PRIORITY } from '../payroll-engine/payroll.constants';

/** The scope ids of one employee, keyed by scope type (company is always null). */
export type ScopeIdMap = Record<ScopeType, string | null>;

/** The winning rule per type for an employee on a date; a type may be absent. */
export type ResolvedRules = Partial<Record<RuleType, PayrollRule>>;

/**
 * Resolves which payroll rules apply to an employee for a period.
 *
 * Pure database read, deliberately free of any engine/calculation coupling so
 * it can be unit-tested on its own and reused by both the calculation service
 * and the rule-preview endpoint. For each rule type it picks the highest
 * priority active rule whose scope matches the employee and whose effective
 * window overlaps the date — the same precedence used for salary-structure
 * assignments (employee > designation > department > job_category > company),
 * with `priority` then the most recent `effective_from` breaking ties.
 *
 * Only the currently-effective version of a rule is considered: a superseded
 * row has its `effective_to` closed, so `isEffective` filters it out.
 */
@Injectable()
export class PayrollRuleResolverService {
  constructor(
    @InjectRepository(PayrollRule)
    private readonly ruleRepository: Repository<PayrollRule>,
  ) {}

  /**
   * Resolve the active rule for each engine-read rule type. `onDate` is the
   * period date the rules must be effective on (typically the period start).
   */
  async resolveRules(
    scopeIds: ScopeIdMap,
    onDate: Date,
  ): Promise<ResolvedRules> {
    const candidates = await this.ruleRepository.find({
      where: { is_active: true },
    });

    const resolved: ResolvedRules = {};
    for (const ruleType of ACTIVE_RULE_TYPES) {
      const match = this.pickWinner(
        candidates.filter((r) => r.rule_type === ruleType),
        scopeIds,
        onDate,
      );
      if (match) resolved[ruleType] = match;
    }
    return resolved;
  }

  /** Highest-priority, effective, scope-matching rule from a same-type list. */
  private pickWinner(
    rules: PayrollRule[],
    scopeIds: ScopeIdMap,
    onDate: Date,
  ): PayrollRule | null {
    const matches = rules
      .filter((r) => this.isEffective(r.effective_from, r.effective_to, onDate))
      .filter((r) => this.scopeMatches(r, scopeIds));

    if (matches.length === 0) return null;

    matches.sort((a, b) => {
      const byScope =
        SCOPE_PRIORITY[b.scope_type as ScopeType] -
        SCOPE_PRIORITY[a.scope_type as ScopeType];
      if (byScope !== 0) return byScope;
      if (b.priority !== a.priority) return b.priority - a.priority;
      return this.effectiveFromTime(b) - this.effectiveFromTime(a);
    });

    return matches[0];
  }

  private scopeMatches(rule: PayrollRule, scopeIds: ScopeIdMap): boolean {
    const type = rule.scope_type as ScopeType;
    if (type === 'company') return true;
    return rule.scope_id != null && rule.scope_id === scopeIds[type];
  }

  /** A rule is in effect on a date when its window contains it. */
  private isEffective(
    from: Date | string | null | undefined,
    to: Date | string | null | undefined,
    onDate: Date,
  ): boolean {
    if (from && new Date(from) > onDate) return false;
    if (to && new Date(to) < onDate) return false;
    return true;
  }

  private effectiveFromTime(rule: PayrollRule): number {
    return rule.effective_from ? new Date(rule.effective_from).getTime() : 0;
  }
}
