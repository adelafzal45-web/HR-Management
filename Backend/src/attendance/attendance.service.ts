import {
  Injectable,
  NotFoundException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Attendance } from './attendance.entity';
import { User } from '../users/user.entity';

import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';

import { PerformanceReviewService } from '../performance-review/performance-review.service';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @Inject(forwardRef(() => PerformanceReviewService))
    private readonly performanceReviewService: PerformanceReviewService,
  ) {}

  // ==========================================
  // CREATE ATTENDANCE
  // ==========================================

  async create(createAttendanceDto: CreateAttendanceDto): Promise<Attendance> {
    const user = await this.userRepository.findOne({
      where: {
        user_id: createAttendanceDto.user_id,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const attendance = this.attendanceRepository.create({
      attendance_date: createAttendanceDto.attendance_date,

      check_in: createAttendanceDto.check_in,

      check_out: createAttendanceDto.check_out,

      working_hours: createAttendanceDto.working_hours,

      attendance_status: createAttendanceDto.attendance_status,

      user,
    });

    const savedAttendance = await this.attendanceRepository.save(attendance);

    // ==========================================
    // AUTO ZERO APPRAISAL LOGIC
    // ==========================================

    if (createAttendanceDto.attendance_status.toUpperCase() === 'ABSENT') {
      await this.performanceReviewService.createAbsentReview(savedAttendance);
    }

    return savedAttendance;
  }

  // ==========================================
  // FIND ALL
  // ==========================================

  async findAll(): Promise<Attendance[]> {
    return this.attendanceRepository.find({
      relations: ['user', 'shift', 'performanceReviews'],

      order: {
        attendance_date: 'DESC',
      },
    });
  }

  // ==========================================
  // FIND ONE
  // ==========================================

  async findOne(id: string): Promise<Attendance> {
    const attendance = await this.attendanceRepository.findOne({
      where: {
        attendance_id: id,
      },

      relations: ['user', 'shift', 'performanceReviews'],
    });

    if (!attendance) {
      throw new NotFoundException('Attendance record not found');
    }

    return attendance;
  }

  // ==========================================
  // UPDATE
  // ==========================================

  async update(
    id: string,
    updateAttendanceDto: UpdateAttendanceDto,
  ): Promise<Attendance> {
    const attendance = await this.findOne(id);

    if (updateAttendanceDto.user_id) {
      const user = await this.userRepository.findOne({
        where: {
          user_id: updateAttendanceDto.user_id,
        },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      attendance.user = user;
    }

    Object.assign(attendance, {
      attendance_date:
        updateAttendanceDto.attendance_date ?? attendance.attendance_date,

      check_in: updateAttendanceDto.check_in ?? attendance.check_in,

      check_out: updateAttendanceDto.check_out ?? attendance.check_out,

      working_hours:
        updateAttendanceDto.working_hours ?? attendance.working_hours,

      attendance_status:
        updateAttendanceDto.attendance_status ?? attendance.attendance_status,
    });

    const updatedAttendance = await this.attendanceRepository.save(attendance);

    if (attendance.attendance_status.toUpperCase() === 'ABSENT') {
      await this.performanceReviewService.createAbsentReview(updatedAttendance);
    }

    return updatedAttendance;
  }

  // ==========================================
  // DELETE
  // ==========================================

  async remove(id: string) {
    const attendance = await this.findOne(id);

    await this.attendanceRepository.remove(attendance);

    return {
      message: 'Attendance deleted successfully',
    };
  }
}
