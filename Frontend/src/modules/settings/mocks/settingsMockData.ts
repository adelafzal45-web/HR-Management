// Hardcoded demo data + a tiny in-memory "database" for the Settings /
// Department / Designation / Roles / Permissions modules, mirroring the
// mock-fallback convention used across the app (hrMockData.ts, mockData.ts,
// teamMockData.ts): every mock*Api call resolves like a real async request
// (small artificial delay) and mutates its own module-level array, so CRUD
// screens behave identically whether the NestJS backend is attached or not.

export type EntityStatus = "active" | "inactive";

export type Department = {
 departmentId: string;
 name: string;
 description: string;
 status: EntityStatus;
 createdAt: string;
};

export type Designation = {
 designationId: string;
 name: string;
 departmentId: string;
 departmentName: string;
 description: string;
 status: EntityStatus;
 createdAt: string;
};

export type Permission = {
 permissionId: string;
 name: string;
 module: string;
 description: string;
};

export type Role = {
 roleId: string;
 name: string;
 description: string;
 permissionIds: string[];
 status: EntityStatus;
 createdAt: string;
};

export type JobCategory = {
 jobCategoryId: string;
 name: string;
 description: string;
 status: EntityStatus;
 createdAt: string;
};

export type Shift = {
 shiftId: string;
 name: string;
 startTime: string; // "HH:mm", 24h
 endTime: string; // "HH:mm", 24h
 gracePeriodMinutes: number;
 breakDurationMinutes: number;
 status: EntityStatus;
 createdAt: string;
};

export type CompanyDetails = {
 legalName: string;
 registrationNumber: string;
 industry: string;
 timezone: string;
 currency: string;
};

export type BrandingSettingsRecord = {
 companyName: string;
 logoUrl: string;
 faviconUrl: string;
 email: string;
 phone: string;
 address: string;
 website: string;
};

export type ListParams = { search?: string; page?: number; pageSize?: number };
export type ListResult<T> = { data: T[]; total: number };

const delay = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));
const uuid = () =>
 typeof crypto !== "undefined" && "randomUUID" in crypto
 ? crypto.randomUUID()
 : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

// ---- seed data --------------------------------------------------------

let departments: Department[] = [
 { departmentId: uuid(), name: "Engineering", description: "Product & platform engineering", status: "active", createdAt: "2024-01-10" },
 { departmentId: uuid(), name: "Human Resources", description: "People operations & recruitment", status: "active", createdAt: "2024-01-12" },
 { departmentId: uuid(), name: "Finance", description: "Accounting, payroll & audits", status: "active", createdAt: "2024-02-01" },
 { departmentId: uuid(), name: "Sales", description: "New business & account management", status: "active", createdAt: "2024-02-15" },
 { departmentId: uuid(), name: "Marketing", description: "Brand, growth & communications", status: "inactive", createdAt: "2024-03-01" },
];

let designations: Designation[] = [
 { designationId: uuid(), name: "Software Engineer", departmentId: departments[0].departmentId, departmentName: "Engineering", description: "Builds and maintains product features", status: "active", createdAt: "2024-01-15" },
 { designationId: uuid(), name: "Engineering Manager", departmentId: departments[0].departmentId, departmentName: "Engineering", description: "Leads an engineering team", status: "active", createdAt: "2024-01-18" },
 { designationId: uuid(), name: "HR Executive", departmentId: departments[1].departmentId, departmentName: "Human Resources", description: "Handles onboarding & employee relations", status: "active", createdAt: "2024-01-20" },
 { designationId: uuid(), name: "Financial Analyst", departmentId: departments[2].departmentId, departmentName: "Finance", description: "Budgeting & financial reporting", status: "active", createdAt: "2024-02-05" },
 { designationId: uuid(), name: "Sales Executive", departmentId: departments[3].departmentId, departmentName: "Sales", description: "Manages client accounts", status: "inactive", createdAt: "2024-02-20" },
];

