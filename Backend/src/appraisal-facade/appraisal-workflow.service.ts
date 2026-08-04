import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { PerformanceReview } from '../performance-review/performance-review.entity';
import {
  ReviewApproval,
  ReviewApprovalAction,
} from '../performance-review/review-approval.entity';
import {
  AppraisalNotification,
  AppraisalNotificationType,
} from '../appraisal-notifications/appraisal-notification.entity';
import { User } from '../users/user.entity';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';

import { WorkflowActionDto } from './dto/workflow-action.dto';

/** One entry in a review's lifecycle trail, oldest first. */
export interface ReviewApprovalDto {
  approvalId: string;
  action: ReviewApprovalAction;
  actorId: string | null;
  actorName: string;
  comment: string | null;
  createdAt: string;
}

export interface WorkflowResultDto {
  reviewId: string;
  status: string;
  submittedAt: string | null;
  lockedAt: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  approvals: ReviewApprovalDto[];
  message: string;
}

/**
 * The states each action may act on.
 *
 * Approve and reject both accept `Submitted` only. Re-approving an already
 * approved review is not idempotent housekeeping — it would append a second
 * APPROVE row to an append-only trail and move `approved_at` forward, making the
 * history claim the review was approved twice.
 *
 * Reopen accepts all three terminal states, including `Rejected`: a rejection is
 * exactly the case where the reviewer needs the form back.
 */
const APPROVABLE_STATUSES = ['Submitted'];
const REOPENABLE_STATUSES = ['Submitted', 'Approved', 'Rejected'];

/**
 * HR's side of the appraisal lifecycle: approve, reject, reopen.
 *
 * Submit lives in `AppraisalFacadeService` because it is the reviewer's action and
 * shares that service's scoping and scoring machinery. Everything here is an
 * HR/Admin action gated by `appraisal.approve`, and every one of them does the
 * same four things in a single transaction:
 *
 *   1. move `performance_reviews.status` (plus its lock/approval columns),
 *   2. append a row to `review_approvals` — never update, never delete,
 *   3. write an `appraisal.review.*` audit row through the same manager, so the
 *      trail cannot survive a rolled-back state change,
 *   4. queue an in-app notification for the reviewer.
 *
 * The email is enqueued *after* the transaction commits. `MailService.enqueue`
 * never throws, but it writes to `email_queue` on its own connection, so
 * including it inside the transaction would mean a queued email surviving a
 * rollback. Losing a notification email on a crash is recoverable; telling a
 * reviewer their review was approved when it was not is not.
 */
@Injectable()
export class AppraisalWorkflowService {
  private readonly logger = new Logger(AppraisalWorkflowService.name);

  constructor(
    private readonly dataSource: DataSource,

    @InjectRepository(PerformanceReview)
    private readonly reviewRepository: Repository<PerformanceReview>,

    private readonly audit: AuditService,

    private readonly mail: MailService,
  ) {}

  async approve(
    reviewId: string,
    dto: WorkflowActionDto,
    actorId: string,
  ): Promise<WorkflowResultDto> {
    return this.transition({
      reviewId,
      actorId,
      comment: dto.comment,
      action: ReviewApprovalAction.APPROVE,
      allowedFrom: APPROVABLE_STATUSES,
      nextStatus: 'Approved',
      notification: {
        type: AppraisalNotificationType.REVIEW_APPROVED,
        title: 'Appraisal approved',
      },
      message: 'Review approved.',
    });
  }

