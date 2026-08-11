/**
 * Unit tests for the rule resolver (spec §4–8, §16).
 *
 * The resolver decides which single rule of each type an employee is subject
 * to. Two things must hold: the scope precedence (employee > designation >
 * department > job_category > company) beats raw priority, and a superseded
 * version — whose effective window was closed when the new version was written
 * — never wins over the version that replaced it.
 *
 * The repository is a stub returning plain objects: the resolver does one
 * unfiltered `find` and applies all precedence in memory, so no database is
 * needed to pin the behaviour.
 */

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import {
  PayrollRuleResolverService,
  ScopeIdMap,
} from './payroll-rule-resolver.service';
import { PayrollRule } from './payroll-rules.entity';

const SCOPES: ScopeIdMap = {
  company: null,
  job_category: 'jc-1',
  department: 'dep-1',
  designation: 'des-1',
  employee: 'emp-1',
};

const ON_DATE = new Date('2026-06-15');

/** A minimal rule row; only the fields the resolver reads need to be real. */
function rule(overrides: Partial<PayrollRule> = {}): PayrollRule {
  return {
    rule_id: Math.random().toString(36).slice(2),
    rule_type: 'absent',
    name: 'Rule',
    scope_type: 'company',
    scope_id: null,
    config: {},
    priority: 0,
    is_active: true,
    effective_from: null,
    effective_to: null,
    version: 1,
    superseded_by: null,
    ...overrides,
  } as PayrollRule;
}

describe('PayrollRuleResolverService', () => {
  let service: PayrollRuleResolverService;
  let rows: PayrollRule[];

  beforeEach(async () => {
    rows = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        PayrollRuleResolverService,
        {
          provide: getRepositoryToken(PayrollRule),
          useValue: {
            // Mirrors the service's `find({ where: { is_active: true } })`.
            find: jest.fn(async () => rows.filter((r) => r.is_active)),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(PayrollRuleResolverService);
  });

  it('returns nothing when no rules are configured', async () => {
    expect(await service.resolveRules(SCOPES, ON_DATE)).toEqual({});
  });

  it('falls back to a company-wide rule when no narrower scope matches', async () => {
    rows = [rule({ name: 'Company default' })];

    const resolved = await service.resolveRules(SCOPES, ON_DATE);

    expect(resolved.absent?.name).toBe('Company default');
  });

  it('prefers the narrower scope even when the broader one has higher priority', async () => {
    rows = [
      rule({ name: 'Company', priority: 100 }),
      rule({
        name: 'Employee override',
        scope_type: 'employee',
        scope_id: 'emp-1',
        priority: 0,
      }),
    ];

    const resolved = await service.resolveRules(SCOPES, ON_DATE);

    expect(resolved.absent?.name).toBe('Employee override');
  });

  it('honours the full scope ladder', async () => {
    rows = [
      rule({ name: 'Company' }),
      rule({ name: 'Category', scope_type: 'job_category', scope_id: 'jc-1' }),
      rule({ name: 'Department', scope_type: 'department', scope_id: 'dep-1' }),
      rule({ name: 'Designation', scope_type: 'designation', scope_id: 'des-1' }),
    ];

    const resolved = await service.resolveRules(SCOPES, ON_DATE);

    expect(resolved.absent?.name).toBe('Designation');
  });

  it('ignores a scoped rule pointing at a different entity', async () => {
    rows = [
      rule({ name: 'Company' }),
      rule({
        name: 'Someone else',
        scope_type: 'employee',
        scope_id: 'emp-999',
      }),
    ];

    const resolved = await service.resolveRules(SCOPES, ON_DATE);

    expect(resolved.absent?.name).toBe('Company');
  });

  it('breaks a same-scope tie on priority', async () => {
    rows = [
      rule({ name: 'Low', priority: 1 }),
      rule({ name: 'High', priority: 9 }),
    ];

    const resolved = await service.resolveRules(SCOPES, ON_DATE);

    expect(resolved.absent?.name).toBe('High');
  });

  it('breaks a priority tie on the most recent effective_from', async () => {
    rows = [
      rule({ name: 'Older', effective_from: new Date('2026-01-01') }),
      rule({ name: 'Newer', effective_from: new Date('2026-05-01') }),
    ];

    const resolved = await service.resolveRules(SCOPES, ON_DATE);

    expect(resolved.absent?.name).toBe('Newer');
  });

  it('excludes a rule that is not yet effective', async () => {
    rows = [rule({ name: 'Future', effective_from: new Date('2026-09-01') })];

    expect((await service.resolveRules(SCOPES, ON_DATE)).absent).toBeUndefined();
  });

  it('excludes a rule whose window has closed', async () => {
    rows = [rule({ name: 'Expired', effective_to: new Date('2026-03-31') })];

    expect((await service.resolveRules(SCOPES, ON_DATE)).absent).toBeUndefined();
  });

  it('picks the current version over the one it superseded', async () => {
    // Editing v1 closes its window and points superseded_by at v2 (§16).
    rows = [
      rule({
        rule_id: 'v1',
        name: 'Absent v1',
        version: 1,
        effective_from: new Date('2026-01-01'),
        effective_to: new Date('2026-05-31'),
        superseded_by: 'v2',
      }),
      rule({
        rule_id: 'v2',
        name: 'Absent v2',
        version: 2,
        effective_from: new Date('2026-06-01'),
      }),
    ];

    const resolved = await service.resolveRules(SCOPES, ON_DATE);

    expect(resolved.absent?.name).toBe('Absent v2');
    expect(resolved.absent?.version).toBe(2);
  });

  it('still resolves the older version for a date inside its window', async () => {
    rows = [
      rule({
        rule_id: 'v1',
        name: 'Absent v1',
        version: 1,
        effective_from: new Date('2026-01-01'),
        effective_to: new Date('2026-05-31'),
        superseded_by: 'v2',
      }),
      rule({
        rule_id: 'v2',
        name: 'Absent v2',
        version: 2,
        effective_from: new Date('2026-06-01'),
      }),
    ];

    const resolved = await service.resolveRules(SCOPES, new Date('2026-03-15'));

    expect(resolved.absent?.version).toBe(1);
  });

  it('skips deactivated rules', async () => {
    rows = [rule({ name: 'Disabled', is_active: false })];

    expect((await service.resolveRules(SCOPES, ON_DATE)).absent).toBeUndefined();
  });

  it('resolves each rule type independently', async () => {
    rows = [
      rule({ rule_type: 'absent', name: 'Absent rule' }),
      rule({ rule_type: 'overtime', name: 'OT rule' }),
      rule({ rule_type: 'bonus', name: 'Bonus rule' }),
    ];

    const resolved = await service.resolveRules(SCOPES, ON_DATE);

    expect(resolved.absent?.name).toBe('Absent rule');
    expect(resolved.overtime?.name).toBe('OT rule');
    expect(resolved.bonus?.name).toBe('Bonus rule');
  });

  it('does not resolve the reserved appraisal type', async () => {
    // `appraisal` is in the enum but deliberately not engine-read this pass.
    rows = [rule({ rule_type: 'appraisal', name: 'Appraisal rule' })];

    expect(
      (await service.resolveRules(SCOPES, ON_DATE)).appraisal,
    ).toBeUndefined();
  });
});
