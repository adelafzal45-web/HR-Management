import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import * as bcrypt from 'bcryptjs';

import { User } from './user.entity';
import { UserLeaveBalance } from './user-leave-balance.entity';
import { Role } from '../roles/roles.entity';
import { LeaveType } from '../leave-types/leave-types.entity';

import { CreateUserDto, LeaveAssignmentDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { EmployeeQueryDto } from './dto/employee-query.dto';
import { UpdateAccountSettingsDto } from './dto/update-account-settings.dto';
import { AssignLeaveTypesDto } from './dto/assign-leave-types.dto';
import {
  ChangeOwnPasswordDto,
  ResetPasswordDto,
} from './dto/reset-password.dto';
import {
  SELF_EDITABLE_FIELDS,
  UpdateOwnProfileDto,
} from './dto/update-own-profile.dto';
import {
  paginatedResult,
  type PaginatedResult,
} from '../common/dto/pagination-query.dto';
import { AuditService, type AuditActor } from '../audit/audit.service';
import { PasswordPolicyService } from '../auth/password-policy.service';
import { MailService } from '../mail/mail.service';
import { APP_BASE_URL } from '../mail/template-renderer.service';
import {
  deletePhoto,
  savePhoto,
  saveThumbnail,
  validateImageUpload,
  type UploadedFile,
} from '../common/upload/image-upload';

/** Cost factor for bcrypt. 12 is the current sensible default for a web app. */
const BCRYPT_ROUNDS = 12;

/** Employee code format: TC-EMP-001. */
const EMPLOYEE_CODE_PREFIX = 'TC-EMP-';
const EMPLOYEE_CODE_PAD = 3;

/**
 * Advisory-lock key for employee-code generation.
 *
 * An arbitrary but fixed 64-bit integer. `pg_advisory_xact_lock` serialises the
 * read-max-then-insert sequence across connections; see `nextEmployeeCode`.
 */
const EMPLOYEE_CODE_LOCK_KEY = 8123471256341;

/** Role name that marks a user as a Team Lead. Seeded by SeedThreeRoleRbac. */
const TEAM_LEAD_ROLE_NAME = 'Team Lead';

/**
 * Columns never sent to a client. `password` is the critical one — it was
 * previously returned by every users endpoint.
 */
const SENSITIVE_FIELDS = ['password'] as const;

/** Relations loaded for a single employee record. */
const DETAIL_RELATIONS = [
  'role',
  'department',
  'designation',
  'shift',
  'jobCategory',
  'teamLead',
  'leaveBalances',
] as const;

/** Maps API sort keys to qualified columns. Keys are whitelisted by the DTO. */
const SORT_COLUMN_MAP: Record<string, string> = {
  employee_code: 'user.employee_code',
  first_name: 'user.first_name',
  last_name: 'user.last_name',
  email: 'user.email',
  joining_date: 'user.joining_date',
  created_at: 'user.created_at',
  status: 'user.status',
  salary: 'user.salary',
};

export type SafeUser = Omit<User, 'password'>;

/**
 * Columns that change on save but are not a "change to your profile".
 *
 * `updated_at` is the reason this set exists: TypeORM touches it on every save,
 * so it appears in the diff for *any* edit. Without this filter, changing only
 * the email address also sends a "your profile was updated" notice listing
 * `updated_at` — two emails for one edit, the second one meaningless.
 *
 * `password` is here because password changes have their own notification with
 * its own wording; naming the field in a generic profile notice would be both
 * duplicate and alarming. It is never rendered in any case — the audit layer
 * redacts it — but relying on that would make this correct by accident.
 */
const NON_NOTIFIABLE_FIELDS = new Set([
  'updated_at',
  'created_at',
  'password',
  'profile_image',
  'profile_image_thumb',
]);

/** `date_of_birth` -> `Date of birth`. Column names do not belong in an email. */
function humanizeField(field: string): string {
  const words = field.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserLeaveBalance)
    private readonly leaveBalanceRepository: Repository<UserLeaveBalance>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(LeaveType)
    private readonly leaveTypeRepository: Repository<LeaveType>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly passwordPolicy: PasswordPolicyService,
    private readonly mailService: MailService,
  ) {}

  // ==========================================
  // HELPERS
  // ==========================================

  /**
   * Strips the password hash from an entity before it leaves the service.
   *
   * Applied on every return path rather than relying on `select: false` on the
   * column, because AuthService needs to read the hash to verify a login — a
   * column-level exclusion would break that, and re-enabling it per query is
   * the kind of opt-in that gets forgotten.
   */
  private sanitize(user: User): SafeUser {
    const copy = { ...user } as Record<string, unknown>;
    for (const field of SENSITIVE_FIELDS) {
      delete copy[field];
    }
    return copy as unknown as SafeUser;
  }

  private sanitizeMany(users: User[]): SafeUser[] {
    return users.map((user) => this.sanitize(user));
  }

  private async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
  }

  /**
   * Snapshot used for audit diffs — scalar columns only.
   *
   * Relations are excluded because a loaded relation graph serialises into a
   * huge object whose nested `updated_at` values change constantly, producing
   * diffs that report a change on every save.
   */
  private auditSnapshot(user: User): Record<string, unknown> {
    const snapshot: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(user)) {
      if (value === null || value === undefined) {
        snapshot[key] = null;
        continue;
      }
      if (typeof value === 'object' && !(value instanceof Date)) {
        continue; // relation or collection
      }
      snapshot[key] = value;
    }
    return snapshot;
  }

  /**
   * Generates the next employee code inside the caller's transaction.
   *
   * Correctness note: `MAX(...) + 1` is only safe against concurrent inserts if
   * the read and the write are serialised. Two simultaneous creates would
   * otherwise both read TC-EMP-007 and both try to insert TC-EMP-008, and one
   * would die on the unique index. The transaction-scoped advisory lock makes
   * the second caller wait until the first commits; it is released
   * automatically at commit or rollback, so a failed create cannot wedge it.
   *
   * Numeric ordering is done on the parsed suffix rather than the string, so
   * TC-EMP-010 sorts after TC-EMP-009 (lexicographically it would not once the
   * sequence passes 3 digits).
   */
  private async nextEmployeeCode(manager: EntityManager): Promise<string> {
    await manager.query('SELECT pg_advisory_xact_lock($1)', [
      EMPLOYEE_CODE_LOCK_KEY,
    ]);

    const rows = await manager.query<{ max: string | null }[]>(
      `SELECT MAX(CAST(SUBSTRING("employee_code" FROM $1) AS INTEGER)) AS max
         FROM "users"
        WHERE "employee_code" ~ $2`,
      [`^${EMPLOYEE_CODE_PREFIX}(\\d+)$`, `^${EMPLOYEE_CODE_PREFIX}\\d+$`],
    );

    const current = Number(rows?.[0]?.max ?? 0);
    const next = (Number.isFinite(current) ? current : 0) + 1;

    return `${EMPLOYEE_CODE_PREFIX}${String(next).padStart(EMPLOYEE_CODE_PAD, '0')}`;
  }

  /** Throws 409 if the email is taken by anyone other than `exceptUserId`. */
  private async assertEmailAvailable(
    manager: EntityManager,
    email: string,
    exceptUserId?: string,
  ): Promise<void> {
    const qb = manager
      .getRepository(User)
      .createQueryBuilder('user')
      .where('LOWER(user.email) = LOWER(:email)', { email });

    if (exceptUserId) {
      qb.andWhere('user.user_id <> :exceptUserId', { exceptUserId });
    }

    if (await qb.getExists()) {
      throw new ConflictException(
        `An employee with the email ${email} already exists`,
      );
    }
  }

  /** Throws 409 if the employee code is taken by anyone other than `exceptUserId`. */
  private async assertEmployeeCodeAvailable(
    manager: EntityManager,
    employeeCode: string,
    exceptUserId?: string,
  ): Promise<void> {
    const qb = manager
      .getRepository(User)
      .createQueryBuilder('user')
      .where('user.employee_code = :employeeCode', { employeeCode });

    if (exceptUserId) {
      qb.andWhere('user.user_id <> :exceptUserId', { exceptUserId });
    }

    if (await qb.getExists()) {
      throw new ConflictException(
        `Employee code ${employeeCode} is already in use`,
      );
    }
  }

  /**
   * Validates a Team Lead assignment.
   *
   * Three rules, none of which SQL can enforce for us: the lead must exist,
   * must hold the Team Lead role, and must belong to the same department as the
   * member. The department rule is the reason the create form filters the
   * dropdown by department — this is the server-side half of that, because a
   * filtered dropdown is a UI convenience, not a constraint.
   *
   * Self-assignment is rejected here with a clear message; the DB CHECK
   * constraint also blocks it, but a 500 from a constraint violation is not a
   * usable error.
   */
  private async assertValidTeamLead(
    manager: EntityManager,
    teamLeadId: string,
    departmentId: string,
    memberUserId?: string,
  ): Promise<void> {
    if (memberUserId && teamLeadId === memberUserId) {
      throw new BadRequestException(
        'An employee cannot be their own Team Lead',
      );
    }

    const lead = await manager.getRepository(User).findOne({
      where: { user_id: teamLeadId },
      relations: { role: true, department: true },
    });

    if (!lead) {
      throw new BadRequestException('The selected Team Lead does not exist');
    }

    if (lead.role?.role_name !== TEAM_LEAD_ROLE_NAME) {
      throw new BadRequestException(
        'The selected user is not a Team Lead. Assign them the Team Lead role first.',
      );
    }

    const leadDepartmentId = lead.department?.department_id;
    if (!leadDepartmentId || leadDepartmentId !== departmentId) {
      throw new BadRequestException(
        'The selected Team Lead belongs to a different department',
      );
    }

    if (!lead.status) {
      throw new BadRequestException(
        'The selected Team Lead is inactive and cannot be assigned',
      );
    }
  }

  /**
   * Maps DTO relation ids onto entity relations.
   *
   * Password is deliberately NOT handled here. It was previously assigned
   * straight from the DTO, which is how plaintext passwords reached the
   * database; hashing now happens on the two explicit paths that own it
   * (`create` and the password-reset methods) so there is no path that writes
   * `password` without going through bcrypt.
   */
  private mapScalars(dto: Partial<CreateUserDto>): Partial<User> {
    const mapped: Partial<User> = {};

    const assign = <K extends keyof User>(
      key: K,
      value: User[K] | undefined,
    ) => {
      if (value !== undefined) {
        mapped[key] = value;
      }
    };

    assign('employee_code', dto.employee_code);
    assign('first_name', dto.first_name);
    assign('last_name', dto.last_name);
    assign('email', dto.email);
    assign('phone', dto.phone);
    assign('profile_image', dto.profile_image);
    assign('date_of_birth', dto.date_of_birth);
    assign('gender', dto.gender);
    assign('blood_group', dto.blood_group);

    assign('street_address', dto.street_address);
    assign('city', dto.city);
    assign('state_province', dto.state_province);
    assign('postal_code', dto.postal_code);
    assign('country', dto.country);

    assign('emergency_contact_name', dto.emergency_contact_name);
    assign(
      'emergency_contact_relationship',
      dto.emergency_contact_relationship,
    );
    assign('emergency_contact_phone', dto.emergency_contact_phone);

    assign('bank_name', dto.bank_name);
    assign('bank_account_number', dto.bank_account_number);
    assign('bank_routing_code', dto.bank_routing_code);

    assign('employee_type', dto.employee_type);
    assign('joining_date', dto.joining_date);
    assign('salary', dto.salary);
    assign('status', dto.status);
    assign('is_overtime', dto.is_overtime);

    // Relations by id. Assigning `{ id } as Relation` is the existing
    // convention in this service and lets TypeORM write the FK without an
    // extra SELECT per relation.
    if (dto.role_id) {
      mapped.role = { role_id: dto.role_id } as User['role'];
    }
    if (dto.department_id) {
      mapped.department = {
        department_id: dto.department_id,
      } as User['department'];
    }
    if (dto.designation_id) {
      mapped.designation = {
        designation_id: dto.designation_id,
      } as User['designation'];
    }
    if (dto.job_category_id) {
      mapped.jobCategory = {
        job_category_id: dto.job_category_id,
      } as User['jobCategory'];
    }
    if (dto.shift_id) {
      mapped.shift = { shift_id: dto.shift_id } as User['shift'];
    }

    // team_lead_id is set as a raw FK column so that `null` (explicitly
    // clearing the lead) is distinguishable from `undefined` (not touched).
    if (dto.team_lead_id !== undefined) {
      mapped.team_lead_id = dto.team_lead_id ?? null;
    }

    return mapped;
  }

  /**
   * Replaces an employee's leave balances within a transaction.
   *
   * Existing rows are updated in place instead of being deleted and recreated,
   * so `used_days` survives a re-save of the employee form. Recreating them
   * would silently reset every employee's consumed leave to zero the first time
   * HR edited an unrelated field.
   */
  private async syncLeaveBalances(
    manager: EntityManager,
    userId: string,
    assignments: LeaveAssignmentDto[],
  ): Promise<void> {
    const repository = manager.getRepository(UserLeaveBalance);
    const requestedIds = assignments.map((a) => a.leave_type_id);

    if (requestedIds.length > 0) {
      const found = await manager.getRepository(LeaveType).find({
        where: requestedIds.map((leave_type_id) => ({ leave_type_id })),
      });

      if (found.length !== requestedIds.length) {
        const foundIds = new Set(found.map((t) => t.leave_type_id));
        const missing = requestedIds.filter((id) => !foundIds.has(id));
        throw new BadRequestException(
          `Unknown leave type(s): ${missing.join(', ')}`,
        );
      }
    }

    const existing = await repository.find({ where: { user_id: userId } });
    const existingByType = new Map(
      existing.map((row) => [row.leave_type_id, row]),
    );

    for (const assignment of assignments) {
      const current = existingByType.get(assignment.leave_type_id);
      const allocated = assignment.allocated_days ?? 0;

      if (current) {
        current.allocated_days = allocated;
        if (assignment.used_days !== undefined) {
          current.used_days = assignment.used_days;
        }
        if (current.used_days > current.allocated_days) {
          throw new BadRequestException(
            `Used days cannot exceed the allocation for leave type ${assignment.leave_type_id}`,
          );
        }
        await repository.save(current);
      } else {
        const used = assignment.used_days ?? 0;
        if (used > allocated) {
          throw new BadRequestException(
            `Used days cannot exceed the allocation for leave type ${assignment.leave_type_id}`,
          );
        }
        const row = repository.create({
          user_id: userId,
          leave_type_id: assignment.leave_type_id,
          allocated_days: allocated,
          used_days: used,
        });
        await repository.save(row);
      }
    }

    // Remove types no longer selected.
    const requested = new Set(requestedIds);
    const removed = existing.filter((row) => !requested.has(row.leave_type_id));
    if (removed.length > 0) {
      await repository.remove(removed);
    }
  }

  // ==========================================
  // CREATE
  // ==========================================

  /**
   * Creates an employee.
   *
   * Wrapped in a single transaction: the user row, the employee-code
   * reservation and the leave balances either all land or none do. Without
   * this, a failure while writing balances would leave a half-configured
   * employee behind and burn an employee code.
   */
  async create(
    createUserDto: CreateUserDto,
    actor?: AuditActor,
  ): Promise<SafeUser> {
    const created = await this.dataSource.transaction(async (manager) => {
      await this.assertEmailAvailable(manager, createUserDto.email);

      const employeeCode =
        createUserDto.employee_code ?? (await this.nextEmployeeCode(manager));

      if (createUserDto.employee_code) {
        await this.assertEmployeeCodeAvailable(manager, employeeCode);
      }

      if (createUserDto.team_lead_id) {
        await this.assertValidTeamLead(
          manager,
          createUserDto.team_lead_id,
          createUserDto.department_id,
        );
      }

      const repository = manager.getRepository(User);
      const user = repository.create({
        ...this.mapScalars(createUserDto),
        employee_code: employeeCode,
        password: await this.hashPassword(createUserDto.password),
      });

      const saved = await repository.save(user);

      if (createUserDto.leave_assignments?.length) {
        await this.syncLeaveBalances(
          manager,
          saved.user_id,
          createUserDto.leave_assignments,
        );
      }

      if (actor) {
        await this.auditService.record({
          actor,
          action: 'employee.create',
          entityType: 'User',
          entityId: saved.user_id,
          after: this.auditSnapshot(saved),
          manager,
        });
      }

      return saved;
    });

    const user = await this.findOne(created.user_id);

    // Both notices, after the commit. `account_created` is the operational one
    // (the account exists, here is where to sign in); `welcome_employee` is the
    // human one. They are separate templates because HR edits them for different
    // reasons and may disable the welcome without losing the credentials notice.
    const withRelations = await this.userRepository.findOne({
      where: { user_id: created.user_id },
      relations: ['department', 'designation'],
    });

    if (withRelations) {
      await this.notify(withRelations, 'account_created', {
        login_url: `${APP_BASE_URL}/login`,
      });
      await this.notify(withRelations, 'welcome_employee', {
        login_url: `${APP_BASE_URL}/login`,
      });
    }

    return user;
  }

  // ==========================================
  // READ
  // ==========================================

  /** Applies filters and search shared by the list and team-member queries. */
  private applyEmployeeFilters(
    qb: SelectQueryBuilder<User>,
    query: EmployeeQueryDto,
  ): void {
    if (query.user_id) {
      qb.andWhere('user.user_id = :userId', { userId: query.user_id });
    }
    if (query.department_id) {
      qb.andWhere('department.department_id = :departmentId', {
        departmentId: query.department_id,
      });
    }
    if (query.designation_id) {
      qb.andWhere('designation.designation_id = :designationId', {
        designationId: query.designation_id,
      });
    }
    if (query.role_id) {
      qb.andWhere('role.role_id = :roleId', { roleId: query.role_id });
    }
    if (query.shift_id) {
      qb.andWhere('shift.shift_id = :shiftId', { shiftId: query.shift_id });
    }
    if (query.job_category_id) {
      qb.andWhere('jobCategory.job_category_id = :jobCategoryId', {
        jobCategoryId: query.job_category_id,
      });
    }
    if (query.team_lead_id) {
      qb.andWhere('user.team_lead_id = :teamLeadId', {
        teamLeadId: query.team_lead_id,
      });
    }
    if (query.employee_type) {
      qb.andWhere('user.employee_type = :employeeType', {
        employeeType: query.employee_type,
      });
    }
    if (query.status !== undefined) {
      qb.andWhere('user.status = :status', { status: query.status });
    }
    if (query.team_leads_only) {
      qb.andWhere('role.role_name = :teamLeadRole', {
        teamLeadRole: TEAM_LEAD_ROLE_NAME,
      });
    }

    if (query.search) {
      // Concatenated name match so "ali khan" finds a first/last name split
      // across two columns, which a per-column ILIKE would miss.
      qb.andWhere(
        `(user.employee_code ILIKE :search
           OR user.email ILIKE :search
           OR user.phone ILIKE :search
           OR user.first_name ILIKE :search
           OR user.last_name ILIKE :search
           OR CONCAT(user.first_name, ' ', user.last_name) ILIKE :search)`,
        { search: `%${query.search}%` },
      );
    }
  }

  /** Paginated, filtered, sorted employee list. */
  async findAll(
    query: EmployeeQueryDto = new EmployeeQueryDto(),
  ): Promise<PaginatedResult<SafeUser>> {
    const qb = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .leftJoinAndSelect('user.department', 'department')
      .leftJoinAndSelect('user.designation', 'designation')
      .leftJoinAndSelect('user.shift', 'shift')
      .leftJoinAndSelect('user.jobCategory', 'jobCategory')
      .leftJoinAndSelect('user.teamLead', 'teamLead');

    this.applyEmployeeFilters(qb, query);

    const sortColumn = SORT_COLUMN_MAP[query.sortBy ?? ''] ?? 'user.created_at';
    qb.orderBy(sortColumn, query.order)
      // Deterministic tiebreak: without it, rows with equal sort values can
      // reorder between pages and an employee is shown twice or skipped.
      .addOrderBy('user.user_id', 'ASC')
      .skip(query.skip)
      .take(query.limit);

    const [data, total] = await qb.getManyAndCount();

    const rows = this.sanitizeMany(data);

    if (query.include_team_count) {
      const counted = await this.attachTeamCounts(rows);
      return paginatedResult(counted, total, query);
    }

    return paginatedResult(rows, total, query);
  }

  /**
   * Adds `team_member_count` to each row in one grouped query.
   *
   * Done as a single query rather than a correlated subquery per row so the
   * Team Leads tab does not issue N+1 counts.
   */
  private async attachTeamCounts(
    rows: SafeUser[],
  ): Promise<(SafeUser & { team_member_count: number })[]> {
    const ids = rows.map((row) => row.user_id);
    if (ids.length === 0) {
      return [];
    }

    const counts = await this.userRepository
      .createQueryBuilder('user')
      .select('user.team_lead_id', 'team_lead_id')
      .addSelect('COUNT(*)', 'count')
      .where('user.team_lead_id IN (:...ids)', { ids })
      .groupBy('user.team_lead_id')
      .getRawMany<{ team_lead_id: string; count: string }>();

    const byLead = new Map(
      counts.map((c) => [c.team_lead_id, Number(c.count)]),
    );

    return rows.map((row) => ({
      ...row,
      team_member_count: byLead.get(row.user_id) ?? 0,
    }));
  }

  /** Single employee with all relations. Throws 404 when absent. */
  async findOne(id: string): Promise<SafeUser> {
    const user = await this.userRepository.findOne({
      where: { user_id: id },
      relations: [...DETAIL_RELATIONS],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.sanitize(user);
  }

  /** Internal lookup that keeps the password hash. Used by password flows. */
  private async findEntityOrFail(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { user_id: id },
      relations: { role: true, department: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Team Leads of one department, for the create/edit form's dropdown.
   *
   * Scoped to active leads in the requested department only — the spec is
   * explicit that leads from other departments must never appear.
   */
  async findTeamLeads(departmentId?: string): Promise<SafeUser[]> {
    const qb = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .leftJoinAndSelect('user.department', 'department')
      .leftJoinAndSelect('user.designation', 'designation')
      .where('role.role_name = :teamLeadRole', {
        teamLeadRole: TEAM_LEAD_ROLE_NAME,
      })
      .andWhere('user.status = true');

    if (departmentId) {
      qb.andWhere('department.department_id = :departmentId', { departmentId });
    }

    const leads = await qb
      .orderBy('user.first_name', 'ASC')
      .addOrderBy('user.last_name', 'ASC')
      .getMany();

    return this.sanitizeMany(leads);
  }

  /**
   * A Team Lead's direct reports — the "My Team" section.
   *
   * Reuses the main list query so search, filters, sorting and pagination
   * behave identically to the Employees tab.
   */
  async findTeamMembers(
    teamLeadId: string,
    query: EmployeeQueryDto = new EmployeeQueryDto(),
  ): Promise<PaginatedResult<SafeUser>> {
    // Confirms the lead exists so an unknown id 404s instead of returning an
    // empty page that reads as "this lead has no team".
    await this.findEntityOrFail(teamLeadId);

    return this.findAll(
      Object.assign(new EmployeeQueryDto(), query, {
        team_lead_id: teamLeadId,
      }),
    );
  }

  /** Leave balances with derived remaining days, for the profile screen. */
  async findLeaveBalances(userId: string): Promise<UserLeaveBalance[]> {
    await this.findEntityOrFail(userId);

    return this.leaveBalanceRepository.find({
      where: { user_id: userId },
      order: { created_at: 'ASC' },
    });
  }

  /**
   * Returns a single leave balance for a user.
   * Used by LeaveRequestService when validating leave requests.
   */
  async findLeaveBalance(
    userId: string,
    leaveTypeId: string,
  ): Promise<UserLeaveBalance> {
    const balance = await this.leaveBalanceRepository.findOne({
      where: {
        user_id: userId,
        leave_type_id: leaveTypeId,
      },
      relations: ['leaveType'],
    });

    if (!balance) {
      throw new NotFoundException(
        'Leave type is not assigned to this employee',
      );
    }

    return balance;
  }

  /**
   * Consumes leave days after a leave request is approved.
   */
  async consumeLeaveBalance(
    manager: EntityManager,
    userId: string,
    leaveTypeId: string,
    days: number,
  ): Promise<void> {
    const repository = manager.getRepository(UserLeaveBalance);

    const balance = await repository.findOne({
      where: {
        user_id: userId,
        leave_type_id: leaveTypeId,
      },
    });

    if (!balance) {
      throw new BadRequestException('Leave balance not found for employee.');
    }

    const remaining = balance.allocated_days - balance.used_days;

    if (remaining < days) {
      throw new BadRequestException('Insufficient leave balance.');
    }

    balance.used_days += days;

    await repository.save(balance);
  }

  /**
   * Restores leave balance when an approved leave is cancelled/rejected.
   */
  async restoreLeaveBalance(
    manager: EntityManager,
    userId: string,
    leaveTypeId: string,
    days: number,
  ): Promise<void> {
    const repository = manager.getRepository(UserLeaveBalance);

    const balance = await repository.findOne({
      where: {
        user_id: userId,
        leave_type_id: leaveTypeId,
      },
    });

    if (!balance) {
      return;
    }

    balance.used_days = Math.max(0, balance.used_days - days);

    await repository.save(balance);
  }

  // ==========================================
  // UPDATE
  // ==========================================

  /** Full admin edit. Every employee field except the password. */
  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    actor?: AuditActor,
  ): Promise<SafeUser> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(User);
      const existing = await repository.findOne({
        where: { user_id: id },
        relations: { role: true, department: true, designation: true },
      });

      if (!existing) {
        throw new NotFoundException('User not found');
      }

      const before = this.auditSnapshot(existing);
      const previousEmail = existing.email;

      if (updateUserDto.email && updateUserDto.email !== existing.email) {
        await this.assertEmailAvailable(manager, updateUserDto.email, id);
      }

      if (
        updateUserDto.employee_code &&
        updateUserDto.employee_code !== existing.employee_code
      ) {
        await this.assertEmployeeCodeAvailable(
          manager,
          updateUserDto.employee_code,
          id,
        );
      }

      // The lead must be valid against the department the employee will end up
      // in, which may itself be changing in this same request.
      if (updateUserDto.team_lead_id) {
        const effectiveDepartmentId =
          updateUserDto.department_id ?? existing.department?.department_id;

        if (!effectiveDepartmentId) {
          throw new BadRequestException(
            'A department is required before assigning a Team Lead',
          );
        }

        await this.assertValidTeamLead(
          manager,
          updateUserDto.team_lead_id,
          effectiveDepartmentId,
          id,
        );
      }

      // Moving an employee to another department invalidates a lead from the
      // old one. Rather than silently keeping a cross-department link, clear it
      // and let HR pick a lead from the new department.
      if (
        updateUserDto.department_id &&
        updateUserDto.department_id !== existing.department?.department_id &&
        updateUserDto.team_lead_id === undefined
      ) {
        existing.team_lead_id = null;
      }

      Object.assign(existing, this.mapScalars(updateUserDto));
      const saved = await repository.save(existing);

      if (updateUserDto.leave_assignments) {
        await this.syncLeaveBalances(
          manager,
          id,
          updateUserDto.leave_assignments,
        );
      }

      // A department change can orphan this lead's own reports.
      await this.detachInvalidReports(manager, saved);

      const { before: changedBefore, after: changedAfter } =
        this.auditService.diff(before, this.auditSnapshot(saved));

      if (actor && Object.keys(changedAfter).length > 0) {
        await this.auditService.record({
          actor,
          action: 'employee.update',
          entityType: 'User',
          entityId: id,
          before: changedBefore,
          after: changedAfter,
          manager,
        });
      }

      return {
        saved,
        previousEmail,
        changedFields: Object.keys(changedAfter),
      };
    });

    await this.notifyProfileChange(outcome);

    return this.findOne(id);
  }

  /**
   * Clears team links that became invalid after a lead moved or lost the role.
   *
   * A Team Lead who changes department would otherwise keep reports in their
   * old one, which is exactly the cross-department state
   * `assertValidTeamLead` exists to prevent — the invariant has to hold when
   * the lead changes, not only when a member does.
   */
  private async detachInvalidReports(
    manager: EntityManager,
    lead: User,
  ): Promise<void> {
    const repository = manager.getRepository(User);

    const reports = await repository.find({
      where: { team_lead_id: lead.user_id },
      relations: { department: true },
    });

    if (reports.length === 0) {
      return;
    }

    const leadRole = await repository.findOne({
      where: { user_id: lead.user_id },
      relations: { role: true, department: true },
    });

    const stillLead = leadRole?.role?.role_name === TEAM_LEAD_ROLE_NAME;
    const leadDepartmentId = leadRole?.department?.department_id;

    const invalid = reports.filter(
      (report) =>
        !stillLead || report.department?.department_id !== leadDepartmentId,
    );

    for (const report of invalid) {
      report.team_lead_id = null;
      await repository.save(report);
    }
  }

  /** Account state toggles. */
  async updateAccountSettings(
    id: string,
    dto: UpdateAccountSettingsDto,
    actor?: AuditActor,
  ): Promise<SafeUser> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(User);
      const existing = await repository.findOne({
        where: { user_id: id },
        relations: ['department', 'designation'],
      });

      if (!existing) {
        throw new NotFoundException('User not found');
      }

      const before = this.auditSnapshot(existing);
      const loginWasEnabled = existing.login_enabled;
      Object.assign(existing, dto);
      const saved = await repository.save(existing);

      if (actor) {
        const { before: changedBefore, after: changedAfter } =
          this.auditService.diff(before, this.auditSnapshot(saved));

        if (Object.keys(changedAfter).length > 0) {
          await this.auditService.record({
            actor,
            action: 'employee.account-settings.update',
            entityType: 'User',
            entityId: id,
            before: changedBefore,
            after: changedAfter,
            manager,
          });
        }
      }

      return { saved, loginWasEnabled };
    });

    // Only a genuine transition is announced. `updateAccountSettings` is a PATCH
    // of many toggles, so re-saving a form with `login_enabled` already true must
    // not send a second "your account has been reactivated".
    const { saved, loginWasEnabled } = outcome;
    if (saved.login_enabled !== loginWasEnabled) {
      await this.notify(
        saved,
        saved.login_enabled ? 'account_reactivated' : 'account_deactivated',
        { login_url: `${APP_BASE_URL}/login` },
      );
    }

    return this.findOne(id);
  }

  /** Replaces the employee's allowed leave types and their balances. */
  async assignLeaveTypes(
    id: string,
    dto: AssignLeaveTypesDto,
    actor?: AuditActor,
  ): Promise<UserLeaveBalance[]> {
    await this.dataSource.transaction(async (manager) => {
      const exists = await manager
        .getRepository(User)
        .createQueryBuilder('user')
        .where('user.user_id = :id', { id })
        .getExists();

      if (!exists) {
        throw new NotFoundException('User not found');
      }

      const before = await manager.getRepository(UserLeaveBalance).find({
        where: { user_id: id },
      });

      await this.syncLeaveBalances(manager, id, dto.assignments);

      if (actor) {
        await this.auditService.record({
          actor,
          action: 'employee.leave-types.assign',
          entityType: 'User',
          entityId: id,
          before: {
            leave_types: before.map((row) => ({
              leave_type_id: row.leave_type_id,
              allocated_days: row.allocated_days,
              used_days: row.used_days,
            })),
          },
          after: {
            leave_types: dto.assignments.map((row) => ({
              leave_type_id: row.leave_type_id,
              allocated_days: row.allocated_days ?? 0,
              used_days: row.used_days ?? 0,
            })),
          },
          manager,
        });
      }
    });

    return this.findLeaveBalances(id);
  }

  /**
   * Full name, or the email when the name columns are empty.
   *
   * Emails address the recipient by name, and `"Dear  "` from two blank columns
   * looks like a broken mail-merge — which is exactly what a phishing filter and
   * a suspicious employee both read it as.
   */
  private nameOf(user: User): string {
    const name = [user.first_name, user.last_name]
      .filter((part) => part && part.trim().length > 0)
      .join(' ')
      .trim();

    return name.length > 0 ? name : (user.email ?? 'there');
  }

  /**
   * Queues a lifecycle notification for one employee.
   *
   * Wraps `MailService.enqueue` with the employee context every template shares,
   * so a template that starts using `{{department}}` does not need each call site
   * updated. Deliberately does not throw: `enqueue` already swallows a disabled
   * template or unconfigured SMTP, and the callers here have all committed their
   * change by this point — failing the request afterwards would report an error
   * for an update that did happen.
   */
  private async notify(
    user: User,
    templateKey: string,
    extraContext: Record<string, string> = {},
  ): Promise<void> {
    if (!user.email) {
      return;
    }

    const name = this.nameOf(user);

    await this.mailService.enqueue({
      templateKey,
      to: user.email,
      toName: name,
      relatedUserId: user.user_id,
      context: {
        employee_name: name,
        employee_id: user.employee_code ?? '',
        department: user.department?.department_name ?? '',
        designation: user.designation?.title ?? '',
        ...extraContext,
      },
    });
  }

  /**
   * Admin-initiated password reset.
   *
   * Honours the target's `password_reset_allowed` flag so the toggle is not
   * merely decorative in the UI.
   */
  async resetPassword(
    id: string,
    dto: ResetPasswordDto,
    actor?: AuditActor,
  ): Promise<{ message: string }> {
    const user = await this.findEntityOrFail(id);

    if (!user.password_reset_allowed) {
      throw new ForbiddenException(
        'Password resets are disabled for this account',
      );
    }

    // The same rules as every other password path. An admin-chosen password is
    // not exempt: it is typically communicated over a channel less private than
    // the account itself, so a weak or previously-breached one is if anything
    // more exposed.
    await this.passwordPolicy.assertAcceptable(
      id,
      dto.new_password,
      user.password,
    );

    const previousHash = user.password;
    const newHash = await this.hashPassword(dto.new_password);

    await this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(User)
        .update({ user_id: id }, { password: newHash });

      await this.passwordPolicy.remember(id, previousHash, manager);
    });

    if (actor) {
      // The hash itself is never recorded — only that a reset happened, by
      // whom, and to which account.
      await this.auditService.record({
        actor,
        action: 'employee.password.reset',
        entityType: 'User',
        entityId: id,
        after: {
          password_reset: true,
          require_change_on_next_login:
            dto.require_change_on_next_login ?? false,
        },
      });
    }

    // Tells the employee their password was changed by an administrator. Without
    // it, an account takeover by a privileged insider is invisible to the owner.
    await this.notify(user, 'admin_reset_notification');

    return { message: 'Password reset successfully' };
  }

  /** Self-service password change. Requires the current password. */
  async changeOwnPassword(
    userId: string,
    dto: ChangeOwnPasswordDto,
    actor?: AuditActor,
  ): Promise<{ message: string }> {
    const user = await this.findEntityOrFail(userId);

    if (!user.password_reset_allowed) {
      throw new ForbiddenException(
        'Password changes are disabled for your account',
      );
    }

    // Tolerates a legacy plaintext password so users seeded before hashing was
    // introduced can still authenticate here — and their password is upgraded
    // to a hash by the save below. Mirrors AuthService's login check.
    const stored = user.password ?? '';
    const looksHashed = stored.startsWith('$2');
    const currentMatches = looksHashed
      ? await bcrypt.compare(dto.current_password, stored)
      : stored === dto.current_password;

    if (!currentMatches) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Strength + reuse, enforced through the same service the reset-token path
    // uses. `assertAcceptable` subsumes the old "must differ from the current
    // one" check by comparing against `user.password` as well as history, so
    // that comparison is no longer duplicated here.
    await this.passwordPolicy.assertAcceptable(
      userId,
      dto.new_password,
      user.password,
    );

    const previousHash = user.password;
    const newHash = await this.hashPassword(dto.new_password);

    // One transaction: the password write and the history row must land together
    // or not at all. A history row without the password change would refuse a
    // password the user never actually had.
    await this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(User)
        .update({ user_id: userId }, { password: newHash });

      await this.passwordPolicy.remember(userId, previousHash, manager);
    });

    if (actor) {
      await this.auditService.record({
        actor,
        action: 'employee.password.change',
        entityType: 'User',
        entityId: userId,
        after: { password_changed: true },
      });
    }

    // Best-effort confirmation. MailService swallows its own failures, so a
    // password that did change never reports an error because the notice didn't
    // go out. The notice matters: it is how a user learns their password was
    // changed by someone else.
    // The notice matters as much as the change: it is how a user learns their
    // password was changed by someone else — or, in a hijacking, is flushed out
    // of their own session before they notice.
    await this.notify(user, 'password_changed');

    return { message: 'Password changed successfully' };
  }

  /**
   * Self-service profile update.
   *
   * Only the fields in SELF_EDITABLE_FIELDS are copied across, so anything
   * else in the payload is ignored even if it survived the ValidationPipe.
   * This is the last line of defence against an employee editing their own
   * salary, role, department or team lead.
   */
  async updateOwnProfile(
    userId: string,
    dto: UpdateOwnProfileDto,
    options: { allowEmailChange?: boolean } = {},
    actor?: AuditActor,
  ): Promise<SafeUser> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(User);
      const existing = await repository.findOne({
        where: { user_id: userId },
        relations: ['department', 'designation'],
      });

      if (!existing) {
        throw new NotFoundException('User not found');
      }

      const previousEmail = existing.email;

      if (dto.email && dto.email !== existing.email) {
        if (!options.allowEmailChange) {
          throw new ForbiddenException(
            'Email changes must be made by HR. Please contact your administrator.',
          );
        }
        await this.assertEmailAvailable(manager, dto.email, userId);
      }

      const before = this.auditSnapshot(existing);

      const payload = dto as Record<string, unknown>;
      for (const field of SELF_EDITABLE_FIELDS) {
        if (payload[field] !== undefined) {
          (existing as unknown as Record<string, unknown>)[field] =
            payload[field];
        }
      }

      const saved = await repository.save(existing);

      const { before: changedBefore, after: changedAfter } =
        this.auditService.diff(before, this.auditSnapshot(saved));
      const changedFields = Object.keys(changedAfter);

      if (actor && changedFields.length > 0) {
        await this.auditService.record({
          actor,
          action: 'employee.profile.self-update',
          entityType: 'User',
          entityId: userId,
          before: changedBefore,
          after: changedAfter,
          manager,
        });
      }

      return { saved, previousEmail, changedFields };
    });

    // Notifications are sent after the transaction commits, never inside it. An
    // enqueue that joined the transaction would be rolled back with it, but the
    // reverse is worse: mail queued inside a transaction that later aborts
    // announces a change that did not happen.
    await this.notifyProfileChange(outcome);

    return this.findOne(userId);
  }

  /**
   * Sends the notices that follow a profile edit.
   *
   * Split out because there are two distinct events here and the email-change
   * one has a subtlety: it goes to the *previous* address, not the new one.
   * Mailing only the new address means a hijacker who changes the email locks
   * the owner out silently, and the one message that would have warned them is
   * delivered to the attacker.
   */
  private async notifyProfileChange(outcome: {
    saved: User;
    previousEmail?: string | null;
    changedFields: string[];
  }): Promise<void> {
    const { saved, previousEmail, changedFields } = outcome;

    if (changedFields.length === 0) {
      return;
    }

    if (changedFields.includes('email') && previousEmail) {
      await this.mailService.enqueue({
        templateKey: 'email_changed',
        to: previousEmail,
        toName: this.nameOf(saved),
        relatedUserId: saved.user_id,
        context: {
          employee_name: this.nameOf(saved),
          employee_id: saved.employee_code ?? '',
          previous_email: previousEmail,
          employee_email: saved.email ?? '',
        },
      });
    }

    // A generic "your profile was updated" on top of the email notice would be
    // redundant noise, so it is only sent when something other than the address
    // changed.
    const otherFields = changedFields.filter(
      (field) => field !== 'email' && !NON_NOTIFIABLE_FIELDS.has(field),
    );
    if (otherFields.length > 0) {
      await this.notify(saved, 'profile_updated', {
        // Field names only. The values are deliberately omitted: this mail is
        // sent to an address that may already be compromised, and "your phone
        // number changed" is safe to leak where the new number is not.
        changed_fields: otherFields.map(humanizeField).join(', '),
      });
    }
  }

  /**
   * Validates and stores an uploaded profile photo, plus its thumbnail.
   *
   * The old files are removed only after the new paths are committed — deleting
   * first would leave the employee with no photo at all if the save failed.
   */
  async updatePhoto(
    id: string,
    file: UploadedFile | undefined,
    actor?: AuditActor,
  ): Promise<SafeUser> {
    const user = await this.findEntityOrFail(id);
    const previous = user.profile_image ?? null;
    const previousThumb = user.profile_image_thumb ?? null;

    const validated = validateImageUpload(file);
    const imagePath = await savePhoto(validated);
    // Null when sharp could not read the image. Readers fall back to the full
    // photo, so an unusual-but-valid file still uploads successfully.
    const thumbPath = await saveThumbnail(imagePath);

    user.profile_image = imagePath;
    user.profile_image_thumb = thumbPath ?? undefined;
    await this.userRepository.save(user);

    await deletePhoto(previous);
    await deletePhoto(previousThumb);

    if (actor) {
      await this.auditService.record({
        actor,
        action: 'employee.photo.update',
        entityType: 'User',
        entityId: id,
        before: { profile_image: previous },
        after: { profile_image: imagePath },
      });
    }

    return this.findOne(id);
  }

  /** Clears the photo and removes the stored files. */
  async removePhoto(id: string, actor?: AuditActor): Promise<SafeUser> {
    const user = await this.findEntityOrFail(id);
    const previous = user.profile_image ?? null;
    const previousThumb = user.profile_image_thumb ?? null;

    user.profile_image = undefined;
    user.profile_image_thumb = undefined;
    await this.userRepository.save(user);

    await deletePhoto(previous);
    await deletePhoto(previousThumb);

    if (actor) {
      await this.auditService.record({
        actor,
        action: 'employee.photo.remove',
        entityType: 'User',
        entityId: id,
        before: { profile_image: previous },
        after: { profile_image: null },
      });
    }

    return this.findOne(id);
  }

  // ==========================================
  // ROLE ASSIGNMENT
  // ==========================================

  /**
   * Roles the caller is allowed to assign.
   *
   * Only callers holding `employees.role.assign` may assign roles at all. Among
   * those, a caller may not grant a role whose permission set exceeds their
   * own — otherwise anyone able to create employees could mint an account with
   * more privilege than they hold and log into it, which is privilege
   * escalation with extra steps.
   */
  async getAssignableRoles(callerPermissions: string[]): Promise<Role[]> {
    if (!callerPermissions.includes('employees.role.assign')) {
      return [];
    }

    const roles = await this.roleRepository.find({
      relations: { rolePermissions: { permission: true } },
      order: { role_name: 'ASC' },
    });

    const held = new Set(callerPermissions);

    return roles.filter((role) => {
      const rolePermissions = (role.rolePermissions ?? [])
        .map((rp) => rp.permission?.permission_name)
        .filter((name): name is string => Boolean(name));

      return rolePermissions.every((name) => held.has(name));
    });
  }

  /** Throws if the caller may not assign the requested role. */
  async assertRoleAssignable(
    roleId: string,
    callerPermissions: string[],
  ): Promise<void> {
    const assignable = await this.getAssignableRoles(callerPermissions);

    if (!assignable.some((role) => role.role_id === roleId)) {
      throw new ForbiddenException(
        'You do not have permission to assign this role',
      );
    }
  }

  // ==========================================
  // DELETE
  // ==========================================

  /**
   * Deletes an employee.
   *
   * Reports are detached first. The FK is ON DELETE SET NULL so the database
   * would do this anyway, but doing it explicitly inside the transaction means
   * the audit entry records how many people were affected.
   */
  async delete(id: string, actor?: AuditActor): Promise<{ message: string }> {
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(User);
      const existing = await repository.findOne({
        where: { user_id: id },
        relations: { role: true, department: true },
      });

      if (!existing) {
        throw new NotFoundException('User not found');
      }

      const reports = await repository.find({ where: { team_lead_id: id } });
      for (const report of reports) {
        report.team_lead_id = null;
        await repository.save(report);
      }

      if (actor) {
        // Recorded before the delete: afterwards the row is gone and there is
        // nothing left to snapshot.
        await this.auditService.record({
          actor,
          action: 'employee.delete',
          entityType: 'User',
          entityId: id,
          before: {
            ...this.auditSnapshot(existing),
            detached_team_members: reports.length,
          },
          manager,
        });
      }

      await repository.remove(existing);
    });

    return { message: 'User deleted successfully' };
  }
}
