import { BadRequestException, NotFoundException } from '@nestjs/common';

import { LeaveEntitlementsService } from './leave-entitlements.service';
import { EntitlementMode } from './dto/create-entitlement.dto';
import { AdjustDirection } from './dto/adjust-balance.dto';
import { LeaveHistoryType } from './leave-history.entity';

/**
 * In-memory fakes rather than jest.fn() everywhere: the service leans
 * heavily on manager.getRepository(...).find/save inside a transaction, and
 * modelling that behaviour (create() returns a plain object, save() persists
 * it, find() filters by where) is more revealing of real bugs than a mock
 * that just records calls.
 */
class FakeRepo<T extends Record<string, any>> {
  rows: T[] = [];
  idField: string;

  constructor(idField: string, seed: T[] = []) {
    this.idField = idField;
    this.rows = seed;
  }

  create(partial: Partial<T>): T {
    return { ...partial } as T;
  }

  async save(entity: T): Promise<T> {
    if (!(entity as any)[this.idField]) {
      (entity as any)[this.idField] = `id-${this.rows.length + 1}-${Math.random().toString(36).slice(2, 8)}`;
    }
    const idx = this.rows.findIndex(
      (r) => (r as any)[this.idField] === (entity as any)[this.idField],
    );
    if (idx >= 0) {
      this.rows[idx] = entity;
    } else {
      this.rows.push(entity);
    }
    return entity;
  }

  async findOne({ where }: { where: Record<string, any> }): Promise<T | null> {
    return (
      this.rows.find((r) =>
        Object.entries(where).every(([k, v]) => (r as any)[k] === v),
      ) ?? null
    );
  }

  async find({ where }: { where: any }): Promise<T[]> {
    const clauses = Array.isArray(where) ? where : [where];
    return this.rows.filter((r) =>
      clauses.some((clause: Record<string, any>) =>
        Object.entries(clause).every(([k, v]) => {
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            // Relation filters like { department: { department_id } }
            const nestedKey = Object.keys(v)[0];
            return (r as any)[k]?.[nestedKey] === v[nestedKey];
          }
          return (r as any)[k] === v;
        }),
      ),
    );
  }
}

function makeUser(overrides: Partial<any> = {}) {
  return {
    user_id: overrides.user_id ?? 'user-1',
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane@example.com',
    employee_code: 'EMP-1',
    department: { department_id: 'dept-1', department_name: 'Engineering' },
    designation: { designation_id: 'desig-1', title: 'Engineer' },
    ...overrides,
  };
}

