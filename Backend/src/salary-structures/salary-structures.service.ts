import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  SalaryStructure,
  SalaryStructureComponent,
  SalaryStructureAssignment,
  EmployeeComponentOverride,
} from './salary-structures.entity';
import { SalaryComponent } from '../salary-components/salary-components.entity';
import { CreateSalaryStructureDto } from './dto/create-salary-structure.dto';
import { UpdateSalaryStructureDto } from './dto/update-salary-structure.dto';
import { StructureComponentDto } from './dto/create-salary-structure.dto';
import { CreateStructureAssignmentDto } from './dto/create-assignment.dto';
import { UpdateStructureAssignmentDto } from './dto/update-assignment.dto';
import { CreateEmployeeOverrideDto } from './dto/create-employee-override.dto';
import { UpdateEmployeeOverrideDto } from './dto/update-employee-override.dto';
import { validateFormula } from '../payroll-engine/formula/formula-evaluator';

@Injectable()
export class SalaryStructuresService {
  constructor(
    @InjectRepository(SalaryStructure)
    private readonly structureRepository: Repository<SalaryStructure>,
    @InjectRepository(SalaryStructureComponent)
    private readonly structureComponentRepository: Repository<SalaryStructureComponent>,
    @InjectRepository(SalaryStructureAssignment)
    private readonly assignmentRepository: Repository<SalaryStructureAssignment>,
    @InjectRepository(EmployeeComponentOverride)
    private readonly overrideRepository: Repository<EmployeeComponentOverride>,
    @InjectRepository(SalaryComponent)
    private readonly componentRepository: Repository<SalaryComponent>,
  ) {}

  // ======================================================================
  // Structures
  // ======================================================================

