import { Injectable } from '@nestjs/common';

export interface PayrollTaxResult {
  taxable_income: number;
  government_tax: number;
}

export interface TaxSlab {
  min: number;
  max?: number;
  rate: number;
  fixedAmount?: number;
}

@Injectable()
export class PayrollTaxService {
  /**
   * Calculate taxable income.
   *
   * Medical allowance and approved reimbursement
   * are excluded because they are tax-free according
   * to the payroll rules.
   */
  calculateTaxableIncome(
    grossEarnings: number,
    medicalAllowance: number,
    approvedReimbursement: number,
  ): number {
    return Math.max(
      0,
      grossEarnings -
        medicalAllowance -
        approvedReimbursement,
    );
  }

  /**
   * Calculate tax using configurable slabs.
   */
  calculateTax(
    taxableIncome: number,
    slabs: TaxSlab[],
  ): number {
    if (taxableIncome <= 0 || slabs.length === 0) {
      return 0;
    }

    const slab = slabs.find((currentSlab) => {
      const minimumSatisfied =
        taxableIncome >= currentSlab.min;

      const maximumSatisfied =
        currentSlab.max === undefined ||
        taxableIncome <= currentSlab.max;

      return minimumSatisfied && maximumSatisfied;
    });

    if (!slab) {
      return 0;
    }

    const fixedAmount = slab.fixedAmount ?? 0;

    const taxableAtRate =
      taxableIncome - slab.min;

    const tax =
      fixedAmount +
      Math.max(0, taxableAtRate) * (slab.rate / 100);

    return Math.max(0, tax);
  }

  calculate(
    grossEarnings: number,
    medicalAllowance: number,
    approvedReimbursement: number,
    slabs: TaxSlab[],
  ): PayrollTaxResult {
    const taxableIncome =
      this.calculateTaxableIncome(
        grossEarnings,
        medicalAllowance,
        approvedReimbursement,
      );

    const governmentTax =
      this.calculateTax(
        taxableIncome,
        slabs,
      );

    return {
      taxable_income: taxableIncome,
      government_tax: governmentTax,
    };
  }
}