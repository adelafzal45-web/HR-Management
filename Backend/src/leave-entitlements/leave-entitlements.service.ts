import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { User } from '../users/user.entity';
import { UserLeaveBalance } from '../users/user-leave-balance.entity';
import { LeaveType } from '../leave-types/leave-types.entity';
import { LeaveEntitlement } from './leave-entitlement.entity';
import { LeaveHistory, LeaveHistoryType } from './leave-history.entity';

import {
  CreateEntitlementDto,
  EntitlementMode,
} from './dto/create-entitlement.dto';
import { AdjustBalanceDto, AdjustDirection } from './dto/adjust-balance.dto';
import { PreviewEntitlementDto } from './dto/preview-entitlement.dto';
import { EntitlementTargetDto } from './dto/entitlement-target.dto';
import { EntitlementQueryDto } from './dto/entitlement-query.dto';
import { LeaveHistoryQueryDto } from './dto/leave-history-query.dto';
import { LeaveBalanceReportQueryDto } from './dto/leave-balance-report-query.dto';
import { LeaveRequest } from '../leave-requests/leave-requests.entity';

import { AuditService, type AuditActor } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { paginatedResult, type PaginatedResult } from '../common/dto/pagination-query.dto';

/** One row of the Employee Leave Management report: an employee's balance
 * for a single leave type, plus how many of their requests for that type
 * are still awaiting a decision. */
export interface LeaveBalanceReportRow {
  user_id: string;
  employee_code: string;
  employee_name: string;
  department: string | null;
  designation: string | null;
  leave_type_id: string;
  leave_type_name: string;
  total_entitlement: number;
  used_days: number;
  remaining_days: number;
  pending_requests: number;
  status: 'active' | 'inactive';
}

export interface EmployeeBalancePreview {
  user_id: string;
  employee_code: string;
  name: string;
  department?: string | null;
  designation?: string | null;
  current_allocated: number;
  used: number;
  remaining: number;
}