  async create(dto: CreateSalaryStructureDto): Promise<SalaryStructure> {
    const existing = await this.structureRepository.findOne({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(
        `A salary structure named "${dto.name}" already exists.`,
      );
    }

    const structure = this.structureRepository.create({
      name: dto.name,
      description: dto.description,
      is_active: dto.is_active,
    });
    const saved = await this.structureRepository.save(structure);

    if (dto.components?.length) {
      for (const membership of dto.components) {
        await this.addComponent(saved.structure_id, membership);
      }
    }

    return this.findOne(saved.structure_id);
  }

  findAll(): Promise<SalaryStructure[]> {
    return this.structureRepository.find({
      relations: { components: true, assignments: true },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<SalaryStructure> {
    const structure = await this.structureRepository.findOne({
      where: { structure_id: id },
      relations: { components: true, assignments: true },
    });
    if (!structure) {
      throw new NotFoundException(`Salary structure "${id}" not found.`);
    }
    // Present components in their configured order.
    structure.components?.sort((a, b) => a.display_order - b.display_order);
    return structure;
  }

  async update(
    id: string,
    dto: UpdateSalaryStructureDto,
  ): Promise<SalaryStructure> {
    const structure = await this.findOne(id);

    if (dto.name && dto.name !== structure.name) {
      const clash = await this.structureRepository.findOne({
        where: { name: dto.name },
      });
      if (clash) {
        throw new ConflictException(
          `A salary structure named "${dto.name}" already exists.`,
        );
      }
    }

    if (Object.keys(dto).length > 0) {
      await this.structureRepository.update(id, dto);
    }
    return this.findOne(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.findOne(id);
    // Membership rows and assignments are removed by ON DELETE CASCADE.
    await this.structureRepository.delete(id);
    return { message: 'Salary structure deleted successfully' };
  }

  // ======================================================================
  // Structure components (membership + per-structure overrides)
  // ======================================================================

  async addComponent(
    structureId: string,
    dto: StructureComponentDto,
  ): Promise<SalaryStructureComponent> {
    await this.findOne(structureId);
    await this.assertComponentExists(dto.component_id);
    this.assertOverrideFormula(dto.override_formula);

    const duplicate = await this.structureComponentRepository.findOne({
      where: { structure_id: structureId, component_id: dto.component_id },
    });
    if (duplicate) {
      throw new ConflictException(
        'That component is already part of this structure. Edit the existing entry instead.',
      );
    }

    const membership = this.structureComponentRepository.create({
      structure_id: structureId,
      component_id: dto.component_id,
      override_calculation_type: dto.override_calculation_type,
      override_amount: dto.override_amount,
      override_formula: dto.override_formula,
      display_order: dto.display_order ?? 0,
    });
    return this.structureComponentRepository.save(membership);
  }

  async updateComponent(
    structureId: string,
    structureComponentId: string,
    dto: Partial<StructureComponentDto>,
  ): Promise<SalaryStructureComponent> {
    const membership = await this.structureComponentRepository.findOne({
      where: {
        structure_component_id: structureComponentId,
        structure_id: structureId,
      },
    });
    if (!membership) {
      throw new NotFoundException(
        `Component membership "${structureComponentId}" not found on this structure.`,
      );
    }

    if (dto.override_formula !== undefined) {
      this.assertOverrideFormula(dto.override_formula);
    }

    // component_id is the membership's identity; changing it would be an
    // add/remove, not an edit. Only the override fields and order are mutable.
    const changes = {
      override_calculation_type: dto.override_calculation_type,
      override_amount: dto.override_amount,
      override_formula: dto.override_formula,
      display_order: dto.display_order,
    };
    await this.structureComponentRepository.update(
      structureComponentId,
      changes,
    );

    const updated = await this.structureComponentRepository.findOne({
      where: { structure_component_id: structureComponentId },
    });
    return updated!;
  }

  async removeComponent(
    structureId: string,
    structureComponentId: string,
  ): Promise<{ message: string }> {
    const membership = await this.structureComponentRepository.findOne({
      where: {
        structure_component_id: structureComponentId,
        structure_id: structureId,
      },
    });
    if (!membership) {
      throw new NotFoundException(
        `Component membership "${structureComponentId}" not found on this structure.`,
      );
    }
    await this.structureComponentRepository.delete(structureComponentId);
    return { message: 'Component removed from structure' };
  }

  // ======================================================================
  // Assignments
  // ======================================================================

  async createAssignment(
    dto: CreateStructureAssignmentDto,
  ): Promise<SalaryStructureAssignment> {
    await this.findOne(dto.structure_id);
    this.assertEffectiveRange(dto.effective_from, dto.effective_to);

    const assignment = this.assignmentRepository.create({
      structure_id: dto.structure_id,
      scope_type: dto.scope_type,
      // Company scope is org-wide and carries no target id.
      scope_id: dto.scope_type === 'company' ? null : dto.scope_id,
      base_salary: dto.base_salary,
      effective_from: dto.effective_from
        ? new Date(dto.effective_from)
        : undefined,
      effective_to: dto.effective_to ? new Date(dto.effective_to) : undefined,
      is_active: dto.is_active,
    });
    return this.assignmentRepository.save(assignment);
  }

  findAssignments(structureId?: string): Promise<SalaryStructureAssignment[]> {
    return this.assignmentRepository.find({
      where: structureId ? { structure_id: structureId } : {},
      order: { created_at: 'DESC' },
    });
  }

  async updateAssignment(
    id: string,
    dto: UpdateStructureAssignmentDto,
  ): Promise<SalaryStructureAssignment> {
    const assignment = await this.assignmentRepository.findOne({
      where: { assignment_id: id },
    });
    if (!assignment) {
      throw new NotFoundException(`Assignment "${id}" not found.`);
    }

    this.assertEffectiveRange(
      dto.effective_from ??
        (assignment.effective_from
          ? assignment.effective_from.toISOString().slice(0, 10)
          : undefined),
      dto.effective_to ??
        (assignment.effective_to
          ? assignment.effective_to.toISOString().slice(0, 10)
          : undefined),
    );

    const nextScopeType = dto.scope_type ?? assignment.scope_type;
    const changes: Partial<SalaryStructureAssignment> = {
      scope_type: dto.scope_type,
      base_salary: dto.base_salary,
      is_active: dto.is_active,
    };
    if (dto.scope_id !== undefined || dto.scope_type !== undefined) {
      changes.scope_id =
        nextScopeType === 'company'
          ? null
          : (dto.scope_id ?? assignment.scope_id);
    }
    if (dto.effective_from !== undefined) {
      changes.effective_from = new Date(dto.effective_from);
    }
    if (dto.effective_to !== undefined) {
      changes.effective_to = new Date(dto.effective_to);
    }

    await this.assignmentRepository.update(id, changes);
    const updated = await this.assignmentRepository.findOne({
      where: { assignment_id: id },
    });
    return updated!;
  }

  async removeAssignment(id: string): Promise<{ message: string }> {
    const assignment = await this.assignmentRepository.findOne({
      where: { assignment_id: id },
    });
    if (!assignment) {
      throw new NotFoundException(`Assignment "${id}" not found.`);
    }
    await this.assignmentRepository.delete(id);
    return { message: 'Assignment deleted successfully' };
  }

  // ======================================================================
  // Employee component overrides
  // ======================================================================

  async createOverride(
    dto: CreateEmployeeOverrideDto,
  ): Promise<EmployeeComponentOverride> {
    await this.assertComponentExists(dto.component_id);
    this.assertOverrideNonEmpty(dto);
    this.assertOverrideFormula(dto.override_formula);
    this.assertEffectiveRange(dto.effective_from, dto.effective_to);

    const override = this.overrideRepository.create({
      user_id: dto.user_id,
      component_id: dto.component_id,
      override_calculation_type: dto.override_calculation_type,
      override_amount: dto.override_amount,
      override_formula: dto.override_formula,
      effective_from: dto.effective_from
        ? new Date(dto.effective_from)
        : undefined,
      effective_to: dto.effective_to ? new Date(dto.effective_to) : undefined,
    });
    return this.overrideRepository.save(override);
  }

  findOverrides(userId?: string): Promise<EmployeeComponentOverride[]> {
    return this.overrideRepository.find({
      where: userId ? { user_id: userId } : {},
      order: { created_at: 'DESC' },
    });
  }

  async updateOverride(
    id: string,
    dto: UpdateEmployeeOverrideDto,
  ): Promise<EmployeeComponentOverride> {
    const override = await this.overrideRepository.findOne({
      where: { override_id: id },
    });
    if (!override) {
      throw new NotFoundException(`Override "${id}" not found.`);
    }

    if (dto.override_formula !== undefined) {
      this.assertOverrideFormula(dto.override_formula);
    }
    this.assertEffectiveRange(
      dto.effective_from ??
        (override.effective_from
          ? override.effective_from.toISOString().slice(0, 10)
          : undefined),
      dto.effective_to ??
        (override.effective_to
          ? override.effective_to.toISOString().slice(0, 10)
          : undefined),
    );

    const changes: Partial<EmployeeComponentOverride> = {
      override_calculation_type: dto.override_calculation_type,
      override_amount: dto.override_amount,
      override_formula: dto.override_formula,
    };
    if (dto.effective_from !== undefined) {
      changes.effective_from = new Date(dto.effective_from);
    }
    if (dto.effective_to !== undefined) {
      changes.effective_to = new Date(dto.effective_to);
    }

    await this.overrideRepository.update(id, changes);
    const updated = await this.overrideRepository.findOne({
      where: { override_id: id },
    });
    return updated!;
  }

  async removeOverride(id: string): Promise<{ message: string }> {
    const override = await this.overrideRepository.findOne({
      where: { override_id: id },
    });
    if (!override) {
      throw new NotFoundException(`Override "${id}" not found.`);
    }
    await this.overrideRepository.delete(id);
    return { message: 'Override deleted successfully' };
  }

  // ======================================================================
  // Shared validation
  // ======================================================================

  private async assertComponentExists(componentId: string): Promise<void> {
    const component = await this.componentRepository.findOne({
      where: { component_id: componentId },
    });
    if (!component) {
      throw new NotFoundException(
        `Salary component "${componentId}" not found.`,
      );
    }
  }

  private assertOverrideFormula(formula?: string | null): void {
    if (formula && formula.trim() !== '') {
      const error = validateFormula(formula);
      if (error) {
        throw new BadRequestException(`Invalid override formula: ${error}`);
      }
    }
  }

  private assertOverrideNonEmpty(dto: CreateEmployeeOverrideDto): void {
    if (
      dto.override_calculation_type === undefined &&
      dto.override_amount === undefined &&
      (dto.override_formula === undefined || dto.override_formula === '')
    ) {
      throw new BadRequestException(
        'An override must set at least one of calculation type, amount, or formula.',
      );
    }
  }

  private assertEffectiveRange(from?: string, to?: string): void {
    if (from && to && to < from) {
      throw new BadRequestException(
        'effective_to cannot be earlier than effective_from.',
      );
    }
  }
}
