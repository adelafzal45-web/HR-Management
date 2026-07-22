import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { LeaveRequest } from './leave-requests.entity';
import { User } from '../users/user.entity';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { UpdateLeaveRequestDto } from './dto/update-leave-request.dto';

@Injectable()
export class LeaveRequestsService {
  constructor(
    @InjectRepository(LeaveRequest)
    private readonly leaveRequestRepository: Repository<LeaveRequest>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(
    createLeaveRequestDto: CreateLeaveRequestDto,
  ): Promise<LeaveRequest> {
    const user = await this.userRepository.findOne({
      where: {
        user_id: createLeaveRequestDto.user_id,
      },
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

    const leaveRequest = this.leaveRequestRepository.create({
      leave_type: createLeaveRequestDto.leave_type,
      start_date: createLeaveRequestDto.start_date,
      end_date: createLeaveRequestDto.end_date,
      reason: createLeaveRequestDto.reason,
      status: createLeaveRequestDto.status ?? 'Pending',
      user,
      approved_by: approvedBy ?? undefined,
      approved_date: approvedBy ? new Date() : undefined,
    });

    return this.leaveRequestRepository.save(leaveRequest);
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
  ): Promise<LeaveRequest> {
    const leaveRequest = await this.findOne(id);

    if (updateLeaveRequestDto.user_id) {
      const user = await this.userRepository.findOne({
        where: {
          user_id: updateLeaveRequestDto.user_id,
        },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      leaveRequest.user = user;
    }

    if (updateLeaveRequestDto.approved_by_id) {
      const approvedBy = await this.userRepository.findOne({
        where: {
          user_id: updateLeaveRequestDto.approved_by_id,
        },
      });

      if (!approvedBy) {
        throw new NotFoundException('Approver not found');
      }

      leaveRequest.approved_by = approvedBy;
      leaveRequest.approved_date = new Date();
    }

    Object.assign(leaveRequest, {
      leave_type: updateLeaveRequestDto.leave_type ?? leaveRequest.leave_type,

      start_date: updateLeaveRequestDto.start_date ?? leaveRequest.start_date,

      end_date: updateLeaveRequestDto.end_date ?? leaveRequest.end_date,

      reason: updateLeaveRequestDto.reason ?? leaveRequest.reason,

      status: updateLeaveRequestDto.status ?? leaveRequest.status,
    });

    return this.leaveRequestRepository.save(leaveRequest);
  }

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
