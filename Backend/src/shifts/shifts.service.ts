import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { Shift } from './shifts.entity';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';

@Injectable()
export class ShiftsService {
  constructor(
    @InjectRepository(Shift)
    private shiftRepository: Repository<Shift>,
  ) {}

  create(createShiftDto: CreateShiftDto) {
    const shift = this.shiftRepository.create(createShiftDto);
    return this.shiftRepository.save(shift);
  }

  findAll() {
    return this.shiftRepository.find();
  }

  findOne(id: string) {
    return this.shiftRepository.findOne({
      where: {
        shift_id: id,
      },
    });
  }

  async update(id: string, updateShiftDto: UpdateShiftDto) {
    await this.shiftRepository.update(id, updateShiftDto);

    return this.findOne(id);
  }

  async remove(id: string) {
    await this.shiftRepository.delete(id);

    return {
      message: 'Shift deleted successfully',
    };
  }
}
