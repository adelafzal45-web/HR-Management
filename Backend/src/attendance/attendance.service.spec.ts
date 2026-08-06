import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { AttendanceService } from './attendance.service';
import { ATTENDANCE_STATUSES } from './attendance-status';

/**
 * Covers the cross-field rules added when attendance validation was tightened.
 *
 * These are driven through the public methods with hand-rolled repository
 * doubles rather than through a Nest testing module: the service pulls in
 * `PerformanceReviewService` through a `forwardRef`, and standing that up would
 * test the DI wiring rather than the rules. What matters here is which
 * combinations of status, stamps and hours the service refuses.
 */
describe('AttendanceService validation', () => {
  const EVENING_SHIFT = {
    shift_id: 'shift-1',
    shift_name: 'Evening Shift',
    start_time: '14:00:00',
    end_time: '22:00:00',
    grace_period_minutes: 15,
    break_duration_minutes: 60,
  };

  const NIGHT_SHIFT = {
    ...EVENING_SHIFT,
    start_time: '22:00:00',
    end_time: '06:00:00',
  };

  let attendanceRows: any[];
  let userRow: any;
  let service: AttendanceService;

  /** Yesterday, so tests never depend on today's working-day schedule. */
  const pastDate = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  beforeEach(() => {
    attendanceRows = [];
    userRow = {
      user_id: 'user-1',
      status: true,
      department: { department_id: 'dept-1' },
      designation: { designation_id: 'desig-1' },
      shift: { ...EVENING_SHIFT },
    };

    const attendanceRepository: any = {
      create: (data: any) => ({ ...data }),
      save: jest.fn((row: any) =>
        Promise.resolve({ attendance_id: 'att-1', ...row }),
      ),
      findOne: jest.fn(() => Promise.resolve(attendanceRows[0] ?? null)),
      createQueryBuilder: () => ({
        leftJoin: function () {
          return this;
        },
        where: function () {
          return this;
        },
        andWhere: function () {
          return this;
        },
        getOne: () => Promise.resolve(attendanceRows[0] ?? null),
      }),
    };

    const userRepository: any = {
      findOne: jest.fn(() => Promise.resolve(userRow)),
    };

    const performanceReviewService: any = {
      createAbsentReview: jest.fn(() => Promise.resolve()),
    };

    // Every day is a working day unless a test says otherwise, so the working
    // day ladder never decides the outcome of a rule being tested here.
    const workingDaySchedules: any = {
      isWorkingDay: jest.fn(() => Promise.resolve(true)),
      resolveWeek: jest.fn(() =>
        Promise.resolve({
          days: {
            1: true,
            2: true,
            3: true,
            4: true,
            5: true,
            6: true,
            7: true,
          },
        }),
      ),
    };

    service = new AttendanceService(
      attendanceRepository,
      userRepository,
      performanceReviewService,
      workingDaySchedules,
    );
  });

  const create = (overrides: Record<string, unknown> = {}) =>
    service.create(
      {
        attendance_date: pastDate() as unknown as Date,
        attendance_status: 'Present',
        check_in: '14:05:00',
        ...overrides,
      } as any,
      'user-1',
    );

  describe('status vocabulary', () => {
    it('accepts every status in the allow-list', () => {
      expect(ATTENDANCE_STATUSES).toContain('Present');
      expect(ATTENDANCE_STATUSES).toContain('Half-Day');
      expect(ATTENDANCE_STATUSES).toContain('Non-Working');
    });

    it('rejects a status outside the allow-list', async () => {
      await expect(
        create({ attendance_status: 'Pressent' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts a differently-cased spelling and stores the canonical one', async () => {
      const saved = await create({ attendance_status: 'present' });
      expect(saved.attendance_status).toBe('Present');
    });
  });

  describe('date rules', () => {
    it('refuses a record dated in the future', async () => {
      const future = new Date();
      future.setDate(future.getDate() + 1);
      const iso = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;

      await expect(create({ attendance_date: iso })).rejects.toThrow(
        /in the future/,
      );
    });

    it('allows today', async () => {
      await expect(create({ attendance_date: today() })).resolves.toBeDefined();
    });

    it('refuses a second record for the same date', async () => {
      attendanceRows = [{ attendance_id: 'existing' }];
      await expect(create()).rejects.toThrow(/already exists/);
    });
  });

  describe('status / stamp coherence', () => {
    it('refuses Present without a check-in', async () => {
      await expect(create({ check_in: undefined })).rejects.toThrow(
        /needs a check-in time/,
      );
    });

    it('refuses Half-Day without a check-in', async () => {
      await expect(
        create({ attendance_status: 'Half-Day', check_in: undefined }),
      ).rejects.toThrow(/needs a check-in time/);
    });

    it('refuses Absent with a check-in', async () => {
      await expect(
        create({ attendance_status: 'Absent', check_in: '14:05:00' }),
      ).rejects.toThrow(/cannot have a check-in time/);
    });

    it('refuses On Leave with a check-in', async () => {
      await expect(
        create({ attendance_status: 'On Leave', check_in: '14:05:00' }),
      ).rejects.toThrow(/cannot have a check-in time/);
    });

    it('allows Absent with no stamps at all', async () => {
      const saved = await create({
        attendance_status: 'Absent',
        check_in: undefined,
      });
      expect(saved.attendance_status).toBe('Absent');
      expect(saved.check_in).toBeUndefined();
    });

    it('refuses a check-out with no check-in', async () => {
      await expect(
        create({
          attendance_status: 'On Leave',
          check_in: undefined,
          check_out: '22:00:00',
        }),
      ).rejects.toThrow(/needs a check-in time to go with it/);
    });

    it('refuses a check-out identical to the check-in', async () => {
      await expect(
        create({ check_in: '14:05:00', check_out: '14:05:00' }),
      ).rejects.toThrow(/same time as check-in/);
    });
  });

  describe('hours', () => {
    it('derives working hours from the stamps, less the break', async () => {
      // 14:05 → 22:05 is 8h, less a 60-minute break = 7h.
      const saved = await create({
        check_in: '14:05:00',
        check_out: '22:05:00',
      });
      expect(saved.working_hours).toBe(7);
      expect(saved.overtime_hours).toBe(0);
      expect(saved.is_overtime).toBe(false);
    });

    it('ignores client-supplied hours when both stamps are present', async () => {
      const saved = await create({
        check_in: '14:05:00',
        check_out: '22:05:00',
        working_hours: 99,
        overtime_hours: 99,
      });
      expect(saved.working_hours).toBe(7);
      expect(saved.overtime_hours).toBe(0);
    });

    it('flags overtime past the standard day', async () => {
      // 14:00 → 00:00 is 10h, less a 60-minute break = 9h, so 1h overtime.
      const saved = await create({
        check_in: '14:00:00',
        check_out: '00:00:00',
      });
      expect(saved.working_hours).toBe(9);
      expect(saved.overtime_hours).toBe(1);
      expect(saved.is_overtime).toBe(true);
    });

    it('unwraps a shift that crosses midnight rather than paying zero', async () => {
      userRow.shift = { ...NIGHT_SHIFT, break_duration_minutes: 0 };
      const saved = await create({
        check_in: '22:00:00',
        check_out: '06:00:00',
      });
      expect(saved.working_hours).toBe(8);
    });

    it('refuses hours on a day that has not been closed', async () => {
      await expect(
        create({ check_in: '14:05:00', working_hours: 8 }),
      ).rejects.toThrow(/calculated at check-out/);
    });

    it('refuses a directly-set overtime flag', async () => {
      await expect(
        create({ check_in: '14:05:00', is_overtime: true }),
      ).rejects.toThrow(/cannot be set directly/);
    });
  });

  describe('lateness against the shift', () => {
    it('treats an arrival within the grace period as Present', async () => {
      jest.spyOn(service as any, 'currentTime').mockReturnValue('14:10:00');
      const row = await service.checkIn('user-1');
      expect(row.attendance_status).toBe('Present');
    });

    it('treats an arrival past the grace period as Late', async () => {
      jest.spyOn(service as any, 'currentTime').mockReturnValue('14:20:00');
      const row = await service.checkIn('user-1');
      expect(row.attendance_status).toBe('Late');
    });

    it('does not call a six-hour-early arrival Present by accident of the clock', async () => {
      // 08:13 against a 14:00 shift — the screenshot case. Early, not late.
      jest.spyOn(service as any, 'currentTime').mockReturnValue('08:13:00');
      const row = await service.checkIn('user-1');
      expect(row.attendance_status).toBe('Present');
    });

    it('measures a night shift from its own start, not from midnight', async () => {
      userRow.shift = { ...NIGHT_SHIFT };
      // 22:10 against a 22:00 start is ten minutes in — inside the 15-minute
      // grace period. Measured from midnight it would read as 1330 minutes late.
      jest.spyOn(service as any, 'currentTime').mockReturnValue('22:10:00');
      const row = await service.checkIn('user-1');
      expect(row.attendance_status).toBe('Present');
    });
  });

  describe('check-in guards', () => {
    it('refuses a second check-in', async () => {
      attendanceRows = [{ check_in: '14:05:00', attendance_status: 'Present' }];
      await expect(service.checkIn('user-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('refuses to stamp over an approved leave day', async () => {
      attendanceRows = [{ attendance_status: 'On Leave' }];
      await expect(service.checkIn('user-1')).rejects.toThrow(
        /recorded as leave/,
      );
    });

    it('stamps an existing Absent row rather than creating a second one', async () => {
      attendanceRows = [
        {
          attendance_id: 'swept',
          attendance_status: 'Absent',
          attendance_date: today(),
        },
      ];
      jest.spyOn(service as any, 'currentTime').mockReturnValue('14:05:00');

      const row = await service.checkIn('user-1');
      expect(row.attendance_id).toBe('swept');
      expect(row.attendance_status).toBe('Present');
    });

    it('refuses an inactive account', async () => {
      userRow.status = false;
      await expect(service.checkIn('user-1')).rejects.toThrow(/inactive/);
    });

    it('refuses an unknown account', async () => {
      userRow = null;
      await expect(service.checkIn('user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('check-out guards', () => {
    it('refuses a check-out with no check-in', async () => {
      attendanceRows = [{ attendance_status: 'Absent' }];
      await expect(service.checkOut('user-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses a second check-out', async () => {
      attendanceRows = [{ check_in: '14:05:00', check_out: '22:05:00' }];
      await expect(service.checkOut('user-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('history range', () => {
    it('refuses a month outside 1–12', async () => {
      await expect(
        service.getMyHistory('user-1', 13, 2026),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses an implausible year', async () => {
      await expect(
        service.getMyHistory('user-1', 8, 1900),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
