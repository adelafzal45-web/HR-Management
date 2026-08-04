// Hardcoded demo data + a tiny in-memory "database" for Employee Management
// (HR / Administrator, org-wide), mirroring the mock-fallback convention
// used across the app (settingsMockData.ts, teamMockData.ts, hrMockData.ts):
// every mock*Api call resolves like a real async request (small artificial
// delay) and mutates its own module-level array, so the CRUD screen behaves
// identically whether the NestJS backend is attached or not.
//
// Seed rows are built lazily from the *existing* Departments/Designations/
// Job Categories/Shifts demo stores (settingsMockData.ts) instead of
// hardcoded IDs, so an employee's department/designation dropdown always
// resolves to a real, editable option in demo mode too.

import {
 mockDepartmentsApi,
 mockDesignationsApi,
 mockJobCategoriesApi,
 mockShiftsApi,
 mockRolesApi,
} from "@/modules/settings/mocks/settingsMockData";

export type Gender = "male" | "female" | "other";
export type EmploymentType = "full_time" | "part_time" | "contract" | "intern";
export type EmployeeStatus = "active" | "inactive";

export type Employee = {
 employeeId: string;
 employeeCode: string;
 firstName: string;
 lastName: string;
 email: string;
 phone: string;
 profileImageUrl: string;
 /** 128px derivative of `profileImageUrl`, for small renderings. */
 profileImageThumbUrl?: string;
 dateOfBirth: string; // YYYY-MM-DD
 gender: Gender;
 address: string;
 joiningDate: string; // YYYY-MM-DD
 employmentType: EmploymentType;
 salary: number;
 overtimeAllowed: boolean;
 roleId: string;
 roleName: string;
 departmentId: string;
 departmentName: string;
 designationId: string;
 designationName: string;
 jobCategoryId: string;
 jobCategoryName: string;
 shiftId: string;
 shiftName: string;
 managerId: string;
 managerName: string;
 status: EmployeeStatus;
 createdAt: string;
};

export type ListParams = {
 search?: string;
 page?: number;
 pageSize?: number;
 departmentId?: string;
 status?: EmployeeStatus | "";
};
export type ListResult<T> = { data: T[]; total: number };

export type EmployeePayload = Omit<
 Employee,
 "employeeId" | "createdAt" | "roleName" | "departmentName" | "designationName" | "jobCategoryName" | "shiftName" | "managerName"
>;

// The backend's `POST /api/users` requires a `password` field that isn't
// part of the persisted Employee record (and is never returned by GET).
// Kept as a separate type so create() can require it without leaking it
// into update()/the rest of the app.
export type EmployeeCreatePayload = EmployeePayload & { password: string };

const delay = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));
const uuid = () =>
 typeof crypto !== "undefined" && "randomUUID" in crypto
 ? crypto.randomUUID()
 : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

let employees: Employee[] = [];
let seeded = false;
let seeding: Promise<void> | null = null;

