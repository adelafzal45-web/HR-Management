import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FindOperator } from 'typeorm';

import { NotificationsService } from './notifications.service';
import {
  Notification,
  NotificationAudienceType,
  NotificationCategory,
} from './notifications.entity';
import { User } from '../users/user.entity';

/**
 * In-memory fakes, in the style of meetings.service.spec.ts: plain classes
 * wired straight into the constructor rather than a Nest testing module, since
 * none of this logic needs the DI container.
 *
 * The behaviour worth covering is audience resolution and fan-out. A mistake
 * there sends a notice to people who should never have seen it — and the
 * previous implementation did exactly that, saving one unaddressed row that
 * every employee's bell picked up regardless of intent. So the assertions are
 * written as "who received a row", not "was something saved".
 */
class FakeNotificationRepo {
  rows: Notification[] = [];
  private sequence = 0;

  create(partial: Partial<Notification>): Notification {
    return { ...partial } as Notification;
  }

  // The service saves an array inside the transaction and single rows elsewhere.
  async save(
    input: Notification | Notification[],
  ): Promise<Notification | Notification[]> {
    const many = Array.isArray(input) ? input : [input];
    for (const row of many) {
      if (!row.notification_id) {
        this.sequence += 1;
        row.notification_id = `n-${this.sequence}`;
        // The entity maps `recipient` (relation) and `recipient_id` (column);
        // real TypeORM derives the latter on save.
        row.recipient_id = row.recipient?.user_id ?? row.recipient_id ?? null;
        this.rows.push(row);
      } else {
        const idx = this.rows.findIndex(
          (r) => r.notification_id === row.notification_id,
        );
        if (idx >= 0) this.rows[idx] = row;
        else this.rows.push(row);
      }
    }
    return input;
  }

  async findOne({
    where,
  }: {
    where: Record<string, any>;
  }): Promise<Notification | null> {
    return (
      this.rows.find((r) => r.notification_id === where.notification_id) ?? null
    );
  }

  async count({ where }: { where: Record<string, any> }): Promise<number> {
    return this.rows.filter((r) => {
      if (where.recipient_id !== undefined && r.recipient_id !== where.recipient_id) {
        return false;
      }
      // `IsNull()` arrives as a FindOperator; the only null check here is read_at.
      if (where.read_at instanceof FindOperator) return !r.read_at;
      return true;
    }).length;
  }

  async update(
    where: Record<string, any>,
    changes: Partial<Notification>,
  ): Promise<{ affected: number }> {
    const matched = this.rows.filter((r) => this.matches(r, where));
    matched.forEach((r) => Object.assign(r, changes));
    return { affected: matched.length };
  }

