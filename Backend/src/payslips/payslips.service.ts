import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Payslip } from './payslips.entity';
import { PayrollSettings } from '../payroll-settings/payroll-settings.entity';
import { PreviewPayslipDto } from './dto/preview-payslip.dto';
import {
  PayrollCalculationService,
  PayslipPreview,
} from '../payroll-engine/payroll-calculation.service';
import {
  TAX_LINE_LABEL,
  LOAN_LINE_LABEL,
  round2,
} from '../payroll-engine/payroll-calculation';

/** One employee's row in the period register. */
export interface PayrollReportRow {
  payslip_id: string;
  user_id: string;
  employee_name: string;
  basic_salary: number;
  gross_salary: number;
  total_earnings: number;
  total_deductions: number;
  net_salary: number;
  tax: number;
  loan: number;
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
      relations: { user: true, period: true, lines: true },
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
    };
    const lineMap = new Map<string, PayrollReportLineTotal>();

    const rows: PayrollReportRow[] = payslips.map((p) => {
      let tax = 0;
      let loan = 0;
      for (const line of p.lines ?? []) {
        if (line.label === TAX_LINE_LABEL) tax += Number(line.amount);
        if (line.label === LOAN_LINE_LABEL) loan += Number(line.amount);

        const key = `${line.type}::${line.label}`;
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

      return {
        payslip_id: p.payslip_id,
        user_id: p.user_id,
        employee_name: p.user
          ? `${p.user.first_name} ${p.user.last_name}`.trim()
          : p.user_id,
        basic_salary: Number(p.basic_salary),
        gross_salary: Number(p.gross_salary),
        total_earnings: Number(p.total_earnings),
        total_deductions: Number(p.total_deductions),
        net_salary: Number(p.net_salary),
        tax: round2(tax),
        loan: round2(loan),
      };
    });

    return {
      period: payslips[0]?.period
        ? {
            period_id: payslips[0].period.period_id,
            name: payslips[0].period.name,
            status: payslips[0].period.status,
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
