import { ConflictException, NotFoundException } from '@nestjs/common';
import { FindOperator } from 'typeorm';

import { HolidaysService } from './holidays.service';
import { Holiday } from './holiday.entity';

/**
 * In-memory fake for the holiday repository. Only the methods the duplicate
 * logic actually exercises are modelled — `find` (the candidate scan, keyed on
 * department scope), `create`, `save`, and `findOne` (used by `update` via
 * `findOne`). `department_id` may arrive as a literal string, `null`, or an
 * `IsNull()` FindOperator (the company-wide scope), so `find` resolves all
 * three the way TypeORM would.
 */
class FakeHolidayRepo {
  rows: Holiday[] = [];

  constructor(seed: Holiday[] = []) {
    this.rows = seed;
  }

  create(partial: Partial<Holiday>): Holiday {
    return { ...partial } as Holiday;
  }

  async save(entity: Holiday): Promise<Holiday> {
    if (!entity.holiday_id) {
      entity.holiday_id = `h-${this.rows.length + 1}`;
    }
    const idx = this.rows.findIndex((r) => r.holiday_id === entity.holiday_id);
    if (idx >= 0) this.rows[idx] = entity;
    else this.rows.push(entity);
    return entity;
  }

  async findOne({ where }: { where: Record<string, any> }): Promise<Holiday | null> {
    return this.rows.find((r) => r.holiday_id === where.holiday_id) ?? null;
  }

  async find({ where }: { where: Record<string, any> }): Promise<Holiday[]> {
    const scope = where.department_id;
    return this.rows.filter((r) => {
      if (scope instanceof FindOperator) {
        // IsNull() — company-wide scope
        return r.department_id == null;
      }
      return r.department_id === scope;
    });
  }

  async delete(id: string): Promise<void> {
    this.rows = this.rows.filter((r) => r.holiday_id !== id);
  }
}

function holiday(overrides: Partial<Holiday>): Holiday {
  return {
    holiday_id: overrides.holiday_id ?? `seed-${Math.random().toString(36).slice(2, 7)}`,
    name: overrides.name ?? 'Seeded',
    holiday_date: overrides.holiday_date ?? new Date('2026-01-01'),
    department_id: overrides.department_id ?? null,
    is_recurring: overrides.is_recurring ?? false,
  } as Holiday;
}

describe('HolidaysService — duplicate prevention', () => {
  function make(seed: Holiday[] = []) {
    const repo = new FakeHolidayRepo(seed);
    const service = new HolidaysService(repo as any);
    return { repo, service };
  }

  it('allows a fresh company-wide holiday when no collision exists', async () => {
    const { service, repo } = make();
    await service.create({ name: 'New Year', holiday_date: '2026-01-01' } as any);
    expect(repo.rows).toHaveLength(1);
  });

  it('rejects a second fixed holiday on the same exact date and scope', async () => {
    const { service } = make([
      holiday({ holiday_date: new Date('2026-01-01'), is_recurring: false }),
    ]);
    await expect(
      service.create({ name: 'Dup', holiday_date: '2026-01-01' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows the same month/day in a different year for two fixed holidays', async () => {
    const { service, repo } = make([
      holiday({ holiday_date: new Date('2025-01-01'), is_recurring: false }),
    ]);
    await service.create({ name: 'NY 2026', holiday_date: '2026-01-01' } as any);
    expect(repo.rows).toHaveLength(2);
  });

  it('treats a recurring holiday as colliding on month/day across any year', async () => {
    const { service } = make([
      holiday({ holiday_date: new Date('2025-01-01'), is_recurring: true }),
    ]);
    await expect(
      service.create({ name: 'NY 2026', holiday_date: '2026-01-01' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('scopes duplicates by department — company-wide and department entries can coexist on the same day', async () => {
    const { service, repo } = make([
      holiday({ holiday_date: new Date('2026-05-01'), department_id: null }),
    ]);
    await service.create({
      name: 'Regional',
      holiday_date: '2026-05-01',
      department_id: 'dept-1',
    } as any);
    expect(repo.rows).toHaveLength(2);
  });

  it('does not treat a holiday as colliding with itself on update', async () => {
    const existing = holiday({
      holiday_id: 'h-1',
      holiday_date: new Date('2026-01-01'),
      name: 'New Year',
    });
    const { service } = make([existing]);
    const updated = await service.update('h-1', { name: 'New Year Renamed' } as any);
    expect(updated.name).toBe('New Year Renamed');
  });

  it('rejects an update that moves a holiday onto another holiday date/scope', async () => {
    const { service } = make([
      holiday({ holiday_id: 'h-1', holiday_date: new Date('2026-01-01') }),
      holiday({ holiday_id: 'h-2', holiday_date: new Date('2026-12-25') }),
    ]);
    await expect(
      service.update('h-2', { holiday_date: '2026-01-01' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws NotFoundException updating an unknown id', async () => {
    const { service } = make();
    await expect(
      service.update('missing', { name: 'x' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