  async delete(where: Record<string, any>): Promise<{ affected: number }> {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !this.matches(r, where));
    return { affected: before - this.rows.length };
  }

  private matches(row: Notification, where: Record<string, any>): boolean {
    if (where.batch_id !== undefined) return row.batch_id === where.batch_id;
    if (where.notification_id !== undefined) {
      return row.notification_id === where.notification_id;
    }
    return false;
  }

  /**
   * Backs the grouped Sent view, `findForUser`'s list, and `markAllRead`'s bulk
   * UPDATE. The grouped SQL itself is exercised against real Postgres
   * (min(uuid) has no aggregate, a class of bug no fake can catch); here the
   * fake reproduces the grouping so the counting and batch-scoping logic
   * around it can be asserted.
   */
  createQueryBuilder(_alias?: string) {
    let batchFilter: string | undefined;
    let userFilter: string | undefined;
    let unreadOnly = false;
    let limit = Infinity;
    let isUpdate = false;
    let assignments: Record<string, any> = {};
    const self = this;

    const chain: any = {
      leftJoin: () => chain,
      select: () => chain,
      addSelect: () => chain,
      groupBy: () => chain,
      addGroupBy: () => chain,
      orderBy: () => chain,
      take: (n: number) => {
        limit = n;
        return chain;
      },
      where: (sql: string, params: Record<string, any> = {}) => {
        if (params.userId) userFilter = params.userId;
        if (sql.includes('read_at IS NULL')) unreadOnly = true;
        return chain;
      },
      andWhere: (sql: string, params: Record<string, any> = {}) => {
        if (params.batchId) batchFilter = params.batchId;
        if (sql.includes('read_at IS NULL')) unreadOnly = true;
        return chain;
      },

      update: () => {
        isUpdate = true;
        return chain;
      },
      set: (values: Record<string, any>) => {
        assignments = values;
        return chain;
      },

      // markAllRead. Its `where` is a single string covering both the recipient
      // and the unread check, so both filters are read off it — an UPDATE that
      // ignored either would mark somebody else's rows read, or rewrite a
      // `read_at` the user set days ago.
      execute: async () => {
        if (!isUpdate) throw new Error('execute() called on a non-UPDATE chain');
        const matched = self.rows.filter(
          (r) => r.recipient_id === userFilter && (!unreadOnly || !r.read_at),
        );
        for (const row of matched) {
          for (const [column, value] of Object.entries(assignments)) {
            // `set({ read_at: () => 'CURRENT_TIMESTAMP' })` passes a function so
            // pg evaluates it; the fake stands in a real Date for it.
            (row as any)[column] = typeof value === 'function' ? new Date() : value;
          }
        }
        return { affected: matched.length };
      },

      // findForUser: addressed rows plus legacy unaddressed ones.
      getMany: async () =>
        self.rows
          .filter(
            (r) =>
              (r.recipient_id === userFilter || r.recipient_id == null) &&
              (!unreadOnly || !r.read_at),
          )
          .slice(0, limit),

      getRawMany: async () => self.group(batchFilter),
      getRawOne: async () => self.group(batchFilter)[0] ?? undefined,
    };
    return chain;
  }

  /** The grouping the Sent-view SQL performs, in JS. */
  private group(batchFilter?: string) {
    const buckets = new Map<string, Notification[]>();
    for (const row of this.rows) {
      if (batchFilter && row.batch_id !== batchFilter) continue;
      const key = row.batch_id ?? row.notification_id;
      const bucket = buckets.get(key) ?? [];
      bucket.push(row);
      buckets.set(key, bucket);
    }

    return [...buckets.values()].map((bucket) => {
      const first = bucket[0];
      return {
        notification_id: first.notification_id,
        batch_id: first.batch_id ?? null,
        title: first.title,
        message: first.message,
        category: first.category,
        audience_type: first.audience_type,
        audience_department_id: first.audience_department_id ?? null,
        audience_department_name: null,
        attachment_url: first.attachment_url ?? null,
        attachment_name: first.attachment_name ?? null,
        attachment_mime: first.attachment_mime ?? null,
        // pg returns integers from an aggregate as strings too.
        attachment_size:
          first.attachment_size == null ? null : String(first.attachment_size),
        // pg returns COUNT as a string; normalizeSummary must cast it.
        recipient_count: String(bucket.length),
        read_count: String(bucket.filter((r) => r.read_at).length),
        created_at: first.created_at ?? new Date(),
        created_by_id: first.createdBy?.user_id ?? null,
        created_by_name: null,
      } as any;
    });
  }
}

class FakeUserRepo {
  constructor(public rows: User[] = []) {}

  async find(
    { where }: { where: Record<string, any> } = { where: {} },
  ): Promise<User[]> {
    return this.rows.filter((r) => {
      if (where.status !== undefined && r.status !== where.status) return false;
      // `In([...])` arrives as a FindOperator carrying the array in `.value`.
      if (where.user_id instanceof FindOperator) {
        return (where.user_id.value as string[]).includes(r.user_id);
      }
      if (typeof where.user_id === 'string') return r.user_id === where.user_id;
      return true;
    });
  }