let jobCategories: JobCategory[] = [
 { jobCategoryId: uuid(), name: "Permanent", description: "Full-time, on the permanent headcount", status: "active", createdAt: "2024-01-08" },
 { jobCategoryId: uuid(), name: "Contract", description: "Fixed-term contractual employment", status: "active", createdAt: "2024-01-08" },
 { jobCategoryId: uuid(), name: "Probation", description: "New hires within their probation period", status: "active", createdAt: "2024-01-08" },
 { jobCategoryId: uuid(), name: "Intern", description: "Internship / trainee placements", status: "active", createdAt: "2024-01-08" },
 { jobCategoryId: uuid(), name: "Consultant", description: "Part-time or project-based consultants", status: "inactive", createdAt: "2024-02-11" },
];

let shifts: Shift[] = [
 { shiftId: uuid(), name: "General Shift", startTime: "09:00", endTime: "18:00", gracePeriodMinutes: 15, breakDurationMinutes: 60, status: "active", createdAt: "2024-01-08" },
 { shiftId: uuid(), name: "Morning Shift", startTime: "06:00", endTime: "14:00", gracePeriodMinutes: 10, breakDurationMinutes: 30, status: "active", createdAt: "2024-01-08" },
 { shiftId: uuid(), name: "Evening Shift", startTime: "14:00", endTime: "22:00", gracePeriodMinutes: 10, breakDurationMinutes: 30, status: "active", createdAt: "2024-01-08" },
 { shiftId: uuid(), name: "Night Shift", startTime: "22:00", endTime: "06:00", gracePeriodMinutes: 15, breakDurationMinutes: 45, status: "active", createdAt: "2024-01-08" },
];

let permissions: Permission[] = [
 { permissionId: uuid(), name: "users.view", module: "Users", description: "View user profiles" },
 { permissionId: uuid(), name: "users.manage", module: "Users", description: "Create, edit & deactivate users" },
 { permissionId: uuid(), name: "departments.manage", module: "Departments", description: "Full CRUD on departments" },
 { permissionId: uuid(), name: "designations.manage", module: "Designations", description: "Full CRUD on designations" },
 { permissionId: uuid(), name: "roles.manage", module: "Roles", description: "Create roles & assign permissions" },
 { permissionId: uuid(), name: "attendance.view", module: "Attendance", description: "View attendance records" },
 { permissionId: uuid(), name: "attendance.manage", module: "Attendance", description: "Edit attendance records" },
 { permissionId: uuid(), name: "leave.approve", module: "Leave", description: "Approve or reject leave requests" },
 { permissionId: uuid(), name: "payroll.manage", module: "Payroll", description: "Generate & edit payroll" },
 { permissionId: uuid(), name: "settings.manage", module: "Settings", description: "Edit company settings & branding" },
];

let roles: Role[] = [
 {
 roleId: uuid(),
 name: "Administrator",
 description: "Full access to every module",
 permissionIds: permissions.map((p) => p.permissionId),
 status: "active",
 createdAt: "2024-01-05",
 },
 {
 roleId: uuid(),
 name: "HR Manager",
 description: "Manages people, departments & leave",
 permissionIds: permissions
 .filter((p) => ["users.view", "users.manage", "departments.manage", "designations.manage", "leave.approve", "attendance.view"].includes(p.name))
 .map((p) => p.permissionId),
 status: "active",
 createdAt: "2024-01-06",
 },
 {
 roleId: uuid(),
 name: "Team Lead",
 description: "Manages a direct team",
 permissionIds: permissions.filter((p) => ["attendance.view", "leave.approve"].includes(p.name)).map((p) => p.permissionId),
 status: "active",
 createdAt: "2024-01-07",
 },
];

let companyDetails: CompanyDetails = {
 legalName: "TechnoCues Pvt Ltd",
 registrationNumber: "REG-2019-004821",
 industry: "Information Technology",
 timezone: "Asia/Karachi",
 currency: "PKR",
};

let branding: BrandingSettingsRecord = {
 companyName: "TechnoCues",
 logoUrl: "",
 faviconUrl: "",
 email: "hello@technocues.com",
 phone: "+92 300 1234567",
 address: "Lahore, Punjab, Pakistan",
 website: "https://technocues.com",
};

function paginate<T>(rows: T[], params: ListParams): ListResult<T> {
 const page = params.page && params.page > 0 ? params.page : 1;
 const pageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : 10;
 const start = (page - 1) * pageSize;
 return { data: rows.slice(start, start + pageSize), total: rows.length };
}

