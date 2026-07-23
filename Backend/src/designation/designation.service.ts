import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Designation } from './designation.entity';
import { CreateDesignationDto } from './dto/create-designation.dto';
import { UpdateDesignationDto } from './dto/update-designation.dto';

@Injectable()
export class DesignationService {
  constructor(
    @InjectRepository(Designation)
    private readonly designationRepository: Repository<Designation>,
  ) {}

  async create(createDesignationDto: CreateDesignationDto) {
    const designation = this.designationRepository.create(createDesignationDto);

    return await this.designationRepository.save(designation);
  }

  async findAll() {
    return await this.designationRepository.find({
      order: {
        title: 'ASC',
      },
    });
  }

  async findOne(id: string) {
    const designation = await this.designationRepository.findOne({
      where: {
        designation_id: id,
      },
    });

    if (!designation) {
      throw new NotFoundException('Designation not found');
    }

    return designation;
  }

  async update(id: string, updateDesignationDto: UpdateDesignationDto) {
    const designation = await this.findOne(id);

    Object.assign(designation, updateDesignationDto);

    return await this.designationRepository.save(designation);
  }

  async remove(id: string) {
    const designation = await this.findOne(id);

    await this.designationRepository.remove(designation);

    return {
      message: 'Designation deleted successfully',
    };
  }
}