const SEED_PEOPLE: Array<{
 firstName: string;
 lastName: string;
 gender: Gender;
 dateOfBirth: string;
 joiningDate: string;
 employmentType: EmploymentType;
 salary: number;
 overtimeAllowed: boolean;
 address: string;
 status: EmployeeStatus;
}> = [
 { firstName: "Ayesha", lastName: "Khan", gender: "female", dateOfBirth: "1996-04-12", joiningDate: "2022-03-01", employmentType: "full_time", salary: 185000, overtimeAllowed: true, address: "Gulberg III, Lahore", status: "active" },
 { firstName: "Bilal", lastName: "Ahmed", gender: "male", dateOfBirth: "1994-11-02", joiningDate: "2021-07-15", employmentType: "full_time", salary: 210000, overtimeAllowed: false, address: "DHA Phase 5, Lahore", status: "active" },
 { firstName: "Hassan", lastName: "Raza", gender: "male", dateOfBirth: "1998-01-20", joiningDate: "2023-01-10", employmentType: "full_time", salary: 150000, overtimeAllowed: true, address: "Model Town, Lahore", status: "active" },
 { firstName: "Sara", lastName: "Malik", gender: "female", dateOfBirth: "1995-06-30", joiningDate: "2020-09-01", employmentType: "full_time", salary: 240000, overtimeAllowed: false, address: "Johar Town, Lahore", status: "active" },
 { firstName: "Usman", lastName: "Iqbal", gender: "male", dateOfBirth: "1997-09-14", joiningDate: "2022-11-20", employmentType: "contract", salary: 120000, overtimeAllowed: true, address: "Faisal Town, Lahore", status: "active" },
 { firstName: "Zara", lastName: "Sheikh", gender: "female", dateOfBirth: "1999-02-05", joiningDate: "2023-06-01", employmentType: "intern", salary: 45000, overtimeAllowed: false, address: "Cantt, Lahore", status: "active" },
 { firstName: "Fatima", lastName: "Siddiqui", gender: "female", dateOfBirth: "1993-12-18", joiningDate: "2019-04-12", employmentType: "full_time", salary: 265000, overtimeAllowed: false, address: "Bahria Town, Lahore", status: "inactive" },
 { firstName: "Omar", lastName: "Farooq", gender: "male", dateOfBirth: "1996-08-08", joiningDate: "2021-02-01", employmentType: "full_time", salary: 175000, overtimeAllowed: true, address: "Wapda Town, Lahore", status: "active" },
 { firstName: "Mariam", lastName: "Yousaf", gender: "female", dateOfBirth: "2000-03-25", joiningDate: "2024-01-15", employmentType: "part_time", salary: 90000, overtimeAllowed: false, address: "Township, Lahore", status: "active" },
 { firstName: "Ali", lastName: "Hamza", gender: "male", dateOfBirth: "1992-05-11", joiningDate: "2018-10-01", employmentType: "full_time", salary: 300000, overtimeAllowed: false, address: "Askari X, Lahore", status: "active" },
];

async function ensureSeeded(): Promise<void> {
 if (seeded) return;
 if (seeding) return seeding;

 seeding = (async () => {
 const [deptRes, desigRes, jcRes, shiftRes, roleRes] = await Promise.all([
 mockDepartmentsApi.list({ pageSize: 100 }),
 mockDesignationsApi.list({ pageSize: 100 }),
 mockJobCategoriesApi.list({ pageSize: 100 }),
 mockShiftsApi.list({ pageSize: 100 }),
 mockRolesApi.list({ pageSize: 100 }),
 ]);
 const depts = deptRes.data;
 const jcs = jcRes.data;
 const shiftsList = shiftRes.data;
 const rolesList = roleRes.data;

 employees = SEED_PEOPLE.map((person, i) => {
 const dept = depts[i % depts.length];
 const deptDesignations = desigRes.data.filter((d) => d.departmentId === dept.departmentId);
 const desig = deptDesignations[0] ?? desigRes.data[i % desigRes.data.length];
 const jc = jcs[i % jcs.length];
 const shift = shiftsList[i % shiftsList.length];
 const role = rolesList[i % rolesList.length];
 const firstInitial = person.firstName[0].toLowerCase();

 return {
 employeeId: uuid(),
 employeeCode: `EMP-${1001 + i}`,
 firstName: person.firstName,
 lastName: person.lastName,
 email: `${firstInitial}${person.lastName.toLowerCase()}@technocues.com`,
 phone: `+92 3${String(10 + i).padStart(2, "0")} ${1000000 + i * 137}`,
 profileImageUrl: "",
 dateOfBirth: person.dateOfBirth,
 gender: person.gender,
 address: person.address,
 joiningDate: person.joiningDate,
 employmentType: person.employmentType,
 salary: person.salary,
 overtimeAllowed: person.overtimeAllowed,
 roleId: role?.roleId ?? "",
 roleName: role?.name ?? "—",
 departmentId: dept?.departmentId ?? "",
 departmentName: dept?.name ?? "—",
 designationId: desig?.designationId ?? "",
 designationName: desig?.name ?? "—",
 jobCategoryId: jc?.jobCategoryId ?? "",
 jobCategoryName: jc?.name ?? "—",
 shiftId: shift?.shiftId ?? "",
 shiftName: shift?.name ?? "—",
 managerId: "",
 managerName: "—",
 status: person.status,
 createdAt: person.joiningDate,
 } satisfies Employee;
 });

 // Wire up reporting lines after the fact so `managerId` can reference
 // another seeded employee's id: everyone reports to the most senior
 // (earliest joiningDate) person in their own department, unless they
 // *are* that person, in which case they report to the most senior
 // person company-wide.
 const bySeniority = [...employees].sort((a, b) => a.joiningDate.localeCompare(b.joiningDate));
 const seniorOverall = bySeniority[0];
 employees = employees.map((emp) => {
 const seniorInDept = bySeniority.find((e) => e.departmentId === emp.departmentId && e.employeeId !== emp.employeeId);
 const manager = seniorInDept ?? (seniorOverall.employeeId !== emp.employeeId ? seniorOverall : undefined);
 return manager
 ? { ...emp, managerId: manager.employeeId, managerName: `${manager.firstName} ${manager.lastName}` }
 : emp;
 });

 seeded = true;
 })();

 return seeding;
}

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

