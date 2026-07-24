import { Injectable, NotFoundException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { Payroll } from './payroll.entity';
import { User } from '../users/user.entity';

import { CreatePayrollDto } from './dto/create-payroll.dto';
import { UpdatePayrollDto } from './dto/update-payroll.dto';

@Injectable()
export class PayrollService {
  constructor(
    @InjectRepository(Payroll)
    private payrollRepository: Repository<Payroll>,

    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async create(dto: CreatePayrollDto) {
    const user = await this.userRepository.findOne({
      where: {
        user_id: dto.user_id,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const payroll = this.payrollRepository.create({
      payroll_month: dto.payroll_month,
      basic_salary: dto.basic_salary,
      allowance: dto.allowance,
      bonus: dto.bonus,
      deduction: dto.deduction,
      tax: dto.tax,
      net_salary: dto.net_salary,
      payment_date: dto.payment_date,
      user,
    });

    return this.payrollRepository.save(payroll);
  }

  findAll() {
    return this.payrollRepository.find();
  }

  async findOne(id: string) {
    const payroll = await this.payrollRepository.findOne({
      where: {
        payroll_id: id,
      },
    });

    if (!payroll) {
      throw new NotFoundException('Payroll not found');
    }

    return payroll;
  }

  async update(id: string, dto: UpdatePayrollDto) {
    const payroll = await this.findOne(id);

    if (dto.user_id) {
      const user = await this.userRepository.findOne({
        where: {
          user_id: dto.user_id,
        },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      payroll.user = user;
    }

    Object.assign(payroll, dto);

    return this.payrollRepository.save(payroll);
  }

  async remove(id: string) {
    const payroll = await this.findOne(id);

    return this.payrollRepository.remove(payroll);
  }
}
