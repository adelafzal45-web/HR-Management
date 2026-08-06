import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Designation } from './designation.entity';
import { Department } from '../department/department.entity';
import { User } from '../users/user.entity';

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

    /*
     * `users.designation_id` is ON DELETE NO ACTION (secondLast-Schema), so
     * deleting a designation somebody still holds raised a raw foreign-key
     * violation — a 500 with a Postgres constraint name in it rather than
     * anything the Designations screen could explain.
     *
     * appraisal_forms.designation_id is ON DELETE SET NULL and the assignment
     * and working-day tables CASCADE, so users are the only blocker.
     */
    const assigned = await this.designationRepository.manager.count(User, {
      where: { designation: { designation_id: id } },
    });

    if (assigned > 0) {
      throw new ConflictException(
        `This designation is still assigned to ${assigned} employee${
          assigned === 1 ? '' : 's'
        }. Move them to another designation before deleting it.`,
      );
    }

    await this.designationRepository.remove(designation);

    return {
      designation_id: id,
      message: 'Designation deleted successfully',
    };
  }

  /*
   * Backs the delete dialog, so the screen can name the blocker up front rather
   * than letting the user find it out from a 409.
   */
  async getDeleteImpact(id: string) {
    const designation = await this.findOne(id);

    const employeeCount = await this.designationRepository.manager.count(User, {
      where: { designation: { designation_id: id } },
    });

    return {
      designation_id: id,
      title: designation.title,
      department_id: designation.department?.department_id ?? null,
      department_name: designation.department?.department_name ?? null,
      employee_count: employeeCount,
      deletable: employeeCount === 0,
    };
  }

  /*
   * Move the holders to `targetId`, then delete. One transaction, because
   * `users.designation_id` is ON DELETE NO ACTION: if the delete failed after a
   * partial move, the employees that had already moved would stay moved and the
   * designation would survive.
   *
   * The move also realigns `users.department_id` to the target designation's
   * department. Leaving it alone would manufacture exactly the department /
   * designation mismatch this database already has 32 instances of — a user
   * sitting in Engineering while holding a Finance job title. Nothing else in
   * the database is touched.
   */
  async reassignAndDelete(id: string, targetId: string) {
    if (id === targetId) {
      throw new ConflictException(
        'Pick a different designation to move the employees to.',
      );
    }

    return this.designationRepository.manager.transaction(async (manager) => {
      const [designation, target] = await Promise.all([
        manager.findOne(Designation, { where: { designation_id: id } }),
        manager.findOne(Designation, {
          where: { designation_id: targetId },
          relations: ['department'],
        }),
      ]);

      if (!designation) {
        throw new NotFoundException('Designation not found');
      }

      if (!target) {
        throw new NotFoundException(
          'The designation you chose to move them to no longer exists.',
        );
      }

      const moved = await manager.update(
        User,
        { designation: { designation_id: id } },
        { designation: target, department: target.department },
      );

      await manager.delete(Designation, id);

      return {
        designation_id: id,
        target_designation_id: targetId,
        moved_employees: moved.affected ?? 0,
        message: `Moved to ${target.title} and deleted ${designation.title}.`,
      };
    });
  }
}