  async findOne({
    where,
  }: {
    where: Record<string, any>;
  }): Promise<User | null> {
    return this.rows.find((r) => r.user_id === where.user_id) ?? null;
  }

  /**
   * The DEPARTMENT branch joins `user.department` (User has no scalar
   * department_id), so the chain is faked rather than the where-object.
   */
  createQueryBuilder() {
    let departmentId: string | undefined;
    const chain: any = {
      leftJoin: () => chain,
      where: (_sql: string, params: Record<string, any>) => {
        departmentId = params.departmentId;
        return chain;
      },
      andWhere: () => chain,
      getMany: async () =>
        this.rows.filter(
          (r) =>
            r.status === true && r.department?.department_id === departmentId,
        ),
    };
    return chain;
  }
}

function user(id: string, overrides: Partial<User> = {}): User {
  return {
    user_id: id,
    first_name: 'Test',
    last_name: id,
    email: `${id}@example.com`,
    status: true,
    ...overrides,
  } as User;
}

describe('NotificationsService', () => {
  function make(users: User[] = []) {
    const notificationRepo = new FakeNotificationRepo();
    const userRepo = new FakeUserRepo(users);

    // The service resolves the repository off the transaction's manager, so
    // the fake hands back the same instance the assertions inspect.
    const dataSource = {
      transaction: async (cb: (manager: any) => Promise<any>) =>
        cb({ getRepository: () => notificationRepo }),
    };

    const service = new NotificationsService(
      notificationRepo as any,
      userRepo as any,
      dataSource as any,
    );

    return { service, notificationRepo, userRepo };
  }

  const baseDto = {
    title: 'Company Holiday',
    message: 'Office closed on Friday.',
    audience_type: NotificationAudienceType.SPECIFIC,
    recipient_ids: ['u-2'],
  };

  /** Who actually holds a row — the only question that matters here. */
  const recipientsOf = (repo: FakeNotificationRepo) =>
    repo.rows.map((r) => r.recipient_id).sort();

  describe('audience resolution', () => {
    it('delivers to exactly the selected people for a Specific audience', async () => {
      const { service, notificationRepo } = make([
        user('u-1'),
        user('u-2'),
        user('u-3'),
      ]);

      await service.create({ ...baseDto } as any, 'u-1');

      expect(recipientsOf(notificationRepo)).toEqual(['u-2']);
    });

    it('does not append the sender to a Specific audience', async () => {
      const { service, notificationRepo } = make([user('u-1'), user('u-2')]);

      await service.create({ ...baseDto } as any, 'u-1');

      // Unlike a meeting organizer, an author is not added to their own
      // audience — it would light the badge on every send.
      expect(recipientsOf(notificationRepo)).not.toContain('u-1');
    });

    it('resolves a Department audience to that department’s active employees only', async () => {
      const engineering = { department_id: 'd-1' } as any;
      const sales = { department_id: 'd-2' } as any;
      const { service, notificationRepo } = make([
        user('u-1', { department: sales }),
        user('u-2', { department: engineering }),
        user('u-3', { department: engineering }),
        user('u-4', { department: engineering, status: false }),
      ]);

      await service.create(
        {
          ...baseDto,
          audience_type: NotificationAudienceType.DEPARTMENT,
          audience_department_id: 'd-1',
          recipient_ids: undefined,
        } as any,
        'u-1',
      );

      // u-4 is inactive. u-1 is in Sales, so the Engineering audience misses
      // them — not because they sent it, but because they aren't in it.
      expect(recipientsOf(notificationRepo)).toEqual(['u-2', 'u-3']);
    });

    it('records the department so the audience survives a later transfer', async () => {
      const engineering = { department_id: 'd-1' } as any;
      const { service, notificationRepo } = make([
        user('u-1'),
        user('u-2', { department: engineering }),
      ]);

      await service.create(
        {
          ...baseDto,
          audience_type: NotificationAudienceType.DEPARTMENT,
          audience_department_id: 'd-1',
          recipient_ids: undefined,
        } as any,
        'u-1',
      );

      expect(notificationRepo.rows[0].audience_department_id).toBe('d-1');
    });

    it('resolves an All audience to every active employee', async () => {
      const { service, notificationRepo } = make([
        user('u-1'),
        user('u-2'),
        user('u-3'),
        user('u-4', { status: false }),
      ]);

      await service.create(
        {
          ...baseDto,
          audience_type: NotificationAudienceType.ALL,
          recipient_ids: undefined,
        } as any,
        'u-1',
      );

      // The audience is literal: the sender is part of "everyone", so they get
      // a row like anybody else. u-4 is inactive and gets nothing.
      expect(recipientsOf(notificationRepo)).toEqual(['u-1', 'u-2', 'u-3']);
    });

    it('does not carry a department id on a non-Department audience', async () => {
      const { service, notificationRepo } = make([user('u-1'), user('u-2')]);

      await service.create(
        { ...baseDto, audience_department_id: 'd-1' } as any,
        'u-1',
      );

      // A stray id would make the Sent view read as if it had been targeted.
      expect(notificationRepo.rows[0].audience_department_id).toBeNull();
    });
  });

  describe('rejected audiences write nothing', () => {
    it('rejects a Specific audience with no ids', async () => {
      const { service, notificationRepo } = make([user('u-1'), user('u-2')]);

      await expect(
        service.create({ ...baseDto, recipient_ids: [] } as any, 'u-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(notificationRepo.rows).toHaveLength(0);
    });

    it('rejects a Specific audience where every selected employee is inactive', async () => {
      const { service, notificationRepo } = make([
        user('u-1'),
        user('u-2', { status: false }),
      ]);

      await expect(
        service.create({ ...baseDto, recipient_ids: ['u-2'] } as any, 'u-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(notificationRepo.rows).toHaveLength(0);
    });

    it('rejects a Department with no active employees', async () => {
      const engineering = { department_id: 'd-1' } as any;
      const { service, notificationRepo } = make([
        user('u-1'),
        user('u-2', { department: engineering, status: false }),
      ]);

      await expect(
        service.create(
          {
            ...baseDto,
            audience_type: NotificationAudienceType.DEPARTMENT,
            audience_department_id: 'd-1',
            recipient_ids: undefined,
          } as any,
          'u-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(notificationRepo.rows).toHaveLength(0);
    });

    it('rejects an unknown author', async () => {
      const { service, notificationRepo } = make([user('u-2')]);

      await expect(
        service.create({ ...baseDto } as any, 'ghost'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(notificationRepo.rows).toHaveLength(0);
    });
  });

  describe('composition', () => {
    it('persists the chosen category', async () => {
      const { service, notificationRepo } = make([user('u-1'), user('u-2')]);

      await service.create(
        { ...baseDto, category: NotificationCategory.PAYROLL } as any,
        'u-1',
      );

      // Guards the dropped-type bug: the DTO used to accept a free-text `type`
      // that create() never assigned, so every row came back as General.
      expect(notificationRepo.rows[0].category).toBe(
        NotificationCategory.PAYROLL,
      );
    });

    it('defaults the category to General when none is chosen', async () => {
      const { service, notificationRepo } = make([user('u-1'), user('u-2')]);

      await service.create({ ...baseDto } as any, 'u-1');

      expect(notificationRepo.rows[0].category).toBe(
        NotificationCategory.GENERAL,
      );
    });

    it('gives every row of one send the same batch id', async () => {
      const { service, notificationRepo } = make([
        user('u-1'),
        user('u-2'),
        user('u-3'),
      ]);

      await service.create(
        { ...baseDto, recipient_ids: ['u-2', 'u-3'] } as any,
        'u-1',
      );

      const batches = new Set(notificationRepo.rows.map((r) => r.batch_id));
      expect(batches.size).toBe(1);
      expect([...batches][0]).toBeTruthy();
    });

    it('attributes the author from the caller, not the body', async () => {
      const { service, notificationRepo } = make([user('u-1'), user('u-2')]);

      await service.create(
        { ...baseDto, createdBy: 'u-2' } as any,
        'u-1',
      );

      expect(notificationRepo.rows[0].createdBy?.user_id).toBe('u-1');
    });

    it('trims the title and message', async () => {
      const { service, notificationRepo } = make([user('u-1'), user('u-2')]);

      await service.create(
        { ...baseDto, title: '  Padded  ', message: '  Body  ' } as any,
        'u-1',
      );

      expect(notificationRepo.rows[0].title).toBe('Padded');
      expect(notificationRepo.rows[0].message).toBe('Body');
    });
  });

  /**
   * The attachment is optional, so the no-attachment path is the real
   * regression risk and is covered first. The rest guard the two ways an
   * attachment can go wrong: reaching only some of the recipients, or naming a
   * file this server never issued.
   */
  describe('attachments', () => {
    const attached = {
      attachment_url: '/uploads/notification-attachments/abc-123.pdf',
      attachment_name: 'holiday-policy-2026.pdf',
      attachment_mime: 'application/pdf',
      attachment_size: 248193,
    };

    it('sends with no attachment, leaving all four columns null', async () => {
      const { service, notificationRepo } = make([user('u-1'), user('u-2')]);

      await service.create({ ...baseDto } as any, 'u-1');

      const row = notificationRepo.rows[0];
      expect(row.attachment_url).toBeNull();
      expect(row.attachment_name).toBeNull();
      expect(row.attachment_mime).toBeNull();
      expect(row.attachment_size).toBeNull();
    });

    it('copies the attachment onto every fan-out row, not just the first', async () => {
      const { service, notificationRepo } = make([
        user('u-1'),
        user('u-2'),
        user('u-3'),
        user('u-4'),
      ]);

      await service.create(
        { ...baseDto, ...attached, recipient_ids: ['u-2', 'u-3', 'u-4'] } as any,
        'u-1',
      );

      // Each recipient reads their own row. An attachment written to only one
      // of them is an announcement the other two can't open.
      expect(notificationRepo.rows).toHaveLength(3);
      expect(
        notificationRepo.rows.every(
          (r) => r.attachment_url === attached.attachment_url,
        ),
      ).toBe(true);
      expect(
        notificationRepo.rows.every(
          (r) => r.attachment_name === attached.attachment_name,
        ),
      ).toBe(true);
    });

    it('rejects an attachment url this server did not issue', async () => {
      const { service, notificationRepo } = make([user('u-1'), user('u-2')]);

      await expect(
        service.create(
          {
            ...baseDto,
            ...attached,
            attachment_url: 'https://evil.example.com/invoice.pdf',
          } as any,
          'u-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      // The field is echoed back by the client, so without this check a sender
      // could point every recipient at a download of their choosing under the
      // company's name.
      expect(notificationRepo.rows).toHaveLength(0);
    });

    it('rejects a traversal attempt dressed as the upload prefix', async () => {
      const { service } = make([user('u-1'), user('u-2')]);

      await expect(
        service.create(
          {
            ...baseDto,
            ...attached,
            attachment_url: '/uploads/notification-attachmentsevil.com/x.pdf',
          } as any,
          'u-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('falls back to a generic filename rather than an empty download prompt', async () => {
      const { service, notificationRepo } = make([user('u-1'), user('u-2')]);

      await service.create(
        { ...baseDto, ...attached, attachment_name: '   ' } as any,
        'u-1',
      );

      expect(notificationRepo.rows[0].attachment_name).toBe('attachment');
    });

    it('surfaces the attachment on the Sent view, with size as a number', async () => {
      const { service } = make([user('u-1'), user('u-2'), user('u-3')]);

      await service.create(
        { ...baseDto, ...attached, recipient_ids: ['u-2', 'u-3'] } as any,
        'u-1',
      );

      const [summary] = await service.findAll();
      expect(summary.attachment_url).toBe(attached.attachment_url);
      expect(summary.attachment_size).toBe(248193);
      expect(typeof summary.attachment_size).toBe('number');
    });

    it('reports no size for a notification without an attachment', async () => {
      const { service } = make([user('u-1'), user('u-2')]);
      await service.create({ ...baseDto } as any, 'u-1');

      const [summary] = await service.findAll();

      // Not 0 — that reads as an empty file rather than no file at all.
      expect(summary.attachment_size).toBeNull();
    });
  });

  describe('per-user read state', () => {
    it('marks one recipient’s copy read and leaves the others unread', async () => {
      const { service, notificationRepo } = make([
        user('u-1'),
        user('u-2'),
        user('u-3'),
      ]);
      await service.create(
        { ...baseDto, recipient_ids: ['u-2', 'u-3'] } as any,
        'u-1',
      );

      const forU2 = notificationRepo.rows.find((r) => r.recipient_id === 'u-2')!;
      await service.markRead(forU2.notification_id, 'u-2');

      expect(
        notificationRepo.rows.find((r) => r.recipient_id === 'u-2')!.read_at,
      ).toBeTruthy();
      // This is the whole point of fan-out: one shared row would have marked
      // it read for everybody at once.
      expect(
        notificationRepo.rows.find((r) => r.recipient_id === 'u-3')!.read_at,
      ).toBeFalsy();
    });

    it('refuses to mark another user’s copy read', async () => {
      const { service, notificationRepo } = make([user('u-1'), user('u-2')]);
      await service.create({ ...baseDto } as any, 'u-1');
      const row = notificationRepo.rows[0];

      await expect(
        service.markRead(row.notification_id, 'u-3'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(row.read_at).toBeFalsy();
    });

    it('leaves a legacy unaddressed row untouched', async () => {
      const { service, notificationRepo } = make([user('u-1')]);
      await notificationRepo.save({
        title: 'Legacy broadcast',
        message: 'From before targeting',
        recipient_id: null,
      } as any);

      const row = notificationRepo.rows[0];
      await service.markRead(row.notification_id, 'u-1');

      // Its single `read_at` is shared by the whole company, so writing it
      // would mark the notice read for everyone.
      expect(row.read_at).toBeFalsy();
    });

    it('counts only unread rows addressed to the caller', async () => {
      const { service, notificationRepo } = make([
        user('u-1'),
        user('u-2'),
        user('u-3'),
      ]);
      await service.create(
        { ...baseDto, recipient_ids: ['u-2', 'u-3'] } as any,
        'u-1',
      );
      await notificationRepo.save({
        title: 'Legacy broadcast',
        message: 'From before targeting',
        recipient_id: null,
      } as any);

      const { unread } = await service.findForUser('u-2');

      // One addressed row. The legacy row is excluded: it has no per-user read
      // state, so counting it would pin the badge at a number u-2 can't clear.
      expect(unread).toBe(1);
    });

    it('markAllRead only touches the caller’s unread rows', async () => {
      const { service, notificationRepo } = make([
        user('u-1'),
        user('u-2'),
        user('u-3'),
      ]);
      await service.create(
        { ...baseDto, recipient_ids: ['u-2', 'u-3'] } as any,
        'u-1',
      );

      await service.markAllRead('u-2');

      expect((await service.findForUser('u-2')).unread).toBe(0);
      expect((await service.findForUser('u-3')).unread).toBe(1);
    });
  });

  describe('the Sent view', () => {
    it('collapses a fanned-out batch into one entry with the right counts', async () => {
      const { service, notificationRepo } = make([
        user('u-1'),
        user('u-2'),
        user('u-3'),
      ]);
      await service.create(
        { ...baseDto, recipient_ids: ['u-2', 'u-3'] } as any,
        'u-1',
      );

      const forU2 = notificationRepo.rows.find((r) => r.recipient_id === 'u-2')!;
      await service.markRead(forU2.notification_id, 'u-2');

      const sent = await service.findAll();

      expect(sent).toHaveLength(1);
      expect(sent[0].recipient_count).toBe(2);
      expect(sent[0].read_count).toBe(1);
    });

    it('returns counts as numbers, not the strings pg hands back', async () => {
      const { service } = make([user('u-1'), user('u-2')]);
      await service.create({ ...baseDto } as any, 'u-1');

      const [summary] = await service.findAll();

      expect(typeof summary.recipient_count).toBe('number');
      expect(typeof summary.read_count).toBe('number');
    });

    it('keeps separate sends as separate entries', async () => {
      const { service } = make([user('u-1'), user('u-2')]);
      await service.create({ ...baseDto } as any, 'u-1');
      await service.create({ ...baseDto, title: 'Second' } as any, 'u-1');

      expect(await service.findAll()).toHaveLength(2);
    });

    it('reports the audience the sender chose', async () => {
      const { service } = make([user('u-1'), user('u-2')]);
      await service.create(
        {
          ...baseDto,
          audience_type: NotificationAudienceType.ALL,
          recipient_ids: undefined,
        } as any,
        'u-1',
      );

      const [summary] = await service.findAll();
      expect(summary.audience_type).toBe(NotificationAudienceType.ALL);
    });
  });

  describe('edit and delete act on the batch', () => {
    it('edits every recipient’s copy', async () => {
      const { service, notificationRepo } = make([
        user('u-1'),
        user('u-2'),
        user('u-3'),
      ]);
      await service.create(
        { ...baseDto, recipient_ids: ['u-2', 'u-3'] } as any,
        'u-1',
      );

      await service.update(notificationRepo.rows[0].notification_id, {
        title: 'Corrected',
      } as any);

      // Fixing a typo for one of forty recipients is never what was meant.
      expect(notificationRepo.rows.every((r) => r.title === 'Corrected')).toBe(
        true,
      );
    });

    it('does not touch a different send', async () => {
      const { service, notificationRepo } = make([user('u-1'), user('u-2')]);
      await service.create({ ...baseDto } as any, 'u-1');
      await service.create({ ...baseDto, title: 'Other' } as any, 'u-1');

      await service.update(notificationRepo.rows[0].notification_id, {
        title: 'Corrected',
      } as any);

      expect(notificationRepo.rows[1].title).toBe('Other');
    });

    it('deletes every recipient’s copy and reports how many', async () => {
      const { service, notificationRepo } = make([
        user('u-1'),
        user('u-2'),
        user('u-3'),
      ]);
      await service.create(
        { ...baseDto, recipient_ids: ['u-2', 'u-3'] } as any,
        'u-1',
      );

      const result = await service.remove(
        notificationRepo.rows[0].notification_id,
      );

      expect(result.deleted).toBe(2);
      expect(notificationRepo.rows).toHaveLength(0);
    });

    it('scopes a legacy row without a batch to itself', async () => {
      const { service, notificationRepo } = make([user('u-1')]);
      await notificationRepo.save({
        title: 'Legacy one',
        message: 'x',
        recipient_id: null,
      } as any);
      await notificationRepo.save({
        title: 'Legacy two',
        message: 'x',
        recipient_id: null,
      } as any);

      await service.remove(notificationRepo.rows[0].notification_id);

      // Both have a null batch_id; scoping by batch would delete both.
      expect(notificationRepo.rows).toHaveLength(1);
      expect(notificationRepo.rows[0].title).toBe('Legacy two');
    });
  });
});
