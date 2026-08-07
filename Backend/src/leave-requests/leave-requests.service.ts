import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { DataSource, EntityManager, Repository } from 'typeorm';

import { LeaveRequest } from './leave-requests.entity';

import { User } from '../users/user.entity';
import { UserService } from '../users/users.service';

import { LeaveType } from '../leave-types/leave-types.entity';

import {
  CreateLeaveRequestDto,
  LeaveDurationType,
} from './dto/create-leave-request.dto';

import { UpdateLeaveRequestDto } from './dto/update-leave-request.dto';

@Injectable()
export class LeaveRequestsService {
  constructor(
    @InjectRepository(LeaveRequest)
    private readonly leaveRequestRepository: Repository<LeaveRequest>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(LeaveType)
    private readonly leaveTypeRepository: Repository<LeaveType>,

    private readonly userService: UserService,

    private readonly dataSource: DataSource,
  ) {}

  // ==========================================
  // HELPERS
  // ==========================================

  /**
   * Calculate leave days based on duration type.
   */
  /**
   * Calculates leave days according to duration type.
   */
  private calculateLeaveDays(
    durationType: LeaveDurationType,
    startDate: Date,
    endDate: Date,
  ): number {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      throw new BadRequestException('Start date cannot be after end date');
    }

    switch (durationType) {
      case LeaveDurationType.FIRST_HALF:
      case LeaveDurationType.SECOND_HALF: {
        if (start.toDateString() !== end.toDateString()) {
          throw new BadRequestException(
            'Half day leave must have the same start and end date',
          );
        }

        return 0.5;
      }

      case LeaveDurationType.FULL_DAY: {
        if (start.toDateString() !== end.toDateString()) {
          throw new BadRequestException(
            'Full day leave must have the same start and end date',
          );
        }

        return 1;
      }

      case LeaveDurationType.MULTIPLE_DAYS: {
        const difference = end.getTime() - start.getTime();

        const days = Math.floor(difference / (1000 * 60 * 60 * 24)) + 1;

        return days;
      }

      default:
        throw new BadRequestException('Invalid leave duration type');
    }
  }

  /**
   * Validate employee.
   */
  private async validateUser(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: {
        user_id: userId,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Validate leave type.
   */
  private async validateLeaveType(leaveType: string): Promise<void> {
    const exists = await this.leaveTypeRepository.findOne({
      where: {
        name: leaveType,
      },
    });

    if (!exists) {
      throw new NotFoundException('Leave type not found');
    }
  }

  /**
   * Validate available balance.
   */
  private async validateBalance(
    userId: string,
    leaveType: string,
    days: number,
  ) {
    const balance = await this.userService.findLeaveBalance(userId, leaveType);

    const remaining = balance.allocated_days - balance.used_days;

    if (days > remaining) {
      throw new BadRequestException('Insufficient leave balance');
    }
  }

  /**
   * Deduct balance after approval.
   */
  private async deductBalance(manager: EntityManager, request: LeaveRequest) {
    await this.userService.consumeLeaveBalance(
      manager,
      request.user.user_id,
      request.leave_type,
      request.days_count,
    );
  }

  /**
   * Restore balance after cancellation/rejection.
   */
  private async restoreBalance(manager: EntityManager, request: LeaveRequest) {
    await this.userService.restoreLeaveBalance(
      manager,
      request.user.user_id,
      request.leave_type,
      request.days_count,
    );
  }

  // ==========================================
  // CREATE
  // ==========================================

  async create(
    createLeaveRequestDto: CreateLeaveRequestDto,
  ): Promise<LeaveRequest> {
    return this.dataSource.transaction(async (manager) => {
      const user = await this.validateUser(createLeaveRequestDto.user_id);

      await this.validateLeaveType(createLeaveRequestDto.leave_type);

      const duration =
        createLeaveRequestDto.duration_type ?? LeaveDurationType.FULL_DAY;

      const days = this.calculateLeaveDays(
        duration,
        createLeaveRequestDto.start_date,
        createLeaveRequestDto.end_date,
      );

      const leaveRequest = manager.getRepository(LeaveRequest).create({
        leave_type: createLeaveRequestDto.leave_type,

        duration_type: createLeaveRequestDto.duration_type,

        start_date: createLeaveRequestDto.start_date,

        end_date: createLeaveRequestDto.end_date,

        days_count: days,

        reason: createLeaveRequestDto.reason,

        // Every newly created leave starts as Pending
        status: 'Pending',

        user,

        // Do NOT set approved_by here
        // Do NOT set approved_date here
      });

      return manager.getRepository(LeaveRequest).save(leaveRequest);
    });
  }

  // ==========================================
  // READ
  // ==========================================

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

  // ==========================================
  // UPDATE
  // ==========================================

  async update(
    id: string,
    updateLeaveRequestDto: UpdateLeaveRequestDto,
  ): Promise<LeaveRequest> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LeaveRequest);

      const leaveRequest = await repository.findOne({
        where: {
          leave_id: id,
        },

        relations: ['user'],
      });

      if (!leaveRequest) {
        throw new NotFoundException('Leave request not found');
      }

      const previousStatus = leaveRequest.status;

      const previousDays = leaveRequest.days_count;

      const previousLeaveType = leaveRequest.leave_type;

      const previousUser = leaveRequest.user.user_id;

      if (
        updateLeaveRequestDto.user_id &&
        updateLeaveRequestDto.user_id !== previousUser
      ) {
        leaveRequest.user = await this.validateUser(
          updateLeaveRequestDto.user_id,
        );
      }

      if (
        updateLeaveRequestDto.duration_type ||
        updateLeaveRequestDto.start_date ||
        updateLeaveRequestDto.end_date
      ) {
        const duration =
          updateLeaveRequestDto.duration_type ??
          leaveRequest.duration_type ??
          LeaveDurationType.FULL_DAY;

        const start =
          updateLeaveRequestDto.start_date ?? leaveRequest.start_date;

        const end = updateLeaveRequestDto.end_date ?? leaveRequest.end_date;

        leaveRequest.days_count = this.calculateLeaveDays(duration, start, end);
      }

      Object.assign(leaveRequest, {
        leave_type: updateLeaveRequestDto.leave_type ?? leaveRequest.leave_type,

        duration_type:
          updateLeaveRequestDto.duration_type ?? leaveRequest.duration_type,

        start_date: updateLeaveRequestDto.start_date ?? leaveRequest.start_date,

        end_date: updateLeaveRequestDto.end_date ?? leaveRequest.end_date,

        reason: updateLeaveRequestDto.reason ?? leaveRequest.reason,

        status: updateLeaveRequestDto.status ?? leaveRequest.status,
      });

      // Pending -> Approved
      if (previousStatus !== 'Approved' && leaveRequest.status === 'Approved') {
        await this.validateBalance(
          leaveRequest.user.user_id,
          leaveRequest.leave_type,
          leaveRequest.days_count,
        );

        await this.deductBalance(manager, leaveRequest);

        leaveRequest.approved_date = new Date();

        // Temporary until authentication is implemented.
        // Later replace this with:
        // leaveRequest.approved_by = loggedInUser;
        if (updateLeaveRequestDto.approved_by_id) {
          leaveRequest.approved_by = await this.validateUser(
            updateLeaveRequestDto.approved_by_id,
          );
        }
      }

      // Approved -> Cancelled/Rejected

      if (
        previousStatus === 'Approved' &&
        (leaveRequest.status === 'Rejected' ||
          leaveRequest.status === 'Cancelled')
      ) {
        await this.restoreBalance(
          manager,

          {
            ...leaveRequest,

            days_count: previousDays,

            leave_type: previousLeaveType,

            user: {
              user_id: previousUser,
            } as User,
          } as LeaveRequest,
        );
      }

      return repository.save(leaveRequest);
    });
  }

  // ==========================================
  // DELETE
  // ==========================================

  async remove(id: string) {
    const result = await this.leaveRequestRepository.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException('Leave request not found');
    }

    return {
      message: 'Leave request deleted successfully',
    };
  }
}
