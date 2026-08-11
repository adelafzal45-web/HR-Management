import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { User } from '../users/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationCategory } from '../notifications/notifications.entity';

/**
 * Roles that count as "HR" for payroll notifications. Recipient resolution is
 * role-name based for the same reason as the leave notifier: the permission
 * graph is action-shaped (`reimbursements.approve`, …), not recipient-shaped,
 * so the org's people-team roles are the best available stand-in.
 */
const HR_ROLE_NAMES = ['HR Manager', 'HR Admin', 'Admin'];

/** What was requested — decides the wording and the link. */
export type PayrollRequestKind = 'loan' | 'reimbursement';

/**
 * In-app notifications for the two employee-initiated payroll flows: loan
 * requests and expense claims. Submission notifies HR; a decision notifies the
 * employee.
 *
 * Every method is non-blocking by contract — a notification failure is logged
 * and swallowed, never allowed to fail the request that triggered it. Losing a
 * bell badge is not a reason to reject an employee's loan application.
 *
 * Email is deliberately out of scope here: unlike leave, there is no seeded
 * `email_templates` row for payroll requests, and `MailService.enqueue` would
 * queue rows no template can render.
 */
@Injectable()
export class PayrollNotifierService {
  private readonly logger = new Logger(PayrollNotifierService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notifications: NotificationsService,
  ) {}

  /** "Ashan requested a loan" → every active HR/Admin user. */
  async notifySubmitted(
    kind: PayrollRequestKind,
    referenceId: string,
    userId: string,
    summary: string,
    manager?: EntityManager,
  ): Promise<void> {
    try {
      const [employee, hrUsers] = await Promise.all([
        this.findUser(userId, manager),
        this.findHrUsers(manager),
      ]);
      if (hrUsers.length === 0) return;

      const name = employee ? fullName(employee) : 'An employee';
      const noun = kind === 'loan' ? 'loan request' : 'expense claim';

      await this.notifications.pushMany(
        hrUsers.map((h) => h.user_id),
        {
          title: `${name} submitted a ${noun}`,
          message: `${name} submitted a ${noun}: ${summary}. Pending your approval.`,
          category: NotificationCategory.PAYROLL,
          link: kind === 'loan' ? '/payroll/loans' : '/payroll/reimbursements',
          referenceId,
          referenceType: kind === 'loan' ? 'EmployeeLoan' : 'Reimbursement',
        },
        manager,
      );
    } catch (error) {
      this.logger.warn(
        `Could not notify HR of the ${kind} submission: ${messageOf(error)}`,
      );
    }
  }

  /** "Your loan request was approved" → the employee who filed it. */
  async notifyDecision(
    kind: PayrollRequestKind,
    referenceId: string,
    userId: string,
    decision: 'approved' | 'rejected',
    summary: string,
    note?: string | null,
    manager?: EntityManager,
  ): Promise<void> {
    try {
      const noun = kind === 'loan' ? 'loan request' : 'expense claim';
      const message = [
        `Your ${noun} (${summary}) was ${decision}.`,
        note && note.trim() ? `Note: ${note.trim()}` : null,
        decision === 'approved' && kind === 'reimbursement'
          ? 'It will be added to your next payslip.'
          : null,
        decision === 'approved' && kind === 'loan'
          ? 'Repayment installments start from your next payslip.'
          : null,
      ]
        .filter(Boolean)
        .join(' ');

      await this.notifications.push(
        {
          recipientId: userId,
          title: `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ${decision}`,
          message,
          category: NotificationCategory.PAYROLL,
          link:
            kind === 'loan' ? '/payroll/my-loans' : '/payroll/my-reimbursements',
          referenceId,
          referenceType: kind === 'loan' ? 'EmployeeLoan' : 'Reimbursement',
        },
        manager,
      );
    } catch (error) {
      this.logger.warn(
        `Could not notify the employee of the ${kind} decision: ${messageOf(error)}`,
      );
    }
  }

  // ---- Internal ------------------------------------------------------------

  private findHrUsers(manager?: EntityManager): Promise<User[]> {
    const repo = manager ? manager.getRepository(User) : this.userRepo;
    return repo
      .createQueryBuilder('user')
      .leftJoin('user.role', 'role')
      .where('role.role_name IN (:...names)', { names: HR_ROLE_NAMES })
      .andWhere('user.status = :active', { active: true })
      .getMany()
      .catch(() => []);
  }

  private findUser(
    userId: string,
    manager?: EntityManager,
  ): Promise<User | null> {
    const repo = manager ? manager.getRepository(User) : this.userRepo;
    return repo.findOne({ where: { user_id: userId } }).catch(() => null);
  }
}

function fullName(user: User): string {
  return `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'An employee';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
