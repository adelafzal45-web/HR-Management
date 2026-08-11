import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { PayrollLoansService } from './payroll-loans.service';
import { EmployeeLoan, LoanInstallment } from './payroll-loans.entity';
import { PayrollNotifierService } from '../reimbursements/payroll-notifier.service';

/**
 * Loan request lifecycle (Phase 3, spec §3B: "loan apply from emp but limited
 * access"). The rule that matters for money: an employee-submitted request is
 * INERT — `pending` loans are filtered out by the engine — and only HR approval
 * flips it to `active` AND builds the repayment schedule. Approving twice would
 * rebuild a schedule payroll may already have deducted against, so the state
 * machine only ever accepts a decision from `pending`.
 *
 * Backed by in-memory repositories rather than a database: the behaviour under
 * test is the guard order and the generated schedule, not SQL.
 */
describe('PayrollLoansService — requests and approval', () => {
  let service: PayrollLoansService;
  let loans: EmployeeLoan[];
  let installments: LoanInstallment[];
  let notifier: { notifySubmitted: jest.Mock; notifyDecision: jest.Mock };
  let seq: number;

  const nextId = (prefix: string) => `${prefix}-${++seq}`;

  function loanRepo() {
    return {
      create: (data: Partial<EmployeeLoan>) =>
        ({ loan_id: nextId('loan'), ...data }) as EmployeeLoan,
      save: async (loan: EmployeeLoan) => {
        const at = loans.findIndex((l) => l.loan_id === loan.loan_id);
        if (at >= 0) loans[at] = loan;
        else loans.push(loan);
        return loan;
      },
      // `relations: { installments: true }` — hydrate from the sibling store.
      findOne: async ({ where }: { where: { loan_id: string } }) => {
        const loan = loans.find((l) => l.loan_id === where.loan_id);
        if (!loan) return null;
        loan.installments = installments.filter(
          (i) => i.loan_id === loan.loan_id,
        );
        return loan;
      },
      find: async () => loans,
      delete: async (id: string) => {
        loans = loans.filter((l) => l.loan_id !== id);
        return { affected: 1 };
      },
    } as unknown as Repository<EmployeeLoan>;
  }

  function installmentRepo() {
    return {
      create: (data: Partial<LoanInstallment>) => ({ ...data }) as LoanInstallment,
      save: async (rows: LoanInstallment | LoanInstallment[]) => {
        const list = Array.isArray(rows) ? rows : [rows];
        for (const row of list) {
          if (!row.installment_id) row.installment_id = nextId('inst');
          const at = installments.findIndex(
            (i) => i.installment_id === row.installment_id,
          );
          if (at >= 0) installments[at] = row;
          else installments.push(row);
        }
        return rows;
      },
      delete: async ({ loan_id }: { loan_id: string }) => {
        installments = installments.filter((i) => i.loan_id !== loan_id);
        return { affected: 1 };
      },
    } as unknown as Repository<LoanInstallment>;
  }

  beforeEach(() => {
    seq = 0;
    loans = [];
    installments = [];
    notifier = { notifySubmitted: jest.fn(), notifyDecision: jest.fn() };
    service = new PayrollLoansService(
      loanRepo(),
      installmentRepo(),
      notifier as unknown as PayrollNotifierService,
    );
  });

  const request = () =>
    service.createMine('emp-1', {
      name: 'Motorcycle advance',
      principal: 30000,
      requested_months: 3,
    });

  describe('createMine', () => {
    it('forces the token user, a pending status and no schedule', async () => {
      const loan = await request();

      expect(loan.user_id).toBe('emp-1');
      expect(loan.status).toBe('pending');
      // Nothing is scheduled yet — a request cannot deduct from payroll.
      expect(installments).toHaveLength(0);
      expect(loan.requested_at).toBeInstanceOf(Date);
      // The requested term only *suggests* an installment; HR sets the real one.
      expect(loan.installment_amount).toBe(10000);
      expect(notifier.notifySubmitted).toHaveBeenCalledWith(
        'loan',
        loan.loan_id,
        'emp-1',
        expect.stringContaining('Motorcycle advance'),
      );
    });

    it('ignores a client-supplied user_id and status', async () => {
      const loan = await service.createMine('emp-1', {
        name: 'Advance',
        principal: 5000,
        // A hostile client trying to file an active loan against someone else.
        user_id: 'emp-2',
        status: 'active',
      } as never);

      expect(loan.user_id).toBe('emp-1');
      expect(loan.status).toBe('pending');
    });

    it('rejects a non-positive principal', async () => {
      await expect(
        service.createMine('emp-1', { name: 'Nothing', principal: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('approveRequest', () => {
    it('activates the loan and generates the full schedule', async () => {
      const loan = await request();

      const approved = await service.approveRequest(loan.loan_id, 'hr-1', {
        installment_amount: 10000,
      });

      expect(approved.status).toBe('active');
      expect(approved.outstanding).toBe(30000);
      expect(approved.decided_by).toBe('hr-1');
      expect(approved.decided_at).toBeInstanceOf(Date);

      // 30000 at 10000 a period = three installments, balance walking to zero.
      expect(approved.installments.map((i) => i.amount)).toEqual([
        10000, 10000, 10000,
      ]);
      expect(approved.installments.map((i) => i.sequence)).toEqual([1, 2, 3]);
      expect(approved.installments.map((i) => i.balance_after)).toEqual([
        20000, 10000, 0,
      ]);
      expect(
        approved.installments.every((i) => i.status === 'scheduled'),
      ).toBe(true);
      // Sum of installments equals the principal exactly.
      expect(
        approved.installments.reduce((t, i) => t + Number(i.amount), 0),
      ).toBe(30000);

      expect(notifier.notifyDecision).toHaveBeenCalledWith(
        'loan',
        loan.loan_id,
        'emp-1',
        'approved',
        expect.any(String),
        undefined,
      );
    });

    it('lets the approver override the installment, absorbing the remainder', async () => {
      const loan = await request();

      const approved = await service.approveRequest(loan.loan_id, 'hr-1', {
        installment_amount: 12000,
        note: 'Repay over three months.',
      });

      // 12000 + 12000 + 6000 — the final installment takes the remainder.
      expect(approved.installments.map((i) => i.amount)).toEqual([
        12000, 12000, 6000,
      ]);
      expect(approved.decision_note).toBe('Repay over three months.');
    });

    it('only approves from pending — never re-schedules a live loan', async () => {
      const loan = await request();
      await service.approveRequest(loan.loan_id, 'hr-1', {});
      const scheduleBefore = installments.map((i) => i.installment_id);

      await expect(
        service.approveRequest(loan.loan_id, 'hr-1', {}),
      ).rejects.toThrow(/Only a pending request can be approved/);

      // The second attempt changed nothing.
      expect(installments.map((i) => i.installment_id)).toEqual(scheduleBefore);
    });

    it('refuses an installment larger than the principal', async () => {
      const loan = await request();

      await expect(
        service.approveRequest(loan.loan_id, 'hr-1', {
          installment_amount: 40000,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      // Still pending and still inert.
      expect(loans[0].status).toBe('pending');
      expect(installments).toHaveLength(0);
    });
  });

  describe('rejectRequest', () => {
    it('zeroes the balance and schedules nothing', async () => {
      const loan = await request();

      const rejected = await service.rejectRequest(
        loan.loan_id,
        'hr-1',
        'Existing advance still outstanding.',
      );

      expect(rejected.status).toBe('rejected');
      expect(rejected.outstanding).toBe(0);
      expect(rejected.decision_note).toBe(
        'Existing advance still outstanding.',
      );
      expect(installments).toHaveLength(0);
      expect(notifier.notifyDecision).toHaveBeenCalledWith(
        'loan',
        loan.loan_id,
        'emp-1',
        'rejected',
        expect.any(String),
        'Existing advance still outstanding.',
      );
    });

    it('cannot reject an already-approved loan', async () => {
      const loan = await request();
      await service.approveRequest(loan.loan_id, 'hr-1', {});

      await expect(service.rejectRequest(loan.loan_id, 'hr-1')).rejects.toThrow(
        /Only a pending request can be rejected/,
      );
    });
  });

  describe('inertness of an undecided request', () => {
    // The engine reads loans with `status: 'active'` only. Rather than trust
    // that, assert the deduction resolver itself reports nothing for a request
    // that has not been approved — this is what keeps a submitted request from
    // silently reducing someone's pay.
    it('resolves no deduction for a pending or rejected request', async () => {
      const pending = await request();
      expect(await service.resolveDeduction('emp-1', 'period-1')).toEqual({
        amount: 0,
        lines: [],
      });

      await service.rejectRequest(pending.loan_id, 'hr-1');
      expect(await service.resolveDeduction('emp-1', 'period-1')).toEqual({
        amount: 0,
        lines: [],
      });
    });

    it('resolves the first installment once approved', async () => {
      const loan = await request();
      await service.approveRequest(loan.loan_id, 'hr-1', {
        installment_amount: 10000,
      });

      const resolved = await service.resolveDeduction('emp-1', 'period-1');
      expect(resolved.amount).toBe(10000);
      expect(resolved.lines[0]).toMatchObject({
        loan_id: loan.loan_id,
        loan_name: 'Motorcycle advance',
        amount: 10000,
        outstanding_before: 30000,
        outstanding_after: 20000,
      });
    });
  });

  describe('withdrawing a request', () => {
    it('is allowed while pending and blocked once approved', async () => {
      const first = await request();
      await expect(
        service.removeMine('emp-1', first.loan_id),
      ).resolves.toMatchObject({ message: expect.any(String) });

      const second = await request();
      await service.approveRequest(second.loan_id, 'hr-1', {});
      await expect(
        service.removeMine('emp-1', second.loan_id),
      ).rejects.toThrow(/Only a pending request can be withdrawn/);
    });

    it('reports someone else’s loan as not found, not forbidden', async () => {
      const loan = await request();
      // A 404 keeps the existence of a colleague's loan private.
      await expect(service.removeMine('emp-2', loan.loan_id)).rejects.toThrow(
        /not found/,
      );
    });
  });
});
