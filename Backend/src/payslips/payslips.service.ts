import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';

import { Payslip } from './payslips.entity';
import { PayrollSettings } from '../payroll-settings/payroll-settings.entity';
import { PreviewPayslipDto } from './dto/preview-payslip.dto';
import {
  PayrollCalculationService,
  PayslipPreview,
} from '../payroll-engine/payroll-calculation.service';
import {
  BASIC_LINE_LABEL,
  TAX_LINE_LABEL,
  LOAN_LINE_LABEL,
  REIMBURSEMENT_LINE_LABEL,
  round2,
} from '../payroll-engine/payroll-calculation';

/** One employee's row in the period register. */
export interface PayrollReportRow {
  payslip_id: string;
  user_id: string;
  employee_name: string;
  employee_code: string | null;
  department: string | null;
  basic_salary: number;
  gross_salary: number;
  total_earnings: number;
  total_deductions: number;
  net_salary: number;
  tax: number;
  loan: number;
  reimbursement: number;
  /**
   * This employee's amount for each line, keyed `${type}::${label}` — the same
   * key `line_totals` uses. Lets the register render a column per component
   * without a second query, and leaves absent lines simply missing rather than
   * zero (an employee who has no HRA is not an employee whose HRA is 0).
   */
  lines: Record<string, number>;
}

/** A component/synthetic line rolled up across the whole period. */
export interface PayrollReportLineTotal {
  label: string;
  type: string;
  total: number;
  count: number;
}

/** The period payroll register + roll-ups (spec §14 reporting). */
export interface PayrollReport {
  period: {
    period_id: string;
    name: string;
    status: string;
    period_start: string | null;
    period_end: string | null;
    currency: string;
  } | null;
  employee_count: number;
  totals: {
    basic: number;
    gross: number;
    earnings: number;
    deductions: number;
    net: number;
    tax: number;
    loan: number;
    reimbursement: number;
  };
  rows: PayrollReportRow[];
  line_totals: PayrollReportLineTotal[];
}

/**
 * Read access to generated payslips plus the preview passthrough (spec §14).
 *
 * Two audiences share this module:
 *   - HR/Admin read any payslip (org-wide list + by id), gated by
 *     `payslips.view`, and drive previews with `payroll.preview`.
 *   - Employees read only their own via `findMine`, scoped to the verified JWT
 *     — no payroll permission required, the same self-service pattern as
 *     `/attendance/me`.
 */
@Injectable()
export class PayslipsService {
  constructor(
    @InjectRepository(Payslip)
    private readonly payslipRepository: Repository<Payslip>,
    @InjectRepository(PayrollSettings)
    private readonly settingsRepository: Repository<PayrollSettings>,
    private readonly calculationService: PayrollCalculationService,
  ) {}

  /** Org-wide list, optionally filtered by period or employee. */
  findAll(filter: { periodId?: string; userId?: string }): Promise<Payslip[]> {
    const where: Record<string, string> = {};
    if (filter.periodId) where.period_id = filter.periodId;
    if (filter.userId) where.user_id = filter.userId;

    return this.payslipRepository.find({
      where,
      relations: { user: true, period: true },
      order: { created_at: 'DESC' },
    });
  }

  /** A single payslip with its lines and full snapshot — for HR/Admin. */
  async findOne(id: string): Promise<Payslip> {
    const payslip = await this.payslipRepository.findOne({
      where: { payslip_id: id },
      relations: { user: true, period: true, lines: true },
    });
    if (!payslip) {
      throw new NotFoundException(`Payslip "${id}" not found.`);
    }
    this.sortLines(payslip);
    return payslip;
  }

  /**
   * The signed-in employee's own payslips. Honours the self-service switch: if
   * `employee_self_service` is off, employees cannot pull their payslips here.
   */
  async findMine(userId: string, periodId?: string): Promise<Payslip[]> {
    await this.assertSelfServiceEnabled();
    const where: Record<string, string> = { user_id: userId };
    if (periodId) where.period_id = periodId;

    return this.payslipRepository.find({
      where,
      relations: { period: true, lines: true },
      order: { created_at: 'DESC' },
    });
  }