@Injectable()
export class LeaveEntitlementsService {
  constructor(
    @InjectRepository(LeaveEntitlement)
    private readonly entitlementRepository: Repository<LeaveEntitlement>,
    @InjectRepository(LeaveHistory)
    private readonly historyRepository: Repository<LeaveHistory>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserLeaveBalance)
    private readonly balanceRepository: Repository<UserLeaveBalance>,
    @InjectRepository(LeaveType)
    private readonly leaveTypeRepository: Repository<LeaveType>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRequestRepository: Repository<LeaveRequest>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
  ) {}

  // ==========================================
  // TARGET RESOLUTION
  // ==========================================

  /**
   * Resolves a target selector to a concrete list of users. Exactly one of
   * `user_id`, `user_ids`, `department_id`, `designation_id` must be
   * supplied — mixing selection strategies in one call is ambiguous, so it
   * is rejected rather than silently unioned or intersected.
   */
  private async resolveTargetUsers(
    target: EntitlementTargetDto,
    manager?: EntityManager,
  ): Promise<User[]> {
    const repo = manager ? manager.getRepository(User) : this.userRepository;

    const selectors = [
      target.user_id,
      target.user_ids?.length,
      target.department_id,
      target.designation_id,
    ].filter(Boolean);

    if (selectors.length === 0) {
      throw new BadRequestException(
        'Provide exactly one of: user_id, user_ids, department_id, designation_id.',
      );
    }
    if (selectors.length > 1) {
      throw new BadRequestException(
        'Provide only one of: user_id, user_ids, department_id, designation_id — not several at once.',
      );
    }

    let users: User[];

    if (target.user_id) {
      const user = await repo.findOne({
        where: { user_id: target.user_id },
        relations: { department: true, designation: true },
      });
      if (!user) throw new NotFoundException('Employee not found');
      users = [user];
    } else if (target.user_ids?.length) {
      users = await repo.find({
        where: target.user_ids.map((id) => ({ user_id: id })),
        relations: { department: true, designation: true },
      });
      const foundIds = new Set(users.map((u) => u.user_id));
      const missing = target.user_ids.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        throw new NotFoundException(
          `Employee(s) not found: ${missing.join(', ')}`,
        );
      }
    } else if (target.department_id) {
      users = await repo.find({
        where: { department: { department_id: target.department_id } },
        relations: { department: true, designation: true },
      });
    } else {
      users = await repo.find({
        where: { designation: { designation_id: target.designation_id } },
        relations: { department: true, designation: true },
      });
    }

    if (target.exclude_user_ids?.length) {
      const excluded = new Set(target.exclude_user_ids);
      users = users.filter((u) => !excluded.has(u.user_id));
    }

    if (users.length === 0) {
      throw new BadRequestException(
        'The selected target group resolved to zero employees.',
      );
    }

    return users;
  }

  // ==========================================
  // PREVIEW
  // ==========================================

  async preview(dto: PreviewEntitlementDto): Promise<EmployeeBalancePreview[]> {
    const leaveType = await this.leaveTypeRepository.findOne({
      where: { leave_type_id: dto.leave_type_id },
    });
    if (!leaveType) throw new NotFoundException('Leave type not found');

    const users = await this.resolveTargetUsers(dto.target);

    const balances = await this.balanceRepository.find({
      where: users.map((u) => ({
        user_id: u.user_id,
        leave_type_id: dto.leave_type_id,
      })),
    });
    const balanceByUser = new Map(balances.map((b) => [b.user_id, b]));

    return users.map((user) => {
      const balance = balanceByUser.get(user.user_id);
      const allocated = balance?.allocated_days ?? 0;
      const used = balance?.used_days ?? 0;
      return {
        user_id: user.user_id,
        employee_code: user.employee_code,
        name: `${user.first_name} ${user.last_name}`.trim(),
        department: user.department?.department_name ?? null,
        designation: user.designation?.title ?? null,
        current_allocated: allocated,
        used,
        remaining: Math.max(0, allocated - used),
      };
    });
  }

  // ==========================================
  // BULK ASSIGN (create / increase / deduct entitlements)
  // ==========================================

  async bulkAssign(
    dto: CreateEntitlementDto,
    actor: AuditActor,
  ): Promise<{
    processed: number;
    results: Array<{ user_id: string; leave_entitlement_id: string; total_days: number }>;
  }> {
    const leaveType = await this.leaveTypeRepository.findOne({
      where: { leave_type_id: dto.leave_type_id },
    });
    if (!leaveType) throw new NotFoundException('Leave type not found');

    const users = await this.resolveTargetUsers(dto.target);

    return this.dataSource.transaction(async (manager) => {
      const results: Array<{
        user_id: string;
        leave_entitlement_id: string;
        total_days: number;
      }> = [];

      for (const user of users) {
        const entitlement = await this.applyEntitlementChange(
          manager,
          user,
          dto.leave_type_id,
          dto.year,
          dto.mode,
          dto.days,
          dto.allow_negative ?? false,
          dto.note,
          actor,
        );

        results.push({
          user_id: user.user_id,
          leave_entitlement_id: entitlement.leave_entitlement_id,
          total_days: entitlement.total_days,
        });
      }

      await this.auditService.record({
        actor,
        action: 'leave-entitlement.bulk-assign',
        entityType: 'LeaveEntitlement',
        entityId: null,
        after: {
          leave_type_id: dto.leave_type_id,
          year: dto.year,
          mode: dto.mode,
          days: dto.days,
          affected_users: users.map((u) => u.user_id),
        },
        manager,
      });

      // Best-effort notification; never blocks the transaction outcome.
      const actionLabel =
        dto.mode === EntitlementMode.SET
          ? 'granted'
          : dto.mode === EntitlementMode.INCREASE
            ? 'increased'
            : 'deducted';
      const totalsByUser = new Map(
        results.map((r) => [r.user_id, r.total_days]),
      );

      for (const user of users) {
        if (!user.email) continue;
        await this.mailService.enqueue({
          templateKey: 'leave_entitlement_granted',
          to: user.email,
          toName: `${user.first_name} ${user.last_name}`.trim(),
          relatedUserId: user.user_id,
          context: {
            employee_name: `${user.first_name} ${user.last_name}`.trim(),
            leave_type: leaveType.name,
            year: String(dto.year),
            action: actionLabel,
            total_days: String(totalsByUser.get(user.user_id) ?? ''),
          },
        });
      }

      return { processed: users.length, results };
    });
  }

  /** Increase or deduct balance on a single existing entitlement by id. */
  async adjust(
    id: string,
    dto: AdjustBalanceDto,
    actor: AuditActor,
  ): Promise<LeaveEntitlement> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(LeaveEntitlement);
      const entitlement = await repo.findOne({
        where: { leave_entitlement_id: id },
        relations: { user: true, leaveType: true },
      });
      if (!entitlement) {
        throw new NotFoundException('Leave entitlement not found');
      }

      const mode =
        dto.direction === AdjustDirection.INCREASE
          ? EntitlementMode.INCREASE
          : EntitlementMode.DEDUCT;

      return this.applyEntitlementChange(
        manager,
        entitlement.user,
        entitlement.leave_type_id,
        entitlement.year,
        mode,
        dto.days,
        dto.allow_negative ?? false,
        dto.note,
        actor,
      );
    });
  }

  /**
   * Single point of truth for mutating an entitlement + its balance +
   * writing the history row. Used by both bulk assign (per targeted user)
   * and the single-entitlement adjust endpoint, so "every balance change
   * creates an audit/history record" holds no matter which route triggered
   * it.
   */
  private async applyEntitlementChange(
    manager: EntityManager,
    user: User,
    leaveTypeId: string,
    year: number,
    mode: EntitlementMode,
    days: number,
    allowNegative: boolean,
    note: string | undefined,
    actor: AuditActor,
  ): Promise<LeaveEntitlement> {
    const entitlementRepo = manager.getRepository(LeaveEntitlement);
    const balanceRepo = manager.getRepository(UserLeaveBalance);
    const historyRepo = manager.getRepository(LeaveHistory);

    let entitlement = await entitlementRepo.findOne({
      where: { user_id: user.user_id, leave_type_id: leaveTypeId, year },
      relations: { leaveType: true },
    });

    let balance = await balanceRepo.findOne({
      where: { user_id: user.user_id, leave_type_id: leaveTypeId },
    });
    if (!balance) {
      balance = balanceRepo.create({
        user_id: user.user_id,
        leave_type_id: leaveTypeId,
        allocated_days: 0,
        used_days: 0,
      });
    }

    let delta = 0;
    let historyType: LeaveHistoryType;

    if (!entitlement) {
      entitlement = entitlementRepo.create({
        user_id: user.user_id,
        leave_type_id: leaveTypeId,
        year,
        entitled_days: 0,
        carried_forward_days: 0,
        adjusted_days: 0,
        expired_days: 0,
        created_by: actor.user_id ?? null,
      });

      if (mode === EntitlementMode.SET) {
        entitlement.entitled_days = days;
        delta = days;
        historyType = LeaveHistoryType.ENTITLEMENT;
      } else if (mode === EntitlementMode.INCREASE) {
        entitlement.adjusted_days = days;
        delta = days;
        historyType = LeaveHistoryType.ADJUSTMENT;
      } else {
        // Deduct with nothing previously granted.
        entitlement.adjusted_days = -days;
        delta = -days;
        historyType = LeaveHistoryType.ADJUSTMENT;
      }
    } else if (mode === EntitlementMode.SET) {
      delta = days - entitlement.entitled_days;
      entitlement.entitled_days = days;
      historyType = LeaveHistoryType.ENTITLEMENT;
    } else if (mode === EntitlementMode.INCREASE) {
      entitlement.adjusted_days += days;
      delta = days;
      historyType = LeaveHistoryType.ADJUSTMENT;
    } else {
      entitlement.adjusted_days -= days;
      delta = -days;
      historyType = LeaveHistoryType.ADJUSTMENT;
    }

    const newAllocated = balance.allocated_days + delta;
    const newRemaining = newAllocated - balance.used_days;

    if (!allowNegative && newRemaining < 0) {
      throw new BadRequestException(
        `This change would leave a negative remaining balance (${newRemaining.toFixed(2)}). Pass allow_negative to override.`,
      );
    }

    balance.allocated_days = newAllocated;

    const savedEntitlement = await entitlementRepo.save(entitlement);
    const savedBalance = await balanceRepo.save(balance);

    const history = historyRepo.create({
      user_id: user.user_id,
      leave_type_id: leaveTypeId,
      year,
      type: historyType,
      amount: delta,
      balance_after: Math.max(0, savedBalance.allocated_days - savedBalance.used_days),
      note: note ?? null,
      reference_id: savedEntitlement.leave_entitlement_id,
      reference_type: 'LeaveEntitlement',
      performed_by: actor.user_id ?? null,
    });
    await historyRepo.save(history);

    await this.auditService.record({
      actor,
      action: 'leave-entitlement.change',
      entityType: 'LeaveEntitlement',
      entityId: savedEntitlement.leave_entitlement_id,
      after: {
        user_id: user.user_id,
        leave_type_id: leaveTypeId,
        year,
        mode,
        days,
        delta,
        new_allocated: newAllocated,
      },
      manager,
    });

    return savedEntitlement;
  }

  // ==========================================
  // BALANCE DEDUCTION / RESTORATION (called from LeaveRequestsService)
  // ==========================================

  /**
   * Deducts `days` from the employee's live balance for an approved leave
   * request and writes a "Leave Taken" history entry. Must run inside the
   * caller's transaction (approving a request and deducting the balance are
   * one atomic operation).
   */
  async deductForApprovedLeave(
    manager: EntityManager,
    userId: string,
    leaveTypeId: string,
    days: number,
    leaveRequestId: string,
    actor?: AuditActor,
  ): Promise<void> {
    const balanceRepo = manager.getRepository(UserLeaveBalance);
    const historyRepo = manager.getRepository(LeaveHistory);

    let balance = await balanceRepo.findOne({
      where: { user_id: userId, leave_type_id: leaveTypeId },
    });
    if (!balance) {
      balance = balanceRepo.create({
        user_id: userId,
        leave_type_id: leaveTypeId,
        allocated_days: 0,
        used_days: 0,
      });
    }

    balance.used_days += days;
    const savedBalance = await balanceRepo.save(balance);

    const history = historyRepo.create({
      user_id: userId,
      leave_type_id: leaveTypeId,
      year: new Date().getFullYear(),
      type: LeaveHistoryType.LEAVE_TAKEN,
      amount: -days,
      balance_after: Math.max(0, savedBalance.allocated_days - savedBalance.used_days),
      note: 'Leave taken (approved request)',
      reference_id: leaveRequestId,
      reference_type: 'LeaveRequest',
      performed_by: actor?.user_id ?? null,
    });
    await historyRepo.save(history);
  }

  /**
   * Gives `days` back to the employee's balance (request rejected/cancelled/
   * deleted after having been approved). Mirrors `deductForApprovedLeave`
   * exactly so the ledger nets to zero for a leave that was approved then
   * reversed.
   */
  async restoreBalance(
    manager: EntityManager,
    userId: string,
    leaveTypeId: string,
    days: number,
    leaveRequestId: string,
    actor?: AuditActor,
  ): Promise<void> {
    const balanceRepo = manager.getRepository(UserLeaveBalance);
    const historyRepo = manager.getRepository(LeaveHistory);

    const balance = await balanceRepo.findOne({
      where: { user_id: userId, leave_type_id: leaveTypeId },
    });
    if (!balance) return;

    balance.used_days = Math.max(0, balance.used_days - days);
    const savedBalance = await balanceRepo.save(balance);

    const history = historyRepo.create({
      user_id: userId,
      leave_type_id: leaveTypeId,
      year: new Date().getFullYear(),
      type: LeaveHistoryType.LEAVE_TAKEN,
      amount: days,
      balance_after: Math.max(0, savedBalance.allocated_days - savedBalance.used_days),
      note: 'Balance restored (request reversed)',
      reference_id: leaveRequestId,
      reference_type: 'LeaveRequest',
      performed_by: actor?.user_id ?? null,
    });
    await historyRepo.save(history);
  }

  // ==========================================
  // READ / REPORTING
  // ==========================================

  async findAll(
    query: EntitlementQueryDto,
  ): Promise<PaginatedResult<LeaveEntitlement>> {
    const qb = this.entitlementRepository
      .createQueryBuilder('entitlement')
      .leftJoinAndSelect('entitlement.user', 'user')
      .leftJoinAndSelect('entitlement.leaveType', 'leaveType')
      .leftJoinAndSelect('user.department', 'department')
      .leftJoinAndSelect('user.designation', 'designation');

    if (query.year) {
      qb.andWhere('entitlement.year = :year', { year: query.year });
    }
    if (query.user_id) {
      qb.andWhere('entitlement.user_id = :userId', { userId: query.user_id });
    }
    if (query.leave_type_id) {
      qb.andWhere('entitlement.leave_type_id = :leaveTypeId', {
        leaveTypeId: query.leave_type_id,
      });
    }
    if (query.department_id) {
      qb.andWhere('department.department_id = :departmentId', {
        departmentId: query.department_id,
      });
    }
    if (query.designation_id) {
      qb.andWhere('designation.designation_id = :designationId', {
        designationId: query.designation_id,
      });
    }

    const [data, total] = await qb
      .orderBy('entitlement.created_at', 'DESC')
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();

    return paginatedResult(data, total, query);
  }

  /**
   * Flat, one-row-per-(employee, leave type) report backing the Employee
   * Leave Management DataTable: entitlement/used/remaining from the live
   * `UserLeaveBalance`, plus a pending-request count computed from
   * `LeaveRequest` for that same employee + leave type.
   */
  async findBalanceReport(
    query: LeaveBalanceReportQueryDto,
  ): Promise<PaginatedResult<LeaveBalanceReportRow>> {
    const qb = this.balanceRepository
      .createQueryBuilder('balance')
      .leftJoinAndSelect('balance.user', 'user')
      .leftJoinAndSelect('balance.leaveType', 'leaveType')
      .leftJoinAndSelect('user.department', 'department')
      .leftJoinAndSelect('user.designation', 'designation');

    if (query.search) {
      qb.andWhere(
        '(user.first_name ILIKE :search OR user.last_name ILIKE :search OR user.employee_code ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.user_id) {
      qb.andWhere('balance.user_id = :userId', { userId: query.user_id });
    }
    if (query.leave_type_id) {
      qb.andWhere('balance.leave_type_id = :leaveTypeId', {
        leaveTypeId: query.leave_type_id,
      });
    }
    if (query.department_id) {
      qb.andWhere('department.department_id = :departmentId', {
        departmentId: query.department_id,
      });
    }
    if (query.designation_id) {
      qb.andWhere('designation.designation_id = :designationId', {
        designationId: query.designation_id,
      });
    }
    if (query.status) {
      qb.andWhere('user.status = :status', {
        status: query.status === 'active',
      });
    }

    const SORT_COLUMN_MAP: Record<string, string> = {
      employee_name: 'user.first_name',
      department: 'department.department_name',
      leave_type: 'leaveType.name',
      status: 'user.status',
    };
    if (query.sortBy && query.sortBy !== 'remaining' && SORT_COLUMN_MAP[query.sortBy]) {
      qb.orderBy(SORT_COLUMN_MAP[query.sortBy], query.order);
    } else if (query.sortBy !== 'remaining') {
      qb.orderBy('user.first_name', 'ASC');
    }

    // "Remaining" is derived (allocated - used), not a real column, so it
    // can't be pushed into the DB sort/pagination — fetch everything
    // matching the filters, sort/paginate in memory instead.
    const sortByRemaining = query.sortBy === 'remaining';
    const all = await qb.getMany();

    const pendingCounts = await this.leaveRequestRepository
      .createQueryBuilder('lr')
      .select('lr.user_id', 'user_id')
      .addSelect('lr.leave_type_id', 'leave_type_id')
      .addSelect('COUNT(*)', 'count')
      .where('lr.status = :status', { status: 'Pending' })
      .andWhere('lr.leave_type_id IS NOT NULL')
      .groupBy('lr.user_id')
      .addGroupBy('lr.leave_type_id')
      .getRawMany<{ user_id: string; leave_type_id: string; count: string }>();
    const pendingByKey = new Map(
      pendingCounts.map((p) => [`${p.user_id}:${p.leave_type_id}`, Number(p.count)]),
    );

    let rows: LeaveBalanceReportRow[] = all.map((balance) => ({
      user_id: balance.user_id,
      employee_code: balance.user.employee_code,
      employee_name: `${balance.user.first_name} ${balance.user.last_name}`.trim(),
      department: balance.user.department?.department_name ?? null,
      designation: balance.user.designation?.title ?? null,
      leave_type_id: balance.leave_type_id,
      leave_type_name: balance.leaveType.name,
      total_entitlement: balance.allocated_days,
      used_days: balance.used_days,
      remaining_days: balance.remaining_days,
      pending_requests:
        pendingByKey.get(`${balance.user_id}:${balance.leave_type_id}`) ?? 0,
      status: balance.user.status ? 'active' : 'inactive',
    }));

    if (sortByRemaining) {
      rows = rows.sort((a, b) =>
        query.order === 'ASC'
          ? a.remaining_days - b.remaining_days
          : b.remaining_days - a.remaining_days,
      );
    }

    const total = rows.length;
    const page = query.page;
    const limit = query.limit;
    const paged = limit > 0 ? rows.slice((page - 1) * limit, (page - 1) * limit + limit) : rows;

    return {
      data: paged,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / (limit || total || 1))),
    };
  }

  async findHistory(
    query: LeaveHistoryQueryDto,
  ): Promise<PaginatedResult<LeaveHistory>> {
    const qb = this.historyRepository
      .createQueryBuilder('history')
      .leftJoinAndSelect('history.user', 'user')
      .leftJoinAndSelect('history.leaveType', 'leaveType')
      .leftJoinAndSelect('history.performedBy', 'performedBy');

    if (query.year) {
      qb.andWhere('history.year = :year', { year: query.year });
    }
    if (query.user_id) {
      qb.andWhere('history.user_id = :userId', { userId: query.user_id });
    }
    if (query.leave_type_id) {
      qb.andWhere('history.leave_type_id = :leaveTypeId', {
        leaveTypeId: query.leave_type_id,
      });
    }
    if (query.type) {
      qb.andWhere('history.type = :type', { type: query.type });
    }

    const [data, total] = await qb
      .orderBy('history.created_at', 'DESC')
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();

    return paginatedResult(data, total, query);
  }
}
