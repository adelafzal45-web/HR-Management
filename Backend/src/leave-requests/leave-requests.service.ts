import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { LeaveRequest } from './leave-requests.entity';
import { User } from '../users/user.entity';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { UpdateLeaveRequestDto } from './dto/update-leave-request.dto';

import { LeaveEntitlementsService } from '../leave-entitlements/leave-entitlements.service';
import { LeaveCalculationService } from '../leave-entitlements/leave-calculation.service';
import { AuditService, type AuditActor } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';

const APPROVED = 'Approved';
const REJECTED = 'Rejected';
const CANCELLED = 'Cancelled';

/** Statuses that hold a live deduction against the employee's balance. */
const BALANCE_HELD_STATUSES = new Set([APPROVED]);

@Injectable()
export class LeaveRequestsService {
  constructor(
    @InjectRepository(LeaveRequest)
    private readonly leaveRequestRepository: Repository<LeaveRequest>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly dataSource: DataSource,
    private readonly leaveEntitlements: LeaveEntitlementsService,
    private readonly leaveCalculation: LeaveCalculationService,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
  ) {}

  async create(
    createLeaveRequestDto: CreateLeaveRequestDto,
    actor?: AuditActor,
  ): Promise<LeaveRequest> {
    const user = await this.userRepository.findOne({
      where: {
        user_id: createLeaveRequestDto.user_id,
      },
      relations: { department: true, designation: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    let approvedBy: User | null = null;

    if (createLeaveRequestDto.approved_by_id) {
      approvedBy = await this.userRepository.findOne({
        where: {
          user_id: createLeaveRequestDto.approved_by_id,
        },
      });

      if (!approvedBy) {
        throw new NotFoundException('Approver not found');
      }
    }

    const status = createLeaveRequestDto.status ?? 'Pending';

    const leaveRequest = this.leaveRequestRepository.create({
      leave_type: createLeaveRequestDto.leave_type,
      leave_type_id: createLeaveRequestDto.leave_type_id ?? null,
      start_date: createLeaveRequestDto.start_date,
      end_date: createLeaveRequestDto.end_date,
      is_half_day: createLeaveRequestDto.is_half_day ?? false,
      reason: createLeaveRequestDto.reason,
      status,
      user,
      approved_by: approvedBy ?? undefined,
      approved_date: approvedBy ? new Date() : undefined,
    });

    // A request can be created pre-approved (e.g. HR backfilling a record),
    // so the same deduction path used by `update()` applies here too.
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(LeaveRequest);
      let saved = await repo.save(leaveRequest);

      if (BALANCE_HELD_STATUSES.has(status)) {
        saved = await this.applyApproval(manager, saved, user, actor);
      }

      if (actor) {
        await this.auditService.record({
          actor,
          action: 'leave-request.create',
          entityType: 'LeaveRequest',
          entityId: saved.leave_id,
          after: {
            leave_type: saved.leave_type,
            start_date: saved.start_date,
            end_date: saved.end_date,
            status: saved.status,
            days_count: saved.days_count,
          },
          manager,
        });
      }

      return saved;
    });
  }

  async findAll(): Promise<LeaveRequest[]> {
    return this.leaveRequestRepository.find({
      order: {
        applied_date: 'DESC',
      },
    });
  }

  async findOne(id: string): Promise<LeaveRequest> {
    const leaveRequest = await this.leaveRequestRepository.findOne({
      where: {
        leave_id: id,
      },
    });

    if (!leaveRequest) {
      throw new NotFoundException('Leave request not found');
    }

    return leaveRequest;
  }

  async update(
    id: string,
    updateLeaveRequestDto: UpdateLeaveRequestDto,
    actor?: AuditActor,
  ): Promise<LeaveRequest> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(LeaveRequest);
      const userRepo = manager.getRepository(User);

      const leaveRequest = await repo.findOne({ where: { leave_id: id } });
      if (!leaveRequest) {
        throw new NotFoundException('Leave request not found');
      }

      const previousStatus = leaveRequest.status;
      const before = {
        status: leaveRequest.status,
        start_date: leaveRequest.start_date,
        end_date: leaveRequest.end_date,
        days_count: leaveRequest.days_count,
      };

      let user = leaveRequest.user;

      if (updateLeaveRequestDto.user_id) {
        const found = await userRepo.findOne({
          where: { user_id: updateLeaveRequestDto.user_id },
          relations: { department: true, designation: true },
        });
        if (!found) {
          throw new NotFoundException('User not found');
        }
        leaveRequest.user = found;
        user = found;
      } else {
        const found = await userRepo.findOne({
          where: { user_id: user.user_id },
          relations: { department: true, designation: true },
        });
        if (found) user = found;
      }

      if (updateLeaveRequestDto.approved_by_id) {
        const approvedBy = await userRepo.findOne({
          where: { user_id: updateLeaveRequestDto.approved_by_id },
        });
        if (!approvedBy) {
          throw new NotFoundException('Approver not found');
        }
        leaveRequest.approved_by = approvedBy;
        leaveRequest.approved_date = new Date();
      }

      Object.assign(leaveRequest, {
        leave_type: updateLeaveRequestDto.leave_type ?? leaveRequest.leave_type,
        leave_type_id:
          updateLeaveRequestDto.leave_type_id !== undefined
            ? updateLeaveRequestDto.leave_type_id
            : leaveRequest.leave_type_id,
        start_date: updateLeaveRequestDto.start_date ?? leaveRequest.start_date,
        end_date: updateLeaveRequestDto.end_date ?? leaveRequest.end_date,
        is_half_day:
          updateLeaveRequestDto.is_half_day !== undefined
            ? updateLeaveRequestDto.is_half_day
            : leaveRequest.is_half_day,
        reason: updateLeaveRequestDto.reason ?? leaveRequest.reason,
        status: updateLeaveRequestDto.status ?? leaveRequest.status,
      });

      const newStatus = leaveRequest.status;
      const wasHeld = BALANCE_HELD_STATUSES.has(previousStatus);
      const isHeld = BALANCE_HELD_STATUSES.has(newStatus);

      let saved: LeaveRequest;

      if (wasHeld && !isHeld) {
        // Approved -> Rejected/Cancelled/Pending: give the days back.
        saved = await repo.save(leaveRequest);
        if (saved.leave_type_id && saved.days_count) {
          await this.leaveEntitlements.restoreBalance(
            manager,
            saved.user.user_id,
            saved.leave_type_id,
            saved.days_count,
            saved.leave_id,
            actor,
          );
        }
        saved.days_count = null;
        saved = await repo.save(saved);
      } else if (!wasHeld && isHeld) {
        // -> Approved: deduct.
        saved = await repo.save(leaveRequest);
        saved = await this.applyApproval(manager, saved, user, actor);
      } else if (wasHeld && isHeld && this.datesChanged(before, leaveRequest)) {
        // Still approved but the date range changed: restore the old
        // deduction, then recompute and re-deduct against the new range,
        // instead of trusting the delta.
        if (leaveRequest.leave_type_id && before.days_count) {
          await this.leaveEntitlements.restoreBalance(
            manager,
            user.user_id,
            leaveRequest.leave_type_id,
            before.days_count,
            leaveRequest.leave_id,
            actor,
          );
        }
        saved = await repo.save(leaveRequest);
        saved = await this.applyApproval(manager, saved, user, actor);
      } else {
        saved = await repo.save(leaveRequest);
      }

      if (actor) {
        await this.auditService.record({
          actor,
          action: 'leave-request.update',
          entityType: 'LeaveRequest',
          entityId: saved.leave_id,
          before,
          after: {
            status: saved.status,
            start_date: saved.start_date,
            end_date: saved.end_date,
            days_count: saved.days_count,
          },
          manager,
        });
      }

      if (previousStatus !== saved.status) {
        await this.notifyStatusChange(saved, user);
      }

      return saved;
    });
  }

  async remove(id: string, actor?: AuditActor) {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(LeaveRequest);
      const leaveRequest = await repo.findOne({ where: { leave_id: id } });

      if (!leaveRequest) {
        throw new NotFoundException('Leave request not found');
      }

      // Deleting an approved request must not leave the deducted days stuck
      // against the employee's balance forever.
      if (
        BALANCE_HELD_STATUSES.has(leaveRequest.status) &&
        leaveRequest.leave_type_id &&
        leaveRequest.days_count
      ) {
        await this.leaveEntitlements.restoreBalance(
          manager,
          leaveRequest.user.user_id,
          leaveRequest.leave_type_id,
          leaveRequest.days_count,
          leaveRequest.leave_id,
          actor,
        );
      }

      await repo.delete(id);

      if (actor) {
        await this.auditService.record({
          actor,
          action: 'leave-request.delete',
          entityType: 'LeaveRequest',
          entityId: id,
          before: {
            status: leaveRequest.status,
            days_count: leaveRequest.days_count,
          },
          manager,
        });
      }

      return {
        message: 'Leave request deleted successfully',
      };
    });
  }

  // ==========================================
  // INTERNAL HELPERS
  // ==========================================

  private datesChanged(
    before: { start_date: Date; end_date: Date },
    after: LeaveRequest,
  ): boolean {
    return (
      String(before.start_date) !== String(after.start_date) ||
      String(before.end_date) !== String(after.end_date)
    );
  }

  /**
   * Computes chargeable days for the request's date range and department/
   * designation scope, deducts them from the employee's balance, and stores
   * the computed count on the request itself.
   *
   * Requires `leave_type_id` — a request only carrying the free-text
   * `leave_type` cannot be matched to a balance, so approval is refused
   * rather than silently skipping the deduction.
   */
  private async applyApproval(
    manager: EntityManager,
    leaveRequest: LeaveRequest,
    user: User,
    actor?: AuditActor,
  ): Promise<LeaveRequest> {
    if (!leaveRequest.leave_type_id) {
      throw new BadRequestException(
        'This leave request has no leave_type_id, so it cannot be approved — balance cannot be deducted against a free-text leave type.',
      );
    }

    const days = await this.leaveCalculation.countLeaveDays(
      leaveRequest.start_date,
      leaveRequest.end_date,
      {
        departmentId: user.department?.department_id ?? null,
        designationId: user.designation?.designation_id ?? null,
      },
      leaveRequest.is_half_day,
    );

    if (days <= 0) {
      throw new BadRequestException(
        'The selected date range contains no working days to charge against the balance.',
      );
    }

    await this.leaveEntitlements.deductForApprovedLeave(
      manager,
      user.user_id,
      leaveRequest.leave_type_id,
      days,
      leaveRequest.leave_id,
      actor,
    );

    leaveRequest.days_count = days;
    const repo = manager.getRepository(LeaveRequest);
    return repo.save(leaveRequest);
  }

  private async notifyStatusChange(
    leaveRequest: LeaveRequest,
    user: User,
  ): Promise<void> {
    if (!user.email) return;

    const templateKey =
      leaveRequest.status === APPROVED
        ? 'leave_request_approved'
        : leaveRequest.status === REJECTED
          ? 'leave_request_rejected'
          : leaveRequest.status === CANCELLED
            ? 'leave_request_cancelled'
            : null;

    if (!templateKey) return;

    await this.mailService.enqueue({
      templateKey,
      to: user.email,
      toName: `${user.first_name} ${user.last_name}`.trim(),
      relatedUserId: user.user_id,
      context: {
        employee_name: `${user.first_name} ${user.last_name}`.trim(),
        leave_type: leaveRequest.leave_type,
        start_date: String(leaveRequest.start_date),
        end_date: String(leaveRequest.end_date),
        days_count: String(leaveRequest.days_count ?? ''),
      },
    });
  }
}