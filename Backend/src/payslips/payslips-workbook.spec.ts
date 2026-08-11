import * as ExcelJS from 'exceljs';
import { PayslipsService, PayrollReport } from './payslips.service';

/**
 * Unit tests for the Excel register builder (Phase 3, spec §"general excel
 * sheet after successful payslip generated").
 *
 * `exportWorkbook` reads nothing but `report(periodId)` — the same aggregate the
 * Reports screen renders — so the whole builder is testable by stubbing that one
 * call. No repositories, no Nest, no database: the service is constructed with
 * nulls because none of its injected dependencies are reachable from this path.
 *
 * What matters here is the contract the frontend download buttons depend on:
 * three named sheets, a column for every component that actually appeared in the
 * run (and no duplicate column for the ones with dedicated columns), and a real
 * .xlsx buffer that reopens cleanly.
 */
describe('PayslipsService.exportWorkbook', () => {
  function service(report: PayrollReport): PayslipsService {
    const svc = new PayslipsService(null as never, null as never, null as never);
    jest.spyOn(svc, 'report').mockResolvedValue(report);
    return svc;
  }

  function report(overrides: Partial<PayrollReport> = {}): PayrollReport {
    return {
      period: {
        period_id: 'p1',
        name: 'August 2026',
        status: 'pending_approval',
        period_start: '2026-08-01',
        period_end: '2026-08-31',
        currency: 'PKR',
      },
      employee_count: 2,
      totals: {
        basic: 200000,
        gross: 300000,
        earnings: 306500,
        deductions: 35000,
        net: 271500,
        tax: 30000,
        loan: 5000,
        reimbursement: 6500,
      },
      rows: [
        {
          payslip_id: 'ps1',
          user_id: 'u1',
          employee_name: 'Ayesha Khan',
          employee_code: 'EMP-001',
          department: 'Engineering',
          basic_salary: 100000,
          gross_salary: 150000,
          total_earnings: 156500,
          total_deductions: 20000,
          net_salary: 136500,
          tax: 15000,
          loan: 5000,
          reimbursement: 6500,
          lines: {
            'earning::Basic Salary': 100000,
            'earning::House Rent Allowance': 50000,
            'deduction::Provident Fund': 5000,
            'deduction::Income Tax': 15000,
          },
        },
        {
          payslip_id: 'ps2',
          user_id: 'u2',
          employee_name: 'Bilal Ahmed',
          employee_code: 'EMP-002',
          department: 'Sales',
          basic_salary: 100000,
          gross_salary: 150000,
          total_earnings: 150000,
          total_deductions: 15000,
          net_salary: 135000,
          tax: 15000,
          loan: 0,
          reimbursement: 0,
          // No PF row at all — an employee without PF is not one whose PF is 0.
          lines: {
            'earning::Basic Salary': 100000,
            'earning::House Rent Allowance': 50000,
            'deduction::Income Tax': 15000,
          },
        },
      ],
      line_totals: [
        { label: 'Basic Salary', type: 'earning', total: 200000, count: 2 },
        {
          label: 'House Rent Allowance',
          type: 'earning',
          total: 100000,
          count: 2,
        },
        { label: 'Reimbursement', type: 'earning', total: 6500, count: 1 },
        { label: 'Provident Fund', type: 'deduction', total: 5000, count: 1 },
        { label: 'Income Tax', type: 'deduction', total: 30000, count: 2 },
      ],
      ...overrides,
    };
  }

  /** Reopen the produced buffer, which also proves it is a valid workbook. */
  async function open(buffer: Buffer): Promise<ExcelJS.Workbook> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    return wb;
  }

  it('produces a readable three-sheet workbook', async () => {
    const { buffer, filename } = await service(report()).exportWorkbook('p1');

    expect(buffer.length).toBeGreaterThan(0);
    expect(filename).toBe('payroll-register-august-2026.xlsx');

    const wb = await open(buffer);
    expect(wb.worksheets.map((s) => s.name)).toEqual([
      'Payroll Register',
      'Component Totals',
      'Summary',
    ]);
  });

  it('adds a register column per component in the run, without duplicating the dedicated ones', async () => {
    const { buffer } = await service(report()).exportWorkbook('p1');
    const wb = await open(buffer);
    const header = wb.getWorksheet('Payroll Register')!.getRow(1).values as (
      | string
      | undefined
    )[];
    const headers = header.filter((h): h is string => typeof h === 'string');

    // Component columns are present…
    expect(headers).toContain('House Rent Allowance');
    expect(headers).toContain('Provident Fund (−)');
    // …and the ones with dedicated columns appear exactly once, under their own
    // heading, not twice (Basic / Income Tax / Loan / Reimbursement).
    expect(headers.filter((h) => h === 'Basic')).toHaveLength(1);
    expect(headers).not.toContain('Basic Salary');
    expect(headers.filter((h) => h === 'Income Tax')).toHaveLength(1);
    expect(headers.filter((h) => h === 'Reimbursement')).toHaveLength(1);

    // Earnings before deductions, so the register reads like a payslip.
    expect(headers.indexOf('House Rent Allowance')).toBeLessThan(
      headers.indexOf('Provident Fund (−)'),
    );
  });

  it('writes one row per employee and leaves absent components blank', async () => {
    const { buffer } = await service(report()).exportWorkbook('p1');
    const wb = await open(buffer);
    const sheet = wb.getWorksheet('Payroll Register')!;

    // Header + two employees (a totals row may follow, so check the names).
    const names = [sheet.getRow(2), sheet.getRow(3)].map((r) =>
      String(r.getCell(2).value ?? ''),
    );
    expect(names).toEqual(['Ayesha Khan', 'Bilal Ahmed']);

    const headers = (
      sheet.getRow(1).values as (string | undefined)[]
    ).map((h) => (typeof h === 'string' ? h : ''));
    const pfCol = headers.indexOf('Provident Fund (−)');
    expect(pfCol).toBeGreaterThan(0);

    // Ayesha has PF, Bilal has no PF line at all — blank, not zero.
    expect(Number(sheet.getRow(2).getCell(pfCol).value)).toBe(5000);
    expect(sheet.getRow(3).getCell(pfCol).value ?? null).toBeNull();
  });

  it('rolls every line up on the totals sheet', async () => {
    const { buffer } = await service(report()).exportWorkbook('p1');
    const wb = await open(buffer);
    const sheet = wb.getWorksheet('Component Totals')!;

    const labels: string[] = [];
    sheet.eachRow((row, i) => {
      if (i > 1) labels.push(String(row.getCell(1).value ?? ''));
    });

    expect(labels).toEqual(
      expect.arrayContaining([
        'House Rent Allowance',
        'Provident Fund',
        'Income Tax',
        'Reimbursement',
      ]),
    );
  });

  it('still builds a workbook for a period with no payslips', async () => {
    const empty = report({
      employee_count: 0,
      rows: [],
      line_totals: [],
      totals: {
        basic: 0,
        gross: 0,
        earnings: 0,
        deductions: 0,
        net: 0,
        tax: 0,
        loan: 0,
        reimbursement: 0,
      },
    });

    const { buffer } = await service(empty).exportWorkbook('p1');
    const wb = await open(buffer);
    expect(wb.worksheets).toHaveLength(3);
    // Headers only — the download never fails just because a run is empty.
    expect(wb.getWorksheet('Payroll Register')!.getRow(2).getCell(2).value ?? null).toBeNull();
  });

  it('falls back to a safe filename when the period has no name', async () => {
    const { filename } = await service(report({ period: null })).exportWorkbook(
      'p1',
    );
    expect(filename).toBe('payroll-register-p1.xlsx');
  });
});
