export interface PayrollBreakdownItem {
  name: string;

  amount: number;

  description?: string;
}

export interface PayrollBreakdown {
  allowances: PayrollBreakdownItem[];

  deductions: PayrollBreakdownItem[];

  adjustments: PayrollBreakdownItem[];
}