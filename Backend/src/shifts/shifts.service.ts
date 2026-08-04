import { Injectable, NotFoundException } from '@nestjs/common';
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

  // Throws rather than returning null: the controller hands this straight back
  // to the client, so a missing row was surfacing as `200 {}` instead of a 404.
  async findOne(id: string) {
    const shift = await this.shiftRepository.findOne({
      where: {
        shift_id: id,
      },
    });

    if (!shift) {
      throw new NotFoundException(`Shift with id "${id}" not found.`);
    }

    return shift;
  }

  async update(id: string, updateShiftDto: UpdateShiftDto) {
    // findOne first so updating a nonexistent id 404s instead of quietly
    // affecting zero rows and reporting success.
    await this.findOne(id);
    await this.shiftRepository.update(id, updateShiftDto);

    return this.findOne(id);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.shiftRepository.delete(id);

    return {
      message: 'Shift deleted successfully',
    };
  }
}
