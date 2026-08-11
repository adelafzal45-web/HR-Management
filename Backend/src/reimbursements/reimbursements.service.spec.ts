import { BadRequestException, NotFoundException } from '@nestjs/common';
import { In, Repository } from 'typeorm';

import { ReimbursementsService } from './reimbursements.service';
import { Reimbursement } from './reimbursement.entity';
import { PayrollNotifierService } from './payroll-notifier.service';

/**
 * Expense claims (Phase 3, spec §3C/§3D). Two things here decide whether an
 * employee gets paid correctly:
 *
 *  1. `resolveForPeriod` must MUTATE NOTHING — it runs on every preview, and a
 *     preview that marked claims paid would settle expenses for a payroll run
 *     that was never committed.
 *  2. `markPaid` must be keyed on the period, so re-generating a period re-marks
 *     the same rows instead of paying them a second time. That, plus the
 *     `releaseForPeriod` that precedes it in `persist`, is the whole
 *     double-payment defence.
 *
 * The SQL predicate itself (date window, status filter) is covered by the e2e
 * script against a real database; what is asserted here is the query the service
 * asks for, the aggregation it returns, and the write calls it makes.
 */
describe('ReimbursementsService', () => {
  type Recorded = { sql: string; params?: Record<string, unknown> };

  let service: ReimbursementsService;
  let store: Reimbursement[];
  let recorded: Recorded[];
  let queryResult: Reimbursement[];
  let update: jest.Mock;
  let notifier: { notifySubmitted: jest.Mock; notifyDecision: jest.Mock };

  function claim(over: Partial<Reimbursement> = {}): Reimbursement {
    return {
      reimbursement_id: 'r1',
      user_id: 'emp-1',
      title: 'Client visit taxi',
      category: 'Travel',
      amount: 4500,
      expense_date: new Date('2026-08-06'),
      description: null,
      receipt_url: null,
      status: 'pending',
      decided_by: null,
      decided_at: null,
      decision_note: null,
      paid_period_id: null,
      paid_payslip_id: null,
      ...over,
    } as Reimbursement;
  }

  function repo(): Repository<Reimbursement> {
    const builder = {
      where: (sql: string, params?: Record<string, unknown>) => {
        recorded.push({ sql, params });
        return builder;
      },
      andWhere: (sql: string, params?: Record<string, unknown>) => {
        recorded.push({ sql, params });
        return builder;
      },
      leftJoinAndSelect: () => builder,
      orderBy: () => builder,
      addOrderBy: () => builder,
      getMany: async () => queryResult,
    };

    return {
      createQueryBuilder: () => builder,
      create: (data: Partial<Reimbursement>) =>
        ({ reimbursement_id: 'new-1', ...data }) as Reimbursement,
      save: async (row: Reimbursement) => {
        const at = store.findIndex(
          (c) => c.reimbursement_id === row.reimbursement_id,
        );
        if (at >= 0) store[at] = row;
        else store.push(row);
        return row;
      },
      findOne: async ({ where }: { where: { reimbursement_id: string } }) =>
        store.find((c) => c.reimbursement_id === where.reimbursement_id) ?? null,
      find: async () => store,
      delete: async (id: string) => {
        store = store.filter((c) => c.reimbursement_id !== id);
        return { affected: 1 };
      },
      update,
    } as unknown as Repository<Reimbursement>;
  }

  beforeEach(() => {
    store = [];
    recorded = [];
    queryResult = [];
    update = jest.fn().mockResolvedValue({ affected: 2 });
    notifier = { notifySubmitted: jest.fn(), notifyDecision: jest.fn() };
    service = new ReimbursementsService(
      repo(),
      notifier as unknown as PayrollNotifierService,
    );
  });

  describe('resolveForPeriod (preview path)', () => {
    beforeEach(() => {
      queryResult = [
        claim({ reimbursement_id: 'r1', category: 'Travel', amount: 4500 }),
        claim({ reimbursement_id: 'r2', category: 'Internet', amount: 2000 }),
      ];
    });

    it('totals the claims and builds the "Why?" detail string', async () => {
      const resolved = await service.resolveForPeriod(
        'emp-1',
        '2026-08-01',
        '2026-08-31',
        'period-1',
      );

      expect(resolved.total).toBe(6500);
      expect(resolved.count).toBe(2);
      expect(resolved.ids).toEqual(['r1', 'r2']);
      // Exactly the phrasing the payslip line's calc_note carries.
      expect(resolved.detail).toBe('Travel 4500.00 + Internet 2000.00');
    });

    it('writes nothing — a preview never settles an expense', async () => {
      await service.resolveForPeriod(
        'emp-1',
        '2026-08-01',
        '2026-08-31',
        'period-1',
      );
      expect(update).not.toHaveBeenCalled();
      expect(notifier.notifyDecision).not.toHaveBeenCalled();
    });

    it('re-picks claims this same period already paid, so a re-run reproduces the payslip', async () => {
      await service.resolveForPeriod(
        'emp-1',
        '2026-08-01',
        '2026-08-31',
        'period-1',
      );

      const statusClause = recorded.find((r) => r.sql.includes('claim.status'));
      expect(statusClause?.sql).toContain('claim.paid_period_id = :periodId');
      expect(statusClause?.params).toMatchObject({
        approved: 'approved',
        paid: 'paid',
        periodId: 'period-1',
      });
    });

    it('asks only for approved claims when there is no period yet', async () => {
      await service.resolveForPeriod('emp-1', '2026-08-01', '2026-08-31');

      const statusClause = recorded.find((r) => r.sql.includes('claim.status'));
      expect(statusClause?.sql).not.toContain('paid_period_id');
      expect(statusClause?.params).toEqual({ approved: 'approved' });
    });

    it('narrows to the period by expense date, normalised to YYYY-MM-DD', async () => {
      await service.resolveForPeriod(
        'emp-1',
        new Date('2026-08-01T00:00:00Z'),
        new Date('2026-08-31T00:00:00Z'),
        'period-1',
      );

      const dateClause = recorded.find((r) => r.sql.includes('expense_date'));
      expect(dateClause?.params).toEqual({
        from: '2026-08-01',
        to: '2026-08-31',
      });
    });

    it('reports nothing when the period has no approved claims', async () => {
      queryResult = [];
      const resolved = await service.resolveForPeriod(
        'emp-1',
        '2026-08-01',
        '2026-08-31',
        'period-1',
      );

      // total 0 is what makes the engine skip the reimbursement line entirely,
      // which is the Phase 2 parity guarantee.
      expect(resolved).toEqual({
        total: 0,
        count: 0,
        items: [],
        ids: [],
        detail: '',
      });
    });
  });

  describe('markPaid (persist path)', () => {
    it('stamps the settling period and payslip on every claim', async () => {
      const affected = await service.markPaid(
        ['r1', 'r2'],
        'period-1',
        'payslip-9',
      );

      expect(affected).toBe(2);
      expect(update).toHaveBeenCalledWith(
        { reimbursement_id: In(['r1', 'r2']) },
        {
          status: 'paid',
          paid_period_id: 'period-1',
          paid_payslip_id: 'payslip-9',
        },
      );
    });

    it('is a no-op for an employee with no claims', async () => {
      expect(await service.markPaid([], 'period-1', 'payslip-9')).toBe(0);
      expect(update).not.toHaveBeenCalled();
    });

    it('writes through the payslip transaction when one is supplied', async () => {
      const txUpdate = jest.fn().mockResolvedValue({ affected: 1 });
      const manager = {
        getRepository: jest.fn().mockReturnValue({ update: txUpdate }),
      };

      await service.markPaid(['r1'], 'period-1', 'payslip-9', manager as never);

      // The claim flip must commit or roll back with the payslip itself.
      expect(manager.getRepository).toHaveBeenCalledWith(Reimbursement);
      expect(txUpdate).toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('releaseForPeriod (re-run path)', () => {
    it('returns a period’s claims to approved so the recompute can re-settle them', async () => {
      await service.releaseForPeriod('period-1', 'emp-1');

      expect(update).toHaveBeenCalledWith(
        { paid_period_id: 'period-1', status: 'paid', user_id: 'emp-1' },
        { status: 'approved', paid_period_id: null, paid_payslip_id: null },
      );
    });

    it('never touches a claim paid by a different period', async () => {
      await service.releaseForPeriod('period-1');
      const [where] = update.mock.calls[0] as [Record<string, unknown>];
      expect(where.paid_period_id).toBe('period-1');
      expect(where.status).toBe('paid');
    });
  });

  describe('claim lifecycle', () => {
    it('forces the token user and a pending status on submission', async () => {
      const saved = await service.createMine('emp-1', {
        title: 'Client visit taxi',
        category: 'Travel',
        amount: 4500,
        expense_date: '2026-08-06',
        // A hostile client trying to file a pre-approved claim for someone else.
        user_id: 'emp-2',
        status: 'approved',
      } as never);

      expect(saved.user_id).toBe('emp-1');
      expect(saved.status).toBe('pending');
      expect(notifier.notifySubmitted).toHaveBeenCalledWith(
        'reimbursement',
        saved.reimbursement_id,
        'emp-1',
        expect.stringContaining('Client visit taxi'),
      );
    });

    it('rejects a non-positive amount', async () => {
      await expect(
        service.createMine('emp-1', {
          title: 'Nothing',
          amount: 0,
          expense_date: '2026-08-06',
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('only decides a pending claim, once', async () => {
      store = [claim()];

      const approved = await service.approve('r1', 'hr-1', 'Receipt verified.');
      expect(approved.status).toBe('approved');
      expect(approved.decided_by).toBe('hr-1');
      expect(approved.decision_note).toBe('Receipt verified.');

      // Approving again — or rejecting after approval — must not move money.
      await expect(service.approve('r1', 'hr-1')).rejects.toThrow(
        /Only a pending claim/,
      );
      await expect(service.reject('r1', 'hr-1')).rejects.toThrow(
        /Only a pending claim/,
      );
    });

    it('refuses to edit or delete a paid claim', async () => {
      store = [claim({ status: 'paid', paid_payslip_id: 'payslip-9' })];

      await expect(service.update('r1', { amount: 99999 })).rejects.toThrow(
        /Only a pending claim can be edited/,
      );
      await expect(service.remove('r1')).rejects.toThrow(
        /recorded on a committed payslip/,
      );
    });

    it('withdraws only an own pending claim', async () => {
      store = [claim()];
      await expect(service.removeMine('emp-2', 'r1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.removeMine('emp-1', 'r1')).resolves.toMatchObject({
        message: expect.any(String),
      });

      store = [claim({ status: 'approved' })];
      await expect(service.removeMine('emp-1', 'r1')).rejects.toThrow(
        /Only a pending claim can be withdrawn/,
      );
    });
  });
});
