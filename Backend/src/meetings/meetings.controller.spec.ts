import { PATH_METADATA } from '@nestjs/common/constants';

import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { PERMISSION_KEY } from '../authorization/decorators/require-permission.decorator';

/**
 * The service is faked, so these tests are about the controller's own two jobs:
 * passing the right arguments down, and carrying the right permission metadata.
 *
 * The permission assertions matter more than they look. `GET /meetings/me` is
 * intentionally the one route with no `@RequirePermission` — the Employee role
 * holds no `meeting.*` grant, so self-service reads are scoped to the caller
 * instead of widening `meeting.view`. A decorator added there by reflex would
 * lock every employee out of their own invitations, and nothing else in the test
 * suite would notice.
 */
describe('MeetingsController', () => {
  let controller: MeetingsController;
  let service: jest.Mocked<
    Pick<
      MeetingsService,
      | 'create'
      | 'findAll'
      | 'findMine'
      | 'findOne'
      | 'update'
      | 'cancel'
      | 'remove'
    >
  >;

  // Constructed directly rather than through Test.createTestingModule: the
  // module builder instantiates the PermissionGuard named by @UseGuards, which
  // would drag AuthorizationService and its repositories into a test that only
  // needs the controller. The guard's wiring is asserted from its metadata
  // below, which does not require an instance.
  beforeEach(() => {
    service = {
      create: jest.fn().mockResolvedValue({ meeting_id: 'm-1' }),
      findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      findMine: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ meeting_id: 'm-1' }),
      update: jest.fn().mockResolvedValue({ meeting_id: 'm-1' }),
      cancel: jest.fn().mockResolvedValue({ meeting_id: 'm-1' }),
      remove: jest.fn().mockResolvedValue({ message: 'Meeting deleted.' }),
    } as any;

    controller = new MeetingsController(service as unknown as MeetingsService);
  });

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  describe('actor resolution', () => {
    it('takes the organizer from the JWT, never the body', async () => {
      const dto = { title: 'Sync' } as any;

      await controller.create(dto, {
        user_id: 'u-1',
        email: 'a@example.com',
        role: 'hr_manager',
      } as any);

      expect(service.create).toHaveBeenCalledWith(dto, 'u-1');
    });

    it('scopes /meetings/me to the caller', async () => {
      await controller.findMine({
        user_id: 'u-7',
        email: 'e@example.com',
        role: 'employee',
      } as any);

      expect(service.findMine).toHaveBeenCalledWith('u-7');
    });
  });

  describe('query handling', () => {
    it('coerces page and pageSize from their string query values', async () => {
      await controller.findAll(
        'review',
        undefined,
        'd-1',
        undefined,
        undefined,
        '2',
        '25',
      );

      expect(service.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'review',
          departmentId: 'd-1',
          page: 2,
          pageSize: 25,
        }),
      );
    });

    it('leaves paging undefined when not supplied, so the service defaults apply', async () => {
      await controller.findAll();

      expect(service.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ page: undefined, pageSize: undefined }),
      );
    });
  });

  it('unwraps the cancellation reason from its DTO', async () => {
    await controller.cancel('m-1', { cancellation_reason: 'Postponed' } as any);

    expect(service.cancel).toHaveBeenCalledWith('m-1', 'Postponed');
  });

  describe('permission metadata', () => {
    const permissionOf = (method: keyof MeetingsController) =>
      Reflect.getMetadata(PERMISSION_KEY, MeetingsController.prototype[method]);

    it('matches the seeded permission matrix', () => {
      expect(permissionOf('create')).toBe('meeting.create');
      expect(permissionOf('findAll')).toBe('meeting.view');
      expect(permissionOf('findOne')).toBe('meeting.view');
      expect(permissionOf('update')).toBe('meeting.manage');
      expect(permissionOf('cancel')).toBe('meeting.manage');
      expect(permissionOf('remove')).toBe('meeting.manage');
    });

    it('leaves /meetings/me permission-free so employees can read their own', () => {
      expect(permissionOf('findMine')).toBeUndefined();
    });

    it('registers /meetings/me before the :id route so it is not swallowed', () => {
      // Nest matches in declaration order; 'me' would otherwise be parsed as an
      // id and rejected by ParseUUIDPipe.
      const paths = ['findAll', 'findMine', 'findOne'].map((m) =>
        Reflect.getMetadata(
          PATH_METADATA,
          MeetingsController.prototype[m as keyof MeetingsController],
        ),
      );
      expect(paths).toEqual(['/', 'me', ':id']);
    });
  });
});
