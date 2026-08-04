import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { LeaveType } from './leave-types.entity';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';

@Injectable()
export class LeaveTypesService {
  constructor(
    @InjectRepository(LeaveType)
    private leaveTypeRepository: Repository<LeaveType>,
  ) {}

  async create(dto: CreateLeaveTypeDto): Promise<LeaveType> {
    this.assertCarryForwardConsistent(
      dto.carry_forward_allowed ?? false,
      dto.max_carry_forward_days ?? 0,
      dto.max_days_per_year,
    );

    const existing = await this.leaveTypeRepository.findOne({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException(
        `A leave type named "${dto.name}" already exists.`,
      );
    }

    const leaveType = this.leaveTypeRepository.create(dto);
    return this.leaveTypeRepository.save(leaveType);
  }

  findAll(): Promise<LeaveType[]> {
    return this.leaveTypeRepository.find({
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<LeaveType> {
    const leaveType = await this.leaveTypeRepository.findOne({
      where: { leave_type_id: id },
    });

    if (!leaveType) {
      throw new NotFoundException(`Leave type with id "${id}" not found.`);
    }

    return leaveType;
  }

  async update(id: string, dto: UpdateLeaveTypeDto): Promise<LeaveType> {
    const leaveType = await this.findOne(id);

    // Validate the merged result, not just the incoming patch — flipping
    // carry_forward_allowed to false without also zeroing the day count would
    // otherwise slip past and trip the DB CHECK constraint as a 500.
    this.assertCarryForwardConsistent(
      dto.carry_forward_allowed ?? leaveType.carry_forward_allowed,
      dto.max_carry_forward_days ?? leaveType.max_carry_forward_days,
      dto.max_days_per_year ?? leaveType.max_days_per_year,
    );

    if (dto.name && dto.name !== leaveType.name) {
      const clash = await this.leaveTypeRepository.findOne({
        where: { name: dto.name },
      });

      if (clash) {
        throw new ConflictException(
          `A leave type named "${dto.name}" already exists.`,
        );
      }
    }

    if (Object.keys(dto).length === 0) {
      return leaveType;
    }

    await this.leaveTypeRepository.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    // findOne throws 404 when missing, so a delete of an unknown id reports
    // honestly instead of silently succeeding.
    await this.findOne(id);
    await this.leaveTypeRepository.delete(id);

    return { message: 'Leave type deleted successfully' };
  }

  /**
   * Mirrors the CHK_leave_types_carry_forward_consistency constraint so the
   * client gets a 400 with a readable message rather than a driver error, and
   * additionally caps carry-forward at the annual allocation.
   *
   * The cap is not expressible as a column CHECK against another column's value
   * in a way that survives partial updates, so it lives here — and it has to be
   * enforced server-side rather than trusting the form: carrying forward more
   * days than the type grants in a year silently inflates balances.
   */
  private assertCarryForwardConsistent(
    carryForwardAllowed: boolean,
    maxCarryForwardDays: number,
    maxDaysPerYear?: number,
  ): void {
    if (!carryForwardAllowed && maxCarryForwardDays > 0) {
      throw new BadRequestException(
        'max_carry_forward_days must be 0 when carry_forward_allowed is false.',
      );
    }

    if (
      carryForwardAllowed &&
      maxDaysPerYear !== undefined &&
      maxCarryForwardDays > maxDaysPerYear
    ) {
      throw new BadRequestException(
        `max_carry_forward_days (${maxCarryForwardDays}) cannot exceed max_days_per_year (${maxDaysPerYear}).`,
      );
    }
  }
}