  /** One own payslip, scoped to the caller so an id cannot cross employees. */
  async findMineOne(userId: string, id: string): Promise<Payslip> {
    await this.assertSelfServiceEnabled();
    const payslip = await this.payslipRepository.findOne({
      where: { payslip_id: id, user_id: userId },
      relations: { period: true, lines: true },
    });
    if (!payslip) {
      throw new NotFoundException(`Payslip "${id}" not found.`);
    }
    this.sortLines(payslip);
    return payslip;
  }

  /** Compute (without persisting) an employee's payslip for a period. */
  preview(dto: PreviewPayslipDto): Promise<PayslipPreview> {
    return this.calculationService.preview(dto.user_id, dto.period_id);
  }

  /**
   * The payroll register for a period (spec §14 reporting): a row per employee
   * plus company-wide roll-ups (gross/net/tax/loan) and per-line component
   * totals. Reads persisted payslips only — never recalculates — so it always
   * agrees with what was generated. Tax and loan are pulled from the persisted
   * lines by their engine labels.
   */
  async report(periodId: string): Promise<PayrollReport> {
    const payslips = await this.payslipRepository.find({
      where: { period_id: periodId },
      relations: {
        user: { department: true },
        period: true,
        lines: true,
      },
      order: { created_at: 'ASC' },
    });

    const totals = {
      basic: 0,
      gross: 0,
      earnings: 0,
      deductions: 0,
      net: 0,
      tax: 0,
      loan: 0,
      reimbursement: 0,
    };
    const lineMap = new Map<string, PayrollReportLineTotal>();

    const rows: PayrollReportRow[] = payslips.map((p) => {
      let tax = 0;
      let loan = 0;
      let reimbursement = 0;
      const lines: Record<string, number> = {};
      for (const line of p.lines ?? []) {
        if (line.label === TAX_LINE_LABEL) tax += Number(line.amount);
        if (line.label === LOAN_LINE_LABEL) loan += Number(line.amount);
        if (line.label === REIMBURSEMENT_LINE_LABEL) {
          reimbursement += Number(line.amount);
        }

        const key = `${line.type}::${line.label}`;
        lines[key] = round2((lines[key] ?? 0) + Number(line.amount));
        const bucket = lineMap.get(key) ?? {
          label: line.label,
          type: line.type,
          total: 0,
          count: 0,
        };
        bucket.total = round2(bucket.total + Number(line.amount));
        bucket.count += 1;
        lineMap.set(key, bucket);
      }

      totals.basic = round2(totals.basic + Number(p.basic_salary));
      totals.gross = round2(totals.gross + Number(p.gross_salary));
      totals.earnings = round2(totals.earnings + Number(p.total_earnings));
      totals.deductions = round2(totals.deductions + Number(p.total_deductions));
      totals.net = round2(totals.net + Number(p.net_salary));
      totals.tax = round2(totals.tax + tax);
      totals.loan = round2(totals.loan + loan);
      totals.reimbursement = round2(totals.reimbursement + reimbursement);

      return {
        payslip_id: p.payslip_id,
        user_id: p.user_id,
        employee_name: p.user
          ? `${p.user.first_name} ${p.user.last_name}`.trim()
          : p.user_id,
        employee_code: p.user?.employee_code ?? null,
        department: p.user?.department?.department_name ?? null,
        basic_salary: Number(p.basic_salary),
        gross_salary: Number(p.gross_salary),
        total_earnings: Number(p.total_earnings),
        total_deductions: Number(p.total_deductions),
        net_salary: Number(p.net_salary),
        tax: round2(tax),
        loan: round2(loan),
        reimbursement: round2(reimbursement),
        lines,
      };
    });

    const settings = await this.settingsRepository.findOne({ where: { id: 1 } });

    return {
      period: payslips[0]?.period
        ? {
            period_id: payslips[0].period.period_id,
            name: payslips[0].period.name,
            status: payslips[0].period.status,
            period_start: this.asDateString(payslips[0].period.period_start),
            period_end: this.asDateString(payslips[0].period.period_end),
            currency: settings?.currency ?? 'PKR',
          }
        : null,
      employee_count: rows.length,
      totals,
      rows,
      line_totals: [...lineMap.values()].sort((a, b) =>
        a.type === b.type
          ? a.label.localeCompare(b.label)
          : a.type.localeCompare(b.type),
      ),
    };
  }