function matchesSearch(haystack: string[], search?: string) {
 if (!search?.trim()) return true;
 const needle = search.trim().toLowerCase();
 return haystack.some((field) => field.toLowerCase().includes(needle));
}

// ---- Departments --------------------------------------------------------

export const mockDepartmentsApi = {
 async list(params: ListParams = {}): Promise<ListResult<Department>> {
 await delay();
 const filtered = departments.filter((d) => matchesSearch([d.name, d.description], params.search));
 return paginate(filtered, params);
 },
 async create(payload: Pick<Department, "name" | "description" | "status">): Promise<Department> {
 await delay();
 const record: Department = { departmentId: uuid(), createdAt: new Date().toISOString().slice(0, 10), ...payload };
 departments = [record, ...departments];
 return record;
 },
 async update(id: string, payload: Pick<Department, "name" | "description" | "status">): Promise<Department> {
 await delay();
 departments = departments.map((d) => (d.departmentId === id ? { ...d, ...payload } : d));
 const updated = departments.find((d) => d.departmentId === id);
 if (!updated) throw new Error("Department not found");
 return updated;
 },
 async remove(id: string): Promise<{ departmentId: string }> {
 await delay();
 departments = departments.filter((d) => d.departmentId !== id);
 designations = designations.filter((d) => d.departmentId !== id);
 return { departmentId: id };
 },
 listAll: () => departments,
};

// ---- Designations ---------------------------------------------------------

export const mockDesignationsApi = {
 async list(params: ListParams = {}): Promise<ListResult<Designation>> {
 await delay();
 const filtered = designations.filter((d) =>
 matchesSearch([d.name, d.departmentName, d.description], params.search),
 );
 return paginate(filtered, params);
 },
 async create(payload: Pick<Designation, "name" | "departmentId" | "description" | "status">): Promise<Designation> {
 await delay();
 const dept = departments.find((d) => d.departmentId === payload.departmentId);
 const record: Designation = {
 designationId: uuid(),
 createdAt: new Date().toISOString().slice(0, 10),
 departmentName: dept?.name ?? "—",
 ...payload,
 };
 designations = [record, ...designations];
 return record;
 },
 async update(
 id: string,
 payload: Pick<Designation, "name" | "departmentId" | "description" | "status">,
 ): Promise<Designation> {
 await delay();
 const dept = departments.find((d) => d.departmentId === payload.departmentId);
 designations = designations.map((d) =>
 d.designationId === id ? { ...d, ...payload, departmentName: dept?.name ?? d.departmentName } : d,
 );
 const updated = designations.find((d) => d.designationId === id);
 if (!updated) throw new Error("Designation not found");
 return updated;
 },
 async remove(id: string): Promise<{ designationId: string }> {
 await delay();
 designations = designations.filter((d) => d.designationId !== id);
 return { designationId: id };
 },
};

// ---- Job Categories -----------------------------------------------------

export const mockJobCategoriesApi = {
 async list(params: ListParams = {}): Promise<ListResult<JobCategory>> {
 await delay();
 const filtered = jobCategories.filter((c) => matchesSearch([c.name, c.description], params.search));
 return paginate(filtered, params);
 },
 async create(payload: Pick<JobCategory, "name" | "description" | "status">): Promise<JobCategory> {
 await delay();
 const record: JobCategory = { jobCategoryId: uuid(), createdAt: new Date().toISOString().slice(0, 10), ...payload };
 jobCategories = [record, ...jobCategories];
 return record;
 },
 async update(id: string, payload: Pick<JobCategory, "name" | "description" | "status">): Promise<JobCategory> {
 await delay();
 jobCategories = jobCategories.map((c) => (c.jobCategoryId === id ? { ...c, ...payload } : c));
 const updated = jobCategories.find((c) => c.jobCategoryId === id);
 if (!updated) throw new Error("Job category not found");
 return updated;
 },
 async remove(id: string): Promise<{ jobCategoryId: string }> {
 await delay();
 jobCategories = jobCategories.filter((c) => c.jobCategoryId !== id);
 return { jobCategoryId: id };
 },
};

// ---- Shifts ---------------------------------------------------------------