  /**
   * Rejects a submitted review.
   *
   * The review stays locked. Rejected is a terminal state, not a return to the
   * reviewer — HR reopens it separately if the reviewer is meant to redo it, and
   * that produces its own REOPEN row. Collapsing reject into reopen would lose
   * the distinction between "these numbers are wrong, fix them" and "these
   * numbers are rejected and stand rejected".
   */
  async reject(
    reviewId: string,
    dto: WorkflowActionDto,
    actorId: string,
  ): Promise<WorkflowResultDto> {
    if (!dto.comment?.trim()) {
      throw new BadRequestException(
        'A reason is required when rejecting a review — the reviewer sees it.',
      );
    }

    return this.transition({
      reviewId,
      actorId,
      comment: dto.comment,
      action: ReviewApprovalAction.REJECT,
      allowedFrom: APPROVABLE_STATUSES,
      nextStatus: 'Rejected',
      notification: {
        type: AppraisalNotificationType.REVIEW_REOPENED,
        title: 'Appraisal rejected',
      },
      message: 'Review rejected. The reviewer has been notified.',
    });
  }

  /**
   * Returns a locked review to `Draft` so the reviewer can edit and resubmit.
   *
   * Clears `locked_at`, `submitted_at`, and any prior approval — the review is
   * genuinely unsubmitted again, and leaving `approved_at` set would let an
   * approved-then-reopened review read as still approved while sitting in Draft.
   * The answers are left in place: the reviewer is amending, not starting over,
   * and `submitEvaluation` replaces them wholesale on the next submit.
   */
  async reopen(
    reviewId: string,
    dto: WorkflowActionDto,
    actorId: string,
  ): Promise<WorkflowResultDto> {
    if (!dto.comment?.trim()) {
      throw new BadRequestException(
        'A reason is required when reopening a review — the reviewer sees it.',
      );
    }

    return this.transition({
      reviewId,
      actorId,
      comment: dto.comment,
      action: ReviewApprovalAction.REOPEN,
      allowedFrom: REOPENABLE_STATUSES,
      nextStatus: 'Draft',
      notification: {
        type: AppraisalNotificationType.REVIEW_REOPENED,
        title: 'Appraisal reopened for editing',
      },
      message: 'Review reopened. The reviewer can now edit and resubmit it.',
    });
  }

  /** The full lifecycle trail for one review, oldest first. */
  async getApprovals(reviewId: string): Promise<ReviewApprovalDto[]> {
    const review = await this.reviewRepository.findOne({
      where: { review_id: reviewId },
      relations: { approvals: { actor: true } },
    });
    if (!review) {
      throw new NotFoundException('Performance review not found');
    }

    return this.toApprovalDtos(review.approvals ?? []);
  }

  // ==========================================================================
  // Shared transition
  // ==========================================================================

  private async transition(input: {
    reviewId: string;
    actorId: string;
    comment?: string;
    action: ReviewApprovalAction;
    allowedFrom: string[];
    nextStatus: string;
    notification: { type: AppraisalNotificationType; title: string };
    message: string;
  }): Promise<WorkflowResultDto> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const reviewRepo = manager.getRepository(PerformanceReview);

      const review = await reviewRepo.findOne({
        where: { review_id: input.reviewId },
        relations: {
          reviewer: true,
          reviewee: true,
          appraisalForm: true,
          approvals: { actor: true },
        },
      });
      if (!review) {
        throw new NotFoundException('Performance review not found');
      }

      if (!input.allowedFrom.includes(review.status)) {
        throw new ConflictException(
          `Cannot ${input.action.toLowerCase()} a review with status "${
            review.status
          }". Allowed from: ${input.allowedFrom.join(', ')}.`,
        );
      }

      const before = {
        status: review.status,
        locked_at: review.locked_at ?? null,
        approved_at: review.approved_at ?? null,
      };

      const actor = await manager
        .getRepository(User)
        .findOne({ where: { user_id: input.actorId } });
      if (!actor) {
        throw new NotFoundException('Authenticated user not found');
      }

      review.status = input.nextStatus;

      if (input.action === ReviewApprovalAction.APPROVE) {
        review.approvedBy = actor;
        review.approved_at = new Date();
      } else if (input.action === ReviewApprovalAction.REOPEN) {
        review.locked_at = null;
        review.submitted_at = null;
        review.approvedBy = null;
        review.approved_at = null;
      }
      // REJECT changes only the status: the review stays locked and keeps its
      // submitted_at, because it was in fact submitted.

