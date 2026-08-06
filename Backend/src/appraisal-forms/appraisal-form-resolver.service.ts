import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, Repository } from 'typeorm';

import { AppraisalForms, FormStatus } from './appraisal-forms.entity';
import { AppraisalFormAssignment } from './appraisal-form-assignment.entity';
import { User } from '../users/user.entity';

/**
 * The one answer to "which appraisal form does this employee fill out".
 *
 * It lives here, in the leaf module that owns the assignment table, rather than
 * on `AppraisalFacadeService`, because the callers sit on both sides of a module
 * cycle: the facade and its scheduler resolve the form to generate and score
 * reviews, and `PerformanceReviewService` resolves it to write the auto-zero
 * review behind an absence. `PerformanceReviewModule` cannot import the facade —
 * the facade already imports it — so before this existed the absence path had
 * its own "any published form" lookup, which picked an arbitrary form and wrote
 * reviews against a form the employee was never assigned.
 *
 * A second implementation of this rule is a second thing to get wrong, and the
 * two were already disagreeing.
 */
@Injectable()
export class AppraisalFormResolverService {
  constructor(
    @InjectRepository(AppraisalFormAssignment)
    private readonly assignmentRepository: Repository<AppraisalFormAssignment>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Most specific assignment wins: the employee themselves, then their
   * designation, then their department. Only Published + active forms are
   * considered, and within a tier the newest assignment wins.
   *
   * Returns null when nothing matches — an employee HR has not covered by any
   * assignment simply has no appraisal, and that is a state the callers handle
   * rather than an error.
   *
   * `manager` threads an open transaction through, so a caller mid-transaction
   * reads its own uncommitted assignment rows.
   */
  async resolveFormForEmployee(
    employeeId: string,
    manager?: EntityManager,
  ): Promise<AppraisalForms | null> {
    const repo = manager
      ? manager.getRepository(AppraisalFormAssignment)
      : this.assignmentRepository;
    const userRepo = manager
      ? manager.getRepository(User)
      : this.userRepository;

    const employee = await userRepo.findOne({
      where: { user_id: employeeId },
      relations: { department: true, designation: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const tiers: Array<FindOptionsWhere<AppraisalFormAssignment>> = [
      { user: { user_id: employeeId } },
    ];
    if (employee.designation?.designation_id) {
      tiers.push({
        designation: { designation_id: employee.designation.designation_id },
      });
    }
    if (employee.department?.department_id) {
      tiers.push({
        department: { department_id: employee.department.department_id },
      });
    }

    for (const where of tiers) {
      const match = await repo.findOne({
        where: {
          ...where,
          form: { status: FormStatus.PUBLISHED, is_active: true },
        },
        relations: { form: true },
        order: { created_at: 'DESC' },
      });
      if (match?.form) {
        return match.form;
      }
    }

    return null;
  }
}