export const mockShiftsApi = {
 async list(params: ListParams = {}): Promise<ListResult<Shift>> {
 await delay();
 const filtered = shifts.filter((s) => matchesSearch([s.name], params.search));
 return paginate(filtered, params);
 },
 async create(payload: Pick<Shift, "name" | "startTime" | "endTime" | "gracePeriodMinutes" | "breakDurationMinutes" | "status">): Promise<Shift> {
 await delay();
 const record: Shift = { shiftId: uuid(), createdAt: new Date().toISOString().slice(0, 10), ...payload };
 shifts = [record, ...shifts];
 return record;
 },
 async update(
 id: string,
 payload: Pick<Shift, "name" | "startTime" | "endTime" | "gracePeriodMinutes" | "breakDurationMinutes" | "status">,
 ): Promise<Shift> {
 await delay();
 shifts = shifts.map((s) => (s.shiftId === id ? { ...s, ...payload } : s));
 const updated = shifts.find((s) => s.shiftId === id);
 if (!updated) throw new Error("Shift not found");
 return updated;
 },
 async remove(id: string): Promise<{ shiftId: string }> {
 await delay();
 shifts = shifts.filter((s) => s.shiftId !== id);
 return { shiftId: id };
 },
};

// ---- Permissions ------------------------------------------------------

export const mockPermissionsApi = {
 async list(params: ListParams = {}): Promise<ListResult<Permission>> {
 await delay();
 const filtered = permissions.filter((p) => matchesSearch([p.name, p.module, p.description], params.search));
 return paginate(filtered, params);
 },
 async listAll(): Promise<Permission[]> {
 await delay(150);
 return permissions;
 },
 async create(payload: Pick<Permission, "name" | "module" | "description">): Promise<Permission> {
 await delay();
 const record: Permission = { permissionId: uuid(), ...payload };
 permissions = [record, ...permissions];
 return record;
 },
 async remove(id: string): Promise<{ permissionId: string }> {
 await delay();
 permissions = permissions.filter((p) => p.permissionId !== id);
 roles = roles.map((r) => ({ ...r, permissionIds: r.permissionIds.filter((pid) => pid !== id) }));
 return { permissionId: id };
 },
};

// ---- Roles (+ role-permission assignment) ------------------------------

export const mockRolesApi = {
 async list(params: ListParams = {}): Promise<ListResult<Role>> {
 await delay();
 const filtered = roles.filter((r) => matchesSearch([r.name, r.description], params.search));
 return paginate(filtered, params);
 },
 async getById(id: string): Promise<Role> {
 await delay(150);
 const role = roles.find((r) => r.roleId === id);
 if (!role) throw new Error("Role not found");
 return role;
 },
 async create(payload: Pick<Role, "name" | "description" | "status" | "permissionIds">): Promise<Role> {
 await delay();
 const record: Role = { roleId: uuid(), createdAt: new Date().toISOString().slice(0, 10), ...payload };
 roles = [record, ...roles];
 return record;
 },
 async update(id: string, payload: Pick<Role, "name" | "description" | "status" | "permissionIds">): Promise<Role> {
 await delay();
 roles = roles.map((r) => (r.roleId === id ? { ...r, ...payload } : r));
 const updated = roles.find((r) => r.roleId === id);
 if (!updated) throw new Error("Role not found");
 return updated;
 },
 async remove(id: string): Promise<{ roleId: string }> {
 await delay();
 roles = roles.filter((r) => r.roleId !== id);
 return { roleId: id };
 },
};

// ---- Company Details ----------------------------------------------------

export const mockCompanyDetailsApi = {
 async get(): Promise<CompanyDetails> {
 await delay(200);
 return companyDetails;
 },
 async update(payload: CompanyDetails): Promise<CompanyDetails> {
 await delay();
 companyDetails = { ...payload };
 return companyDetails;
 },
};

// ---- Branding -------------------------------------------------------------

export const mockBrandingApi = {
 async get(): Promise<BrandingSettingsRecord> {
 await delay(200);
 return branding;
 },
 async update(payload: BrandingSettingsRecord): Promise<BrandingSettingsRecord> {
 await delay();
 branding = { ...payload };
 return branding;
 },
};
