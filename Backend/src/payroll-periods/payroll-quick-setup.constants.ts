/**
 * The starting configuration "Set Up Payroll Automatically" writes (spec §1 —
 * the one-click alternative to walking six configuration screens).
 *
 * Everything here is **data, not policy baked into the engine**: each row lands
 * in the ordinary `salary_components` / `salary_structures` / `tax_configs` /
 * `payroll_rules` tables and is editable, effective-datable, and deletable from
 * the normal screens afterwards. Quick Setup only saves HR the typing.
 *
 * Kept deliberately small and conventional — a Pakistani salaried baseline —
 * because a wrong default that is easy to see and change beats a clever one
 * buried in code.
 */

/** A component Quick Setup creates when no component with its code exists. */
export interface QuickSetupComponent {
  code: string;
  name: string;
  type: 'earning' | 'deduction';
  calculation_type: 'fixed' | 'percent_basic' | 'percent_gross';
  /** Percentage for percent_*; flat money for fixed. */
  amount: number;
  is_taxable: boolean;
  include_in_gross: boolean;
  display_order: number;
  description: string;
}

/**
 * House rent + medical are the two allowances almost every local payslip
 * carries; provident fund is the standard deduction. Medical is marked
 * non-taxable, matching the common FBR medical-allowance exemption — HR can flip
 * the flag if their treatment differs.
 */
export const QUICK_SETUP_COMPONENTS: QuickSetupComponent[] = [
  {
    code: 'HRA',
    name: 'House Rent Allowance',
    type: 'earning',
    calculation_type: 'percent_basic',
    amount: 45,
    is_taxable: true,
    include_in_gross: true,
    display_order: 10,
    description: '45% of basic — taxable, counts toward gross.',
  },
  {
    code: 'MEDICAL',
    name: 'Medical Allowance',
    type: 'earning',
    calculation_type: 'percent_basic',
    amount: 10,
    is_taxable: false,
    include_in_gross: true,
    display_order: 20,
    description: '10% of basic — non-taxable, counts toward gross.',
  },
  {
    code: 'PF',
    name: 'Provident Fund',
    type: 'deduction',
    calculation_type: 'percent_basic',
    amount: 5,
    is_taxable: false,
    include_in_gross: false,
    display_order: 30,
    description: '5% of basic — employee contribution.',
  },
];

/** The structure Quick Setup builds and assigns company-wide. */
export const QUICK_SETUP_STRUCTURE_NAME = 'Standard Staff';

/**
 * A progressive annual slab table in the FBR salaried shape: a tax-free first
 * bracket, then `base_tax` plus a marginal `rate_percent` on income above each
 * bracket floor. Bounds are **annual** PKR; the engine annualizes the period's
 * taxable income, charges the slabs, and divides back down by pay periods.
 *
 * Rates change with each finance act — this is a starting point HR is expected
 * to review against the current year, not a maintained tax feed.
 */
export const QUICK_SETUP_TAX_CONFIG = {
  name: 'FBR Salaried',
  regime: 'FBR Salaried (starting point — review annually)',
  currency: 'PKR',
  slabs: [
    { lower_bound: 0, upper_bound: 600000, base_tax: 0, rate_percent: 0 },
    {
      lower_bound: 600000,
      upper_bound: 1200000,
      base_tax: 0,
      rate_percent: 5,
    },
    {
      lower_bound: 1200000,
      upper_bound: 2200000,
      base_tax: 30000,
      rate_percent: 15,
    },
    {
      lower_bound: 2200000,
      upper_bound: 3200000,
      base_tax: 180000,
      rate_percent: 25,
    },
    {
      lower_bound: 3200000,
      upper_bound: 4100000,
      base_tax: 430000,
      rate_percent: 30,
    },
    {
      lower_bound: 4100000,
      upper_bound: null,
      base_tax: 700000,
      rate_percent: 35,
    },
  ],
} as const;
