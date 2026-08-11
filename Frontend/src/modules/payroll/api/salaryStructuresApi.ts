// Salary structures (spec §3) plus the two things that attach them to people:
// scope-priority assignments (spec §12/§13) and per-employee component
// overrides (spec §12, narrowest scope). Grouped here because the builder screen
// drives all three together.
//
// Real backend or throw — no demo fallback (see payrollSettingsApi.ts). Bodies
// are snake_case to match CreateSalaryStructureDto / CreateAssignmentDto /
// CreateEmployeeOverrideDto.

import { api, ENDPOINTS } from "@/lib/apiClient";
import type {
  CalculationType,
  SalaryComponent,
} from "./salaryComponentsApi";

export const SCOPE_TYPES = [
  "company",
  "job_category",
  "department",
  "designation",
  "employee",
] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

/** A component's membership in a structure, with optional per-structure overrides. */
export type StructureComponent = {
  structure_component_id: string;
  structure_id: string;
  component_id: string;
  component: SalaryComponent;
  override_calculation_type: CalculationType | null;
  override_amount: number | null;
  override_formula: string | null;
  display_order: number;
};

export type SalaryStructure = {
  structure_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  components: StructureComponent[];
  created_at: string;
  updated_at: string;
};

export type StructureComponentPayload = {
  component_id: string;
  override_calculation_type?: CalculationType;
  override_amount?: number;
  override_formula?: string;
  display_order?: number;
};

export type SalaryStructurePayload = {
  name: string;
  description?: string;
  is_active?: boolean;
  components?: StructureComponentPayload[];
};

export type StructureAssignment = {
  assignment_id: string;
  structure_id: string;
  structure?: SalaryStructure;
  scope_type: ScopeType;
  scope_id: string | null;
  base_salary: number | null;
  effective_from: string | null;
  effective_to: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AssignmentPayload = {
  structure_id: string;
  scope_type: ScopeType;
  /** Required for every scope except "company". */
  scope_id?: string;
  base_salary?: number;
  effective_from?: string;
  effective_to?: string;
  is_active?: boolean;
};

export type EmployeeOverride = {
  override_id: string;
  user_id: string;
  component_id: string;
  component: SalaryComponent;
  override_calculation_type: CalculationType | null;
  override_amount: number | null;
  override_formula: string | null;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeeOverridePayload = {
  user_id: string;
  component_id: string;
  override_calculation_type?: CalculationType;
  override_amount?: number;
  override_formula?: string;
  effective_from?: string;
  effective_to?: string;
};

const { structures, assignments, overrides } = ENDPOINTS.payrollEngine;

export const salaryStructuresApi = {
  // ---- Structures ---------------------------------------------------------
  list: (): Promise<SalaryStructure[]> =>
    api.get<SalaryStructure[]>(structures.base),

  getById: (id: string): Promise<SalaryStructure> =>
    api.get<SalaryStructure>(structures.byId(id)),

  create: (payload: SalaryStructurePayload): Promise<SalaryStructure> =>
    api.post<SalaryStructure>(structures.base, payload),

  update: (
    id: string,
    payload: Partial<SalaryStructurePayload>,
  ): Promise<SalaryStructure> =>
    api.patch<SalaryStructure>(structures.byId(id), payload),

  remove: (id: string): Promise<{ message: string }> =>
    api.delete<{ message: string }>(structures.byId(id)),

  // ---- Nested components --------------------------------------------------
  addComponent: (
    structureId: string,
    payload: StructureComponentPayload,
  ): Promise<StructureComponent> =>
    api.post<StructureComponent>(structures.components(structureId), payload),

  updateComponent: (
    structureId: string,
    structureComponentId: string,
    payload: Partial<StructureComponentPayload>,
  ): Promise<StructureComponent> =>
    api.patch<StructureComponent>(
      structures.component(structureId, structureComponentId),
      payload,
    ),

  removeComponent: (
    structureId: string,
    structureComponentId: string,
  ): Promise<{ message: string }> =>
    api.delete<{ message: string }>(
      structures.component(structureId, structureComponentId),
    ),

  // ---- Assignments (scope + effective window) -----------------------------
  listAssignments: (structureId?: string): Promise<StructureAssignment[]> => {
    const query = structureId
      ? `?structureId=${encodeURIComponent(structureId)}`
      : "";
    return api.get<StructureAssignment[]>(`${assignments.base}${query}`);
  },

  createAssignment: (payload: AssignmentPayload): Promise<StructureAssignment> =>
    api.post<StructureAssignment>(assignments.base, payload),

  updateAssignment: (
    id: string,
    payload: Partial<AssignmentPayload>,
  ): Promise<StructureAssignment> =>
    api.patch<StructureAssignment>(assignments.byId(id), payload),

  removeAssignment: (id: string): Promise<{ message: string }> =>
    api.delete<{ message: string }>(assignments.byId(id)),

  // ---- Per-employee overrides ---------------------------------------------
  listOverrides: (userId?: string): Promise<EmployeeOverride[]> => {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    return api.get<EmployeeOverride[]>(`${overrides.base}${query}`);
  },

  createOverride: (payload: EmployeeOverridePayload): Promise<EmployeeOverride> =>
    api.post<EmployeeOverride>(overrides.base, payload),

  updateOverride: (
    id: string,
    payload: Partial<EmployeeOverridePayload>,
  ): Promise<EmployeeOverride> =>
    api.patch<EmployeeOverride>(overrides.byId(id), payload),

  removeOverride: (id: string): Promise<{ message: string }> =>
    api.delete<{ message: string }>(overrides.byId(id)),
};