describe('LeaveEntitlementsService', () => {
  let service: LeaveEntitlementsService;
  let entitlementRepo: FakeRepo<any>;
  let historyRepo: FakeRepo<any>;
  let userRepo: FakeRepo<any>;
  let balanceRepo: FakeRepo<any>;
  let leaveTypeRepo: FakeRepo<any>;
  let leaveRequestRepo: FakeRepo<any>;
  let auditService: { record: jest.Mock };
  let mailService: { enqueue: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  const actor = { user_id: 'admin-1', email: 'admin@example.com' };
  const leaveType = { leave_type_id: 'lt-1', name: 'Annual Leave' };

  beforeEach(() => {
    entitlementRepo = new FakeRepo('leave_entitlement_id');
    historyRepo = new FakeRepo('leave_history_id');
    userRepo = new FakeRepo('user_id', [makeUser()]);
    balanceRepo = new FakeRepo('user_leave_balance_id');
    leaveTypeRepo = new FakeRepo('leave_type_id', [leaveType]);
    leaveRequestRepo = new FakeRepo('leave_id');
    (leaveRequestRepo as any).createQueryBuilder = () => {
      const qb: any = {
        select: () => qb,
        addSelect: () => qb,
        where: () => qb,
        andWhere: () => qb,
        groupBy: () => qb,
        addGroupBy: () => qb,
        getRawMany: async () => [],
      };
      return qb;
    };

    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    mailService = { enqueue: jest.fn().mockResolvedValue(undefined) };

    const manager = {
      getRepository: (entity: any) => {
        const name = entity.name ?? entity;
        if (name === 'LeaveEntitlement') return entitlementRepo;
        if (name === 'LeaveHistory') return historyRepo;
        if (name === 'UserLeaveBalance') return balanceRepo;
        if (name === 'User') return userRepo;
        throw new Error(`No fake repo for ${name}`);
      },
    };

    dataSource = {
      transaction: jest.fn(async (cb: any) => cb(manager)),
    };

    service = new LeaveEntitlementsService(
      entitlementRepo as any,
      historyRepo as any,
      userRepo as any,
      balanceRepo as any,
      leaveTypeRepo as any,
      leaveRequestRepo as any,
      dataSource as any,
      auditService as any,
      mailService as any,
    );
  });

  describe('bulkAssign', () => {
    it('grants a fresh yearly entitlement (mode=set) and records history + audit', async () => {
      const result = await service.bulkAssign(
        {
          leave_type_id: 'lt-1',
          year: 2026,
          target: { user_id: 'user-1' },
          mode: EntitlementMode.SET,
          days: 14,
        } as any,
        actor,
      );

      expect(result.processed).toBe(1);
      expect(entitlementRepo.rows).toHaveLength(1);
      expect(entitlementRepo.rows[0].entitled_days).toBe(14);

      expect(balanceRepo.rows).toHaveLength(1);
      expect(balanceRepo.rows[0].allocated_days).toBe(14);
      expect(balanceRepo.rows[0].used_days).toBe(0);

      expect(historyRepo.rows).toHaveLength(1);
      expect(historyRepo.rows[0].type).toBe(LeaveHistoryType.ENTITLEMENT);
      expect(historyRepo.rows[0].amount).toBe(14);
      expect(historyRepo.rows[0].balance_after).toBe(14);

      expect(auditService.record).toHaveBeenCalled();
      expect(mailService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ templateKey: 'leave_entitlement_granted' }),
      );
    });

    it('increase mode adds to an existing entitlement without overwriting the base grant', async () => {
      await service.bulkAssign(
        {
          leave_type_id: 'lt-1',
          year: 2026,
          target: { user_id: 'user-1' },
          mode: EntitlementMode.SET,
          days: 10,
        } as any,
        actor,
      );

      const result = await service.bulkAssign(
        {
          leave_type_id: 'lt-1',
          year: 2026,
          target: { user_id: 'user-1' },
          mode: EntitlementMode.INCREASE,
          days: 3,
        } as any,
        actor,
      );

      expect(entitlementRepo.rows).toHaveLength(1);
      expect(entitlementRepo.rows[0].entitled_days).toBe(10);
      expect(entitlementRepo.rows[0].adjusted_days).toBe(3);
      expect(balanceRepo.rows[0].allocated_days).toBe(13);
      expect(historyRepo.rows).toHaveLength(2);
      expect(historyRepo.rows[1].type).toBe(LeaveHistoryType.ADJUSTMENT);
      // total_days is a getter on the real entity class; the fake repo
      // returns plain objects, so assert on the underlying fields instead.
      expect(
        entitlementRepo.rows[0].entitled_days +
          entitlementRepo.rows[0].adjusted_days,
      ).toBe(13);
      expect(result.results[0].user_id).toBe('user-1');
    });

    it('deduct mode refuses to push remaining balance negative unless allow_negative is set', async () => {
      await service.bulkAssign(
        {
          leave_type_id: 'lt-1',
          year: 2026,
          target: { user_id: 'user-1' },
          mode: EntitlementMode.SET,
          days: 5,
        } as any,
        actor,
      );

      await expect(
        service.bulkAssign(
          {
            leave_type_id: 'lt-1',
            year: 2026,
            target: { user_id: 'user-1' },
            mode: EntitlementMode.DEDUCT,
            days: 10,
          } as any,
          actor,
        ),
      ).rejects.toThrow(BadRequestException);

      // Balance untouched by the rejected deduct.
      expect(balanceRepo.rows[0].allocated_days).toBe(5);

      const allowed = await service.bulkAssign(
        {
          leave_type_id: 'lt-1',
          year: 2026,
          target: { user_id: 'user-1' },
          mode: EntitlementMode.DEDUCT,
          days: 10,
          allow_negative: true,
        } as any,
        actor,
      );

      expect(allowed.processed).toBe(1);
      expect(balanceRepo.rows[0].allocated_days).toBe(-5);
    });

    it('resolves a department target and applies the excludes list', async () => {
      userRepo.rows.push(
        makeUser({ user_id: 'user-2' }),
        makeUser({
          user_id: 'user-3',
          department: { department_id: 'dept-2', department_name: 'Sales' },
        }),
      );

      const result = await service.bulkAssign(
        {
          leave_type_id: 'lt-1',
          year: 2026,
          target: { department_id: 'dept-1', exclude_user_ids: ['user-2'] },
          mode: EntitlementMode.SET,
          days: 8,
        } as any,
        actor,
      );

      // Only user-1 is in dept-1 and not excluded; user-2 excluded, user-3 in a different dept.
      expect(result.processed).toBe(1);
      expect(result.results[0].user_id).toBe('user-1');
    });

    it('rejects a target with no selector and a target with more than one selector', async () => {
      await expect(
        service.bulkAssign(
          {
            leave_type_id: 'lt-1',
            year: 2026,
            target: {},
            mode: EntitlementMode.SET,
            days: 5,
          } as any,
          actor,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.bulkAssign(
          {
            leave_type_id: 'lt-1',
            year: 2026,
            target: { user_id: 'user-1', department_id: 'dept-1' },
            mode: EntitlementMode.SET,
            days: 5,
          } as any,
          actor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for an unknown leave type', async () => {
      await expect(
        service.bulkAssign(
          {
            leave_type_id: 'missing-lt',
            year: 2026,
            target: { user_id: 'user-1' },
            mode: EntitlementMode.SET,
            days: 5,
          } as any,
          actor,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('adjust', () => {
    it('increases an existing entitlement by id and records the delta', async () => {
      await service.bulkAssign(
        {
          leave_type_id: 'lt-1',
          year: 2026,
          target: { user_id: 'user-1' },
          mode: EntitlementMode.SET,
          days: 10,
        } as any,
        actor,
      );

      const id = entitlementRepo.rows[0].leave_entitlement_id;
      // adjust() looks up the entitlement with relations; give the fake repo
      // enough shape to resolve `user`.
      entitlementRepo.rows[0].user = makeUser();

      const updated = await service.adjust(
        id,
        { direction: AdjustDirection.INCREASE, days: 2 } as any,
        actor,
      );

      expect(updated.adjusted_days).toBe(2);
      expect(balanceRepo.rows[0].allocated_days).toBe(12);
    });

    it('throws NotFoundException for an unknown entitlement id', async () => {
      await expect(
        service.adjust(
          'does-not-exist',
          { direction: AdjustDirection.INCREASE, days: 1 } as any,
          actor,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deductForApprovedLeave / restoreBalance', () => {
    it('deducting then restoring the same days nets the balance back to its starting point', async () => {
      const fakeManager = {
        getRepository: (entity: any) => {
          const name = entity.name ?? entity;
          if (name === 'UserLeaveBalance') return balanceRepo;
          if (name === 'LeaveHistory') return historyRepo;
          throw new Error(`unexpected repo ${name}`);
        },
      } as any;

      await service.deductForApprovedLeave(
        fakeManager,
        'user-1',
        'lt-1',
        3,
        'leave-req-1',
        actor,
      );
      expect(balanceRepo.rows[0].used_days).toBe(3);
      expect(historyRepo.rows[0].type).toBe(LeaveHistoryType.LEAVE_TAKEN);
      expect(historyRepo.rows[0].amount).toBe(-3);

      await service.restoreBalance(
        fakeManager,
        'user-1',
        'lt-1',
        3,
        'leave-req-1',
        actor,
      );
      expect(balanceRepo.rows[0].used_days).toBe(0);
      expect(historyRepo.rows[1].amount).toBe(3);
    });

    it('restoreBalance never drives used_days negative', async () => {
      const fakeManager = {
        getRepository: (entity: any) => {
          const name = entity.name ?? entity;
          if (name === 'UserLeaveBalance') return balanceRepo;
          if (name === 'LeaveHistory') return historyRepo;
          throw new Error(`unexpected repo ${name}`);
        },
      } as any;

      await balanceRepo.save({
        user_id: 'user-1',
        leave_type_id: 'lt-1',
        allocated_days: 10,
        used_days: 1,
      });

      await service.restoreBalance(fakeManager, 'user-1', 'lt-1', 5, 'req-x', actor);

      expect(balanceRepo.rows[0].used_days).toBe(0);
    });
  });
});