async function resolveNames(payload: EmployeePayload) {
 const [deptRes, desigRes, jcRes, shiftRes, roleRes] = await Promise.all([
 mockDepartmentsApi.list({ pageSize: 100 }),
 mockDesignationsApi.list({ pageSize: 100 }),
 mockJobCategoriesApi.list({ pageSize: 100 }),
 mockShiftsApi.list({ pageSize: 100 }),
 mockRolesApi.list({ pageSize: 100 }),
 ]);
 const manager = payload.managerId ? employees.find((e) => e.employeeId === payload.managerId) : undefined;

 return {
 roleName: roleRes.data.find((r) => r.roleId === payload.roleId)?.name ?? "—",
 departmentName: deptRes.data.find((d) => d.departmentId === payload.departmentId)?.name ?? "—",
 designationName: desigRes.data.find((d) => d.designationId === payload.designationId)?.name ?? "—",
 jobCategoryName: jcRes.data.find((c) => c.jobCategoryId === payload.jobCategoryId)?.name ?? "—",
 shiftName: shiftRes.data.find((s) => s.shiftId === payload.shiftId)?.name ?? "—",
 managerName: manager ? `${manager.firstName} ${manager.lastName}` : "—",
 };
}

export const mockEmployeesApi = {
 async list(params: ListParams = {}): Promise<ListResult<Employee>> {
 await ensureSeeded();
 await delay();
 let filtered = employees.filter((e) =>
 matchesSearch([e.firstName, e.lastName, e.employeeCode, e.email, e.phone, e.departmentName, e.designationName], params.search),
 );
 if (params.departmentId) filtered = filtered.filter((e) => e.departmentId === params.departmentId);
 if (params.status) filtered = filtered.filter((e) => e.status === params.status);
 return paginate(filtered, params);
 },

 async getById(id: string): Promise<Employee> {
 await ensureSeeded();
 await delay(150);
 const found = employees.find((e) => e.employeeId === id);
 if (!found) throw new Error("Employee not found");
 return found;
 },

 async create(payload: EmployeeCreatePayload): Promise<Employee> {
 await ensureSeeded();
 await delay();
 if (employees.some((e) => e.email.toLowerCase() === payload.email.toLowerCase())) {
 throw new Error("An employee with this email already exists.");
 }
 // `password` is accepted (the backend requires it on POST /api/users)
 // but is never part of the stored/returned Employee record.
 const { password: _password, ...rest } = payload;
 const names = await resolveNames(rest);
 const record: Employee = {
 employeeId: uuid(),
 createdAt: new Date().toISOString().slice(0, 10),
 ...rest,
 ...names,
 };
 employees = [record, ...employees];
 return record;
 },

 async update(id: string, payload: EmployeePayload): Promise<Employee> {
 await ensureSeeded();
 await delay();
 if (employees.some((e) => e.employeeId !== id && e.email.toLowerCase() === payload.email.toLowerCase())) {
 throw new Error("An employee with this email already exists.");
 }
 const names = await resolveNames(payload);
 employees = employees.map((e) => (e.employeeId === id ? { ...e, ...payload, ...names } : e));
 const updated = employees.find((e) => e.employeeId === id);
 if (!updated) throw new Error("Employee not found");
 return updated;
 },

 async setStatus(id: string, status: EmployeeStatus): Promise<Employee> {
 await ensureSeeded();
 await delay(250);
 employees = employees.map((e) => (e.employeeId === id ? { ...e, status } : e));
 const updated = employees.find((e) => e.employeeId === id);
 if (!updated) throw new Error("Employee not found");
 return updated;
 },

 async remove(id: string): Promise<{ employeeId: string }> {
 await ensureSeeded();
 await delay();
 employees = employees.filter((e) => e.employeeId !== id);
 return { employeeId: id };
 },
};