      await reviewRepo.save(review);

      await manager.getRepository(ReviewApproval).save(
        manager.getRepository(ReviewApproval).create({
          review,
          action: input.action,
          actor,
          comment: input.comment?.trim() || null,
        }),
      );

      const revieweeName = this.fullName(review.reviewee);
      const period = review.review_period;

      await manager.getRepository(AppraisalNotification).save(
        manager.getRepository(AppraisalNotification).create({
          recipient: review.reviewer,
          type: input.notification.type,
          title: input.notification.title,
          message: `${input.notification.title}: ${revieweeName} (${period}).${
            input.comment?.trim() ? ` Note: ${input.comment.trim()}` : ''
          }`,
          relatedReview: review,
          // Null on purpose: unlike the shift reminder, these are one per action
          // and every occurrence is a distinct event worth its own row. A dedupe
          // key would silently swallow the second reopen of the same review.
          dedupe_key: null,
        }),
      );

      await this.audit.record({
        actor: { user_id: input.actorId, email: actor.email },
        action: `appraisal.review.${input.action.toLowerCase()}`,
        entityType: 'performance_reviews',
        entityId: review.review_id,
        before,
        after: {
          status: review.status,
          locked_at: review.locked_at ?? null,
          approved_at: review.approved_at ?? null,
          comment: input.comment?.trim() || null,
          reviewee_id: review.reviewee?.user_id ?? null,
          reviewer_id: review.reviewer?.user_id ?? null,
        },
        manager,
      });

      const approvals = await manager.getRepository(ReviewApproval).find({
        where: { review: { review_id: review.review_id } },
        relations: { actor: true },
        order: { created_at: 'ASC' },
      });

      return {
        review,
        approvals,
        reviewerEmail: review.reviewer?.email ?? null,
        reviewerName: this.fullName(review.reviewer),
        revieweeName,
      };
    });

    // Post-commit: see the class doc for why this is not inside the transaction.
    if (outcome.reviewerEmail) {
      await this.mail.enqueue({
        templateKey: 'appraisal_status_changed',
        to: outcome.reviewerEmail,
        toName: outcome.reviewerName,
        relatedUserId: outcome.review.reviewer?.user_id ?? null,
        context: {
          reviewer_name: outcome.reviewerName,
          employee_name: outcome.revieweeName,
          review_period: outcome.review.review_period,
          review_status: outcome.review.status,
          review_action: input.action,
          review_comment: input.comment?.trim() ?? '—',
          form_name: outcome.review.appraisalForm?.form_name ?? '',
        },
      });
    }

    return {
      reviewId: outcome.review.review_id,
      status: outcome.review.status,
      submittedAt: this.toIso(outcome.review.submitted_at),
      lockedAt: this.toIso(outcome.review.locked_at),
      approvedAt: this.toIso(outcome.review.approved_at),
      approvedByName: outcome.review.approvedBy
        ? this.fullName(outcome.review.approvedBy)
        : null,
      approvals: this.toApprovalDtos(outcome.approvals),
      message: input.message,
    };
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private toApprovalDtos(approvals: ReviewApproval[]): ReviewApprovalDto[] {
    return [...approvals]
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )
      .map((approval) => ({
        approvalId: approval.approval_id,
        actorId: approval.actor?.user_id ?? null,
        // The actor FK is SET NULL, so a deleted user leaves the action on the
        // trail without a name rather than removing the row.
        actorName: approval.actor
          ? this.fullName(approval.actor)
          : 'Removed user',
        action: approval.action,
        comment: approval.comment ?? null,
        createdAt: this.toIso(approval.created_at) ?? '',
      }));
  }

  private fullName(user?: User | null): string {
    if (!user) return '';
    return `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim();
  }

  private toIso(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    return value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString();
  }
}
