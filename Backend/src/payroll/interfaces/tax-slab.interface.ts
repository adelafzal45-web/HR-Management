export interface TaxSlab {
  minIncome: number;

  maxIncome?: number;

  taxRate: number;

  fixedTax?: number;
}