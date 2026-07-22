import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Attendance } from './attendance.entity';
import { User } from '../users/user.entity';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

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

    return this.attendanceRepository.save(attendance);
  }

  async findAll(): Promise<Attendance[]> {
    return this.attendanceRepository.find({
      relations: ['user'],
      order: {
        attendance_date: 'DESC',
      },
    });
  }

  async findOne(id: string): Promise<Attendance> {
    const attendance = await this.attendanceRepository.findOne({
      where: {
        attendance_id: id,
      },
      relations: ['user'],
    });

    if (!attendance) {
      throw new NotFoundException('Attendance record not found');
    }

    return attendance;
  }

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

    return this.attendanceRepository.save(attendance);
  }

  async remove(id: string) {
    const attendance = await this.findOne(id);

    await this.attendanceRepository.remove(attendance);

    return {
      message: 'Attendance deleted successfully',
    };
  }
}
