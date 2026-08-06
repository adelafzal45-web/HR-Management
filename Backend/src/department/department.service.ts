import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { Department } from './department.entity';

import { UpdateDepartmentDto } from './dto/update-department.dto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { User } from '../users/user.entity';
import { Designation } from '../designation/designation.entity';
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
  async update(id: string, updateDepartmentDto: UpdateDepartmentDto) {
    const department = await this.departmentRepository.findOne({
      where: {
        department_id: id,
      },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    Object.assign(department, updateDepartmentDto);

    return this.departmentRepository.save(department);
  }
  async delete(id: string) {
    const department = await this.departmentRepository.findOne({
      where: {
        department_id: id,
      },
    });

    /*
     * `delete` reports 0 affected rows for an id that never existed rather than
     * throwing, so without this the Departments screen took a 200 as proof the
     * row was gone, showed "Department deleted", and reloaded it unchanged.
     */
    if (!department) {
      throw new NotFoundException('Department not found');
    }

    /*
     * Two FKs point here with ON DELETE NO ACTION (secondLast-Schema):
     * `users.department_id` and `designations.department_id`. Deleting a
     * department that either still references raised a raw foreign-key
     * violation — a 500 carrying a Postgres constraint name, which the UI
     * surfaced as an unhelpful generic failure.
     *
     * Both are counted so the message names the actual blocker. The other
     * referants need no cleanup here: appraisal_forms.department_id is
     * ON DELETE SET NULL, and appraisal_form_assignments / team_lead_assignments
     * / working_day_schedules are all ON DELETE CASCADE.
     */
    const [designations, users] = await Promise.all([
      this.departmentRepository.manager.count(Designation, {
        where: { department: { department_id: id } },
      }),
      this.departmentRepository.manager.count(User, {
        where: { department: { department_id: id } },
      }),
    ]);

    if (designations > 0) {
      throw new ConflictException(
        `This department still has ${designations} designation${
          designations === 1 ? '' : 's'
        }. Delete or move them before deleting the department.`,
      );
    }

    if (users > 0) {
      throw new ConflictException(
        `This department still has ${users} employee${
          users === 1 ? '' : 's'
        }. Move them to another department before deleting it.`,
      );
    }

    await this.departmentRepository.delete(id);

    return {
      department_id: id,
      message: 'Department deleted successfully',
    };
  }

  /*
   * Backs the delete dialog. The counts here are the same ones `delete` refuses
   * on, so the screen can name the blockers before the user commits instead of
   * discovering them one 409 at a time.
   *
   * `in_use` is the subset of designations somebody actually holds. It matters
   * because an unused designation can simply be deleted, while one in use drags
   * employees with it — the dialog says "5 designations (4 in use)" for exactly
   * that reason.
   */
  async getDeleteImpact(id: string) {
    const department = await this.departmentRepository.findOne({
      where: { department_id: id },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    const manager = this.departmentRepository.manager;

    const [employeeCount, designations] = await Promise.all([
      manager.count(User, { where: { department: { department_id: id } } }),
      manager.find(Designation, {
        where: { department: { department_id: id } },
        order: { title: 'ASC' },
      }),
    ]);

    const holders = await Promise.all(
      designations.map((d) =>
        manager.count(User, {
          where: { designation: { designation_id: d.designation_id } },
        }),
      ),
    );

    return {
      department_id: id,
      department_name: department.department_name,
      employee_count: employeeCount,
      designation_count: designations.length,
      designations_in_use: holders.filter((count) => count > 0).length,
      designations: designations.map((d, i) => ({
        designation_id: d.designation_id,
        title: d.title,
        employee_count: holders[i],
      })),
      deletable: employeeCount === 0 && designations.length === 0,
    };
  }

  /*
   * Move everything to `targetId`, then delete. One transaction: a half-done
   * move would leave employees in a department that no longer exists, and
   * `users.department_id` is ON DELETE NO ACTION, so the delete would simply
   * fail and strand the rows that had already moved.
   *
   * Both UPDATEs are plain column writes rather than entity saves — loading 40
   * User entities to change one FK would fire subscribers and cascade checks
   * for no benefit.
   */
  async reassignAndDelete(id: string, targetId: string) {
    if (id === targetId) {
      throw new ConflictException(
        'Pick a different department to move the employees and designations to.',
      );
    }

    return this.departmentRepository.manager.transaction(async (manager) => {
      const [department, target] = await Promise.all([
        manager.findOne(Department, { where: { department_id: id } }),
        manager.findOne(Department, { where: { department_id: targetId } }),
      ]);

      if (!department) {
        throw new NotFoundException('Department not found');
      }

      if (!target) {
        throw new NotFoundException(
          'The department you chose to move them to no longer exists.',
        );
      }

      const movedDesignations = await manager.update(
        Designation,
        { department: { department_id: id } },
        { department: target },
      );

      const movedEmployees = await manager.update(
        User,
        { department: { department_id: id } },
        { department: target },
      );

      await manager.delete(Department, id);

      return {
        department_id: id,
        target_department_id: targetId,
        moved_designations: movedDesignations.affected ?? 0,
        moved_employees: movedEmployees.affected ?? 0,
        message: `Moved to ${target.department_name} and deleted ${department.department_name}.`,
      };
    });
  }
}
