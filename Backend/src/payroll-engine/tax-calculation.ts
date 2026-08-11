/**
 * The pure, dependency-free income-tax core (spec §10).
 *
 * Kept beside `payroll-calculation.ts` and to the same discipline: plain
 * functions over plain data, no repositories, so the slab arithmetic can be
 * unit-tested in isolation. The calculation service resolves the active tax
 * config's slabs from the database and hands them here.
 *
 * Model: **annualized progressive slabs** (Pakistan FBR salaried style). Each
 * slab charges a fixed `base_tax` plus `rate_percent` on the portion of annual
 * taxable income above the slab's `lower_bound`. The employee's annual income
 * falls in exactly one slab; liability is that slab's base plus the marginal
 * rate on the excess. The monthly deduction is the annual liability divided by
 * the number of pay periods in a year.
 */

/** One progressive bracket. `upper_bound` null means "and above" (the top slab). */
export interface TaxSlabInput {
  lower_bound: number;
  upper_bound: number | null;
  base_tax: number;
  rate_percent: number;
}

export interface TaxComputation {
  annual_taxable: number;
  annual_tax: number;
  monthly_tax: number;
  /** The bracket that applied, for the payslip "Why?" note. */
  slab: TaxSlabInput | null;
  note: string;
}

/** Round to 2 decimal places — the currency precision money columns use. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Compute the annual and monthly tax for an annual taxable income against a set
 * of progressive slabs.
 *
 * Slabs are sorted by `lower_bound` defensively so callers need not pre-order
 * them. Income at or below the lowest slab's floor is untaxed. A null
 * `upper_bound` is treated as +∞, so the top slab catches all remaining income.
 */
export function computeTax(
  annualTaxable: number,
  slabs: TaxSlabInput[],
  periodsPerYear: number,
): TaxComputation {
  const taxable = Math.max(0, round2(annualTaxable));
  const periods = periodsPerYear > 0 ? periodsPerYear : 12;

  if (slabs.length === 0 || taxable === 0) {
    return {
      annual_taxable: taxable,
      annual_tax: 0,
      monthly_tax: 0,
      slab: null,
      note:
        taxable === 0
          ? 'No taxable income; tax = 0.'
          : 'No tax slabs configured; tax = 0.',
    };
  }

  const ordered = [...slabs].sort((a, b) => a.lower_bound - b.lower_bound);

  // The applicable slab is the highest whose lower_bound the income exceeds and
  // whose upper_bound (if any) it does not.
  let applicable: TaxSlabInput | null = null;
  for (const slab of ordered) {
    const upper = slab.upper_bound ?? Number.POSITIVE_INFINITY;
    if (taxable > slab.lower_bound && taxable <= upper) {
      applicable = slab;
      break;
    }
  }
  // Above every defined slab: use the top one (its upper_bound should be null).
  if (!applicable) {
    const top = ordered[ordered.length - 1];
    if (taxable > top.lower_bound) applicable = top;
  }

  if (!applicable) {
    return {
      annual_taxable: taxable,
      annual_tax: 0,
      monthly_tax: 0,
      slab: null,
      note: `Annual taxable ${taxable.toFixed(2)} is below the lowest tax slab; tax = 0.`,
    };
  }

  const excess = Math.max(0, taxable - applicable.lower_bound);
  const marginal = round2((excess * applicable.rate_percent) / 100);
  const annualTax = round2(applicable.base_tax + marginal);
  const monthlyTax = round2(annualTax / periods);

  const note =
    `Annual taxable ${taxable.toFixed(2)} → base ${applicable.base_tax.toFixed(2)} + ` +
    `${applicable.rate_percent}% of ${excess.toFixed(2)} above ${applicable.lower_bound.toFixed(2)} ` +
    `= ${annualTax.toFixed(2)} / year; ÷ ${periods} periods = ${monthlyTax.toFixed(2)}.`;

  return {
    annual_taxable: taxable,
    annual_tax: annualTax,
    monthly_tax: monthlyTax,
    slab: applicable,
    note,
  };
}

/** Pay periods per year for the settings frequency, for annualization. */
export function periodsPerYear(frequency: string): number {
  switch (frequency) {
    case 'weekly':
      return 52;
    case 'biweekly':
      return 26;
    case 'monthly':
    default:
      return 12;
  }
}
