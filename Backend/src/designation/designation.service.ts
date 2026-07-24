import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Designation } from './designation.entity';
import { Department } from '../department/department.entity';

import { CreateDesignationDto } from './dto/create-designation.dto';
import { UpdateDesignationDto } from './dto/update-designation.dto';

@Injectable()
export class DesignationService {
  constructor(
    @InjectRepository(Designation)
    private readonly designationRepository: Repository<Designation>,

    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
  ) {}

  async create(createDesignationDto: CreateDesignationDto) {
    const { title, department_id } = createDesignationDto;

    // Check if department exists
    const department = await this.departmentRepository.findOne({
      where: { department_id },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    // Check if designation already exists
    const existingDesignation = await this.designationRepository.findOne({
      where: { title },
    });

    if (existingDesignation) {
      throw new ConflictException(
        'Designation with this title already exists.',
      );
    }

    const designation = this.designationRepository.create({
      title,
      department,
    });

    return await this.designationRepository.save(designation);
  }

  async findAll() {
    return await this.designationRepository.find({
      relations: ['department'],
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
      relations: ['department'],
    });

    if (!designation) {
      throw new NotFoundException('Designation not found');
    }

    return designation;
  }

  async update(id: string, updateDesignationDto: UpdateDesignationDto) {
    const designation = await this.findOne(id);

    if (updateDesignationDto.title) {
      designation.title = updateDesignationDto.title;
    }

    if (updateDesignationDto.department_id) {
      const department = await this.departmentRepository.findOne({
        where: {
          department_id: updateDesignationDto.department_id,
        },
      });

      if (!department) {
        throw new NotFoundException('Department not found');
      }

      designation.department = department;
    }

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
