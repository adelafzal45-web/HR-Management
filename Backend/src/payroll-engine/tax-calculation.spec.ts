/**
 * Unit tests for the pure income-tax core (spec §10).
 *
 * The slab arithmetic is the one place a mistake silently mis-pays every
 * employee, so the cases below pin the exact contract the calculation service
 * relies on: which bracket applies at each boundary, that the open-ended top
 * slab catches everything above it, and that the monthly figure is the annual
 * liability divided by the pay frequency's period count.
 */

import { computeTax, periodsPerYear, TaxSlabInput } from './tax-calculation';

// A Pakistan-FBR-shaped salaried ladder, in PKR. Deliberately kept as plain
// data — the same shape the tax_slabs rows deserialize to.
const SLABS: TaxSlabInput[] = [
  { lower_bound: 0, upper_bound: 600_000, base_tax: 0, rate_percent: 0 },
  { lower_bound: 600_000, upper_bound: 1_200_000, base_tax: 0, rate_percent: 5 },
  {
    lower_bound: 1_200_000,
    upper_bound: 2_200_000,
    base_tax: 30_000,
    rate_percent: 15,
  },
  {
    lower_bound: 2_200_000,
    upper_bound: null,
    base_tax: 180_000,
    rate_percent: 25,
  },
];

describe('computeTax', () => {
  it('charges nothing inside the zero-rated slab', () => {
    const result = computeTax(500_000, SLABS, 12);

    expect(result.annual_tax).toBe(0);
    expect(result.monthly_tax).toBe(0);
    expect(result.slab?.upper_bound).toBe(600_000);
  });

  it('applies the marginal rate only to the excess above the slab floor', () => {
    // 900k → 5% of the 300k above the 600k floor = 15,000/yr.
    const result = computeTax(900_000, SLABS, 12);

    expect(result.annual_tax).toBe(15_000);
    expect(result.monthly_tax).toBe(1_250);
  });

  it('adds the slab base to the marginal amount', () => {
    // 1.5m → base 30,000 + 15% of the 300k above 1.2m = 75,000/yr.
    const result = computeTax(1_500_000, SLABS, 12);

    expect(result.annual_tax).toBe(75_000);
    expect(result.monthly_tax).toBe(6_250);
  });

  it('keeps a boundary income in the slab it closes, not the next one', () => {
    // Exactly 1.2m is the upper bound of the 5% slab, so base stays 0.
    const result = computeTax(1_200_000, SLABS, 12);

    expect(result.slab?.lower_bound).toBe(600_000);
    expect(result.annual_tax).toBe(30_000); // 5% of 600k
  });

  it('starts the next slab one unit past the boundary', () => {
    const result = computeTax(1_200_001, SLABS, 12);

    expect(result.slab?.lower_bound).toBe(1_200_000);
    expect(result.slab?.base_tax).toBe(30_000);
  });

  it('uses the open-ended top slab for income above every bound', () => {
    // 5m → base 180,000 + 25% of the 2.8m above 2.2m = 880,000/yr.
    const result = computeTax(5_000_000, SLABS, 12);

    expect(result.slab?.upper_bound).toBeNull();
    expect(result.annual_tax).toBe(880_000);
  });

  it('divides the annual liability by the pay frequency, not always 12', () => {
    const monthly = computeTax(1_500_000, SLABS, 12);
    const biweekly = computeTax(1_500_000, SLABS, 26);

    expect(biweekly.annual_tax).toBe(monthly.annual_tax);
    expect(biweekly.monthly_tax).toBeCloseTo(75_000 / 26, 2);
  });

  it('sorts slabs defensively so callers need not pre-order them', () => {
    const shuffled = [SLABS[3], SLABS[0], SLABS[2], SLABS[1]];

    expect(computeTax(1_500_000, shuffled, 12).annual_tax).toBe(75_000);
  });

  it('treats a negative or zero income as untaxed', () => {
    expect(computeTax(0, SLABS, 12).annual_tax).toBe(0);
    expect(computeTax(-50_000, SLABS, 12).annual_tax).toBe(0);
    expect(computeTax(-50_000, SLABS, 12).annual_taxable).toBe(0);
  });

  it('returns zero — not a crash — when no slabs are configured', () => {
    const result = computeTax(1_500_000, [], 12);

    expect(result.annual_tax).toBe(0);
    expect(result.slab).toBeNull();
    expect(result.note).toContain('No tax slabs configured');
  });

  it('falls back to 12 periods when the frequency count is nonsense', () => {
    expect(computeTax(900_000, SLABS, 0).monthly_tax).toBe(1_250);
  });

  it('always carries a readable "Why?" note for the payslip line', () => {
    const result = computeTax(1_500_000, SLABS, 12);

    expect(result.note).toContain('1500000.00');
    expect(result.note).toContain('15%');
    expect(result.note).toContain('75000.00');
  });
});

describe('periodsPerYear', () => {
  it('maps each supported frequency to its period count', () => {
    expect(periodsPerYear('weekly')).toBe(52);
    expect(periodsPerYear('biweekly')).toBe(26);
    expect(periodsPerYear('monthly')).toBe(12);
  });

  it('defaults an unknown frequency to monthly', () => {
    expect(periodsPerYear('quarterly')).toBe(12);
  });
});
