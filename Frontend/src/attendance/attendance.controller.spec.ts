import { Test, TestingModule } from '@nestjs/testing';

import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

describe('AttendanceController', () => {
  let controller: AttendanceController;

  const attendanceService = {
    getTodayForUser: jest.fn(),
    getMyHistory: jest.fn(),
    checkIn: jest.fn(),
    checkOut: jest.fn(),
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getWorkingDayCalendar: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttendanceController],
      providers: [{ provide: AttendanceService, useValue: attendanceService }],
    })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AttendanceController>(AttendanceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // The four self-service routes take the employee id from the verified token
  // and nothing else. Asserting that here is what stops a future edit from
  // quietly reintroducing a client-supplied `user_id`.
  it('takes the employee id from the token, not the request body', () => {
    controller.checkIn({ user_id: 'from-token' } as any);
    expect(attendanceService.checkIn).toHaveBeenCalledWith('from-token');

    controller.checkOut({ user_id: 'from-token' } as any);
    expect(attendanceService.checkOut).toHaveBeenCalledWith('from-token');

    controller.getMyToday({ user_id: 'from-token' } as any);
    expect(attendanceService.getTodayForUser).toHaveBeenCalledWith(
      'from-token',
    );
  });

  it('parses the history query params to numbers', () => {
    controller.getMyHistory({ user_id: 'u1' } as any, '8', '2026');
    expect(attendanceService.getMyHistory).toHaveBeenCalledWith('u1', 8, 2026);
  });
});