  /**
   * The period register as a real `.xlsx` — the "general excel sheet after
   * payslip generation" (spec §14). Built server-side from the same `report()`
   * data the Reports screen shows, so the file and the screen can never
   * disagree, and no recalculation happens at download time.
   *
   * Three sheets:
   *   1. Payroll Register — a row per employee, with a column per component that
   *      actually appeared in the run (earnings first, then deductions).
   *   2. Component Totals — each line rolled up across the period.
   *   3. Summary — the period's identity and the company-wide totals.
   */
  async exportWorkbook(
    periodId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const report = await this.report(periodId);
    const money = '#,##0.00';

    // Only components present in this run become columns; earnings before
    // deductions so the register reads left-to-right like a payslip. Basic, tax,
    // loan and reimbursement already have dedicated columns, so they are
    // excluded here rather than printed twice.
    const dedicated = new Set([
      BASIC_LINE_LABEL,
      TAX_LINE_LABEL,
      LOAN_LINE_LABEL,
      REIMBURSEMENT_LINE_LABEL,
    ]);
    const componentColumns = report.line_totals
      .filter((l) => !dedicated.has(l.label))
      .sort((a, b) =>
        a.type === b.type
          ? a.label.localeCompare(b.label)
          : a.type === 'earning'
            ? -1
            : 1,
      )
      .map((l) => ({
        key: `${l.type}::${l.label}`,
        header: l.type === 'deduction' ? `${l.label} (−)` : l.label,
      }));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'HRMS';

    // ---- Sheet 1: Payroll Register -----------------------------------------
    const register = workbook.addWorksheet('Payroll Register');
    register.columns = [
      { header: 'Emp. Code', key: 'employee_code', width: 14 },
      { header: 'Employee', key: 'employee_name', width: 26 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Basic', key: 'basic_salary', width: 14 },
      ...componentColumns.map((c) => ({
        header: c.header,
        key: c.key,
        width: Math.max(14, Math.min(c.header.length + 3, 28)),
      })),
      { header: 'Gross', key: 'gross_salary', width: 14 },
      { header: 'Total Earnings', key: 'total_earnings', width: 15 },
      { header: 'Income Tax', key: 'tax', width: 14 },
      { header: 'Loan', key: 'loan', width: 14 },
      { header: 'Reimbursement', key: 'reimbursement', width: 15 },
      { header: 'Total Deductions', key: 'total_deductions', width: 16 },
      { header: 'Net Pay', key: 'net_salary', width: 15 },
    ];
    register.getRow(1).font = { bold: true };
    register.getRow(1).alignment = { vertical: 'middle', wrapText: true };
    register.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];

    for (const row of report.rows) {
      register.addRow({
        employee_code: row.employee_code ?? '—',
        employee_name: row.employee_name,
        department: row.department ?? '—',
        basic_salary: row.basic_salary,
        ...Object.fromEntries(
          componentColumns.map((c) => [c.key, row.lines[c.key] ?? null]),
        ),
        gross_salary: row.gross_salary,
        total_earnings: row.total_earnings,
        tax: row.tax,
        loan: row.loan,
        reimbursement: row.reimbursement,
        total_deductions: row.total_deductions,
        net_salary: row.net_salary,
      });
    }

    if (report.rows.length > 0) {
      const totalRow = register.addRow({
        employee_name: `Total — ${report.employee_count} employee(s)`,
        basic_salary: report.totals.basic,
        ...Object.fromEntries(
          componentColumns.map((c) => [
            c.key,
            report.line_totals.find((l) => `${l.type}::${l.label}` === c.key)
              ?.total ?? null,
          ]),
        ),
        gross_salary: report.totals.gross,
        total_earnings: report.totals.earnings,
        tax: report.totals.tax,
        loan: report.totals.loan,
        reimbursement: report.totals.reimbursement,
        total_deductions: report.totals.deductions,
        net_salary: report.totals.net,
      });
      totalRow.font = { bold: true };
    } else {
      const note = register.addRow({});
      note.getCell(1).value =
        'No payslips have been generated for this period yet.';
      note.font = { italic: true };
    }

    // Every column from Basic rightwards is money.
    for (let col = 4; col <= register.columnCount; col += 1) {
      register.getColumn(col).numFmt = money;
    }

    // ---- Sheet 2: Component Totals -----------------------------------------
    const totalsSheet = workbook.addWorksheet('Component Totals');
    totalsSheet.columns = [
      { header: 'Line', key: 'label', width: 30 },
      { header: 'Type', key: 'type', width: 14 },
      { header: 'Total', key: 'total', width: 16 },
      { header: 'Employees', key: 'count', width: 12 },
    ];
    totalsSheet.getRow(1).font = { bold: true };
    totalsSheet.views = [{ state: 'frozen', ySplit: 1 }];
    for (const line of report.line_totals) {
      totalsSheet.addRow({
        label: line.label,
        type: line.type === 'deduction' ? 'Deduction' : 'Earning',
        total: line.total,
        count: line.count,
      });
    }
    totalsSheet.getColumn('total').numFmt = money;

    // ---- Sheet 3: Summary ---------------------------------------------------
    const summary = workbook.addWorksheet('Summary');
    summary.columns = [
      { header: 'Item', key: 'item', width: 28 },
      { header: 'Value', key: 'value', width: 30 },
    ];
    summary.getRow(1).font = { bold: true };
    const rows: Array<[string, string | number]> = [
      ['Period', report.period?.name ?? periodId],
      ['Period start', report.period?.period_start ?? '—'],
      ['Period end', report.period?.period_end ?? '—'],
      ['Status', report.period?.status ?? '—'],
      ['Currency', report.period?.currency ?? 'PKR'],
      ['Employees costed', report.employee_count],
      ['Total basic', report.totals.basic],
      ['Total gross', report.totals.gross],
      ['Total earnings', report.totals.earnings],
      ['Income tax', report.totals.tax],
      ['Loan recovery', report.totals.loan],
      ['Reimbursements', report.totals.reimbursement],
      ['Total deductions', report.totals.deductions],
      ['Total net pay', report.totals.net],
    ];
    for (const [item, value] of rows) {
      const added = summary.addRow({ item, value });
      if (typeof value === 'number' && item !== 'Employees costed') {
        added.getCell('value').numFmt = money;
      }
    }

    // exceljs returns its own Buffer alias (an ArrayBuffer); the controller
    // needs a Node Buffer to write to the response.
    const buffer = await workbook.xlsx.writeBuffer();
    const slug = (report.period?.name ?? periodId)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    return {
      buffer: Buffer.from(buffer as ArrayBuffer),
      filename: `payroll-register-${slug || 'period'}.xlsx`,
    };
  }

  /**
   * `date` columns come back as `YYYY-MM-DD` strings on some drivers and as
   * Date objects on others; normalise to the string form the API already uses.
   */
  private asDateString(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    return value instanceof Date
      ? value.toISOString().slice(0, 10)
      : String(value).slice(0, 10);
  }

  private sortLines(payslip: Payslip): void {
    if (payslip.lines) {
      payslip.lines.sort((a, b) => a.display_order - b.display_order);
    }
  }

  private async assertSelfServiceEnabled(): Promise<void> {
    const settings = await this.settingsRepository.findOne({
      where: { id: 1 },
    });
    if (settings && !settings.employee_self_service) {
      throw new ForbiddenException(
        'Employee self-service payslips are disabled in payroll settings.',
      );
    }
  }
}
