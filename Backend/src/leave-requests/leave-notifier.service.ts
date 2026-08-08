import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { LeaveRequest } from './leave-requests.entity';
import { User } from '../users/user.entity';
import { LeaveType } from '../leave-types/leave-types.entity';
import { UserLeaveBalance } from '../users/user-leave-balance.entity';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationCategory } from '../notifications/notifications.entity';

/**
 * Roles that count as "HR" for leave notifications. Recipient resolution is
 * role-name based because the permission graph is action-shaped
 * (`leave-request.view`, …), not recipient-shaped — there is no
 * "receive leave emails" permission, so the org's people-team roles are the
 * best available stand-in.
 */
const HR_ROLE_NAMES = new Set(['HR Manager', 'HR Admin', 'Admin']);

/**
 * Recipient resolver + dual-channel push (in-app notification + email) for the
 * five leave events. Extracted from `LeaveRequestsService` so submission,
 * approval, rejection, cancellation, and balance updates all fan out to the
 * same triple (employee, reporting manager, HR) without duplicating the
 * recipient logic.
 */
@Injectable()
export class LeaveNotifierService {
  private readonly logger = new Logger(LeaveNotifierService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(UserLeaveBalance)
    private readonly balanceRepo: Repository<UserLeaveBalance>,

    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * "Leave request submitted" — employee, their reporting manager, and HR all
   * get both an internal notification and an email.
   */
  async notifySubmitted(
    leaveRequest: LeaveRequest,
    user: User,
    manager?: EntityManager,
  ): Promise<void> {
    const [leaveType, hrUsers] = await this.loadContext(
      leaveRequest.leave_type_id,
      manager,
    );

    const leaveTypeName = leaveType?.name ?? leaveRequest.leave_type;
    const employeeName = `${user.first_name} ${user.last_name}`.trim();
    const startDate = String(leaveRequest.start_date);
    const endDate = String(leaveRequest.end_date);

    const recipientIds = [user.user_id];
    if (user.team_lead_id) recipientIds.push(user.team_lead_id);
    recipientIds.push(...hrUsers.map((h) => h.user_id));

    await this.notifications.pushMany(
      recipientIds,
      {
        title: `${employeeName} requested ${leaveTypeName}`,
        message: `${employeeName} requested ${leaveTypeName} from ${startDate} to ${endDate} (pending approval).`,
        category: NotificationCategory.LEAVE_SUBMITTED,
        link: '/leave/requests',
        referenceId: leaveRequest.leave_id,
        referenceType: 'LeaveRequest',
      },
      manager,
    );

    const mailContext = {
      employee_name: employeeName,
      leave_type: leaveTypeName,
      start_date: startDate,
      end_date: endDate,
    };

    const manager_ = await this.resolveManager(user, manager);

    await this.enqueueTo(user, 'leave_request_submitted', mailContext);
    if (manager_?.email) {
      await this.enqueueTo(manager_, 'leave_request_submitted', mailContext);
    }
    for (const hr of hrUsers) {
      if (hr.email) await this.enqueueTo(hr, 'leave_request_submitted', mailContext);
    }
  }

  /**
   * Approval/rejection/cancellation. Same triple, but the email carries the
   * decision reason (from the new `approval_reason` / `rejection_reason` /
   * `cancellation_reason` columns) and, for approvals, the days deducted and
   * the employee's remaining balance.
   */
  async notifyDecision(
    leaveRequest: LeaveRequest,
    user: User,
    templateKey: string,
    manager?: EntityManager,
  ): Promise<void> {
    const [leaveType, hrUsers] = await this.loadContext(
      leaveRequest.leave_type_id,
      manager,
    );

    const leaveTypeName = leaveType?.name ?? leaveRequest.leave_type;
    const employeeName = `${user.first_name} ${user.last_name}`.trim();
    const startDate = String(leaveRequest.start_date);
    const endDate = String(leaveRequest.end_date);
    const status = leaveRequest.status;

    const reason =
      status === 'Approved'
        ? leaveRequest.approval_reason
        : status === 'Rejected'
          ? leaveRequest.rejection_reason
          : status === 'Cancelled'
            ? leaveRequest.cancellation_reason
            : null;

    const remaining = await this.loadRemainingBalance(
      user.user_id,
      leaveRequest.leave_type_id,
      manager,
    );

    const headline =
      status === 'Approved'
        ? 'approved'
        : status === 'Rejected'
          ? 'rejected'
          : 'cancelled';

    const message = [
      `${employeeName}'s ${leaveTypeName} request (${startDate} to ${endDate}) was ${headline}.`,
      reason ? `Reason: ${reason}` : null,
      status === 'Approved' ? `${leaveRequest.days_count ?? 0} day(s) deducted; ${remaining} day(s) remain.` : null,
    ]
      .filter(Boolean)
      .join(' ');

    const recipientIds = [user.user_id];
    if (user.team_lead_id) recipientIds.push(user.team_lead_id);
    recipientIds.push(...hrUsers.map((h) => h.user_id));

    const category =
      status === 'Approved'
        ? NotificationCategory.LEAVE_APPROVED
        : status === 'Rejected'
          ? NotificationCategory.LEAVE_REJECTED
          : NotificationCategory.LEAVE_CANCELLED;

    await this.notifications.pushMany(
      recipientIds,
      {
        title: `Leave request ${headline}`,
        message,
        category,
        link: '/leave/requests',
        referenceId: leaveRequest.leave_id,
        referenceType: 'LeaveRequest',
      },
      manager,
    );

    const context = {
      employee_name: employeeName,
      leave_type: leaveTypeName,
      start_date: startDate,
      end_date: endDate,
      days_count: String(leaveRequest.days_count ?? ''),
      remaining_balance: String(remaining),
      // Never left empty: an empty string is skipped by the renderer's
      // sanitiser, which would leave the literal `{{decision_reason}}` token
      // visible in the email. A pre-approved backfill can reach here with no
      // stored reason, so fall back to a neutral phrase.
      decision_reason: reason && reason.trim() ? reason : 'No reason provided.',
    };

    const manager_ = await this.resolveManager(user, manager);

    await this.enqueueTo(user, templateKey, context);
    if (manager_?.email) {
      await this.enqueueTo(manager_, templateKey, context);
    }
    for (const hr of hrUsers) {
      if (hr.email) await this.enqueueTo(hr, templateKey, context);
    }
  }

  /**
   * "Leave balance updated" — triggered by the entitlements service after any
   * grant/increase/deduct. Only the affected employee is notified; the audit
   * log, not HR's inbox, is the record of who did what.
   */
  async notifyBalanceUpdated(
    userId: string,
    leaveTypeName: string,
    year: number,
    remaining: number,
    manager?: EntityManager,
  ): Promise<void> {
    const user = await this.findUser(userId, manager);
    if (!user) return;

    const message = `Your ${leaveTypeName} balance for ${year} was updated. ${remaining} day(s) remain.`;
    await this.notifications.push(
      {
        recipientId: userId,
        title: `Leave balance updated`,
        message,
        category: NotificationCategory.LEAVE_BALANCE_UPDATED,
        link: '/leave',
        referenceType: 'LeaveEntitlement',
      },
      manager,
    );

    if (user.email) {
      await this.mail.enqueue({
        templateKey: 'leave_entitlement_granted',
        to: user.email,
        toName: `${user.first_name} ${user.last_name}`.trim(),
        relatedUserId: user.user_id,
        context: {
          employee_name: `${user.first_name} ${user.last_name}`.trim(),
          leave_type: leaveTypeName,
          year: String(year),
          action: 'updated',
          total_days: String(remaining),
        },
      });
    }
  }

  // ==========================================
  // INTERNAL HELPERS
  // ==========================================

  private async loadContext(
    leaveTypeId: string | null | undefined,
    manager?: EntityManager,
  ): Promise<[LeaveType | null, User[]]> {
    const userRepo = manager ? manager.getRepository(User) : this.userRepo;

    const [leaveType, hrUsers] = await Promise.all([
      leaveTypeId
        ? this.findLeaveType(leaveTypeId, manager)
        : Promise.resolve(null),
      userRepo
        .createQueryBuilder('user')
        .leftJoinAndSelect('user.role', 'role')
        .where('role.role_name IN (:...names)', { names: [...HR_ROLE_NAMES] })
        .andWhere('user.status = :active', { active: true })
        .getMany()
        .catch(() => []),
    ]);

    return [leaveType, hrUsers];
  }

  private async findLeaveType(
    leaveTypeId: string,
    manager?: EntityManager,
  ): Promise<LeaveType | null> {
    const repo = manager
      ? manager.getRepository(LeaveType)
      : this.userRepo.manager.getRepository(LeaveType);
    return repo
      .findOne({ where: { leave_type_id: leaveTypeId } })
      .catch(() => null);
  }

  /**
   * The employee's reporting manager, for the manager email. Callers load the
   * employee with only `department`/`designation`, so `teamLead` is usually
   * absent — fall back to a lookup by `team_lead_id` rather than silently
   * skipping the manager's mail. Returns null when the employee has no lead.
   */
  private async resolveManager(
    user: User,
    manager?: EntityManager,
  ): Promise<User | null> {
    if (user.teamLead?.email) return user.teamLead;
    if (!user.team_lead_id) return null;
    return this.findUser(user.team_lead_id, manager);
  }

  private async findUser(
    userId: string,
    manager?: EntityManager,
  ): Promise<User | null> {
    const repo = manager ? manager.getRepository(User) : this.userRepo;
    return repo
      .findOne({
        where: { user_id: userId },
        relations: { teamLead: true, role: true },
      })
      .catch(() => null);
  }

  private async loadRemainingBalance(
    userId: string,
    leaveTypeId: string | null | undefined,
    manager?: EntityManager,
  ): Promise<number> {
    if (!leaveTypeId) return 0;
    const balanceRepo = manager
      ? manager.getRepository(UserLeaveBalance)
      : this.balanceRepo;
    try {
      const balance = await balanceRepo.findOne({
        where: { user_id: userId, leave_type_id: leaveTypeId },
      });
      if (!balance) return 0;
      const allocated = Number(balance.allocated_days) || 0;
      const used = Number(balance.used_days) || 0;
      return Math.max(0, allocated - used);
    } catch {
      return 0;
    }
  }

  private async enqueueTo(
    user: User,
    templateKey: string,
    context: Record<string, string>,
  ): Promise<void> {
    if (!user.email) return;
    await this.mail.enqueue({
      templateKey,
      to: user.email,
      toName: `${user.first_name} ${user.last_name}`.trim(),
      relatedUserId: user.user_id,
      context,
    });
  }
}
