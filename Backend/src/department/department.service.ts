import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { Department } from './department.entity';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
  ) {}

  create(createDepartmentDto: CreateDepartmentDto) {
    return this.departmentRepository.save(createDepartmentDto);
  }

  findAll() {
    return this.departmentRepository.find();
  }

  findOne(id: string) {
    return this.departmentRepository.findOne({
      where: {
        department_id: id,
      },
    });
  }

  async delete(id: string) {
    await this.departmentRepository.delete(id);

    return {
      message: 'Department deleted successfully',
    };
  }
}
