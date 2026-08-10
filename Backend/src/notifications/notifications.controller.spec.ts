import { PATH_METADATA } from '@nestjs/common/constants';

import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PERMISSION_KEY } from '../authorization/decorators/require-permission.decorator';

/**
 * The service is faked, so these tests are about the controller's own two jobs:
 * passing the right arguments down, and carrying the right permission metadata.
 *
 * Both jobs had a bug here. `create` used to take its author from the request
 * body, which let anyone holding `notifications.create` send under someone
 * else's name; it now comes from the JWT. And the three `/me` routes must stay
 * free of `@RequirePermission` — `notifications.view` is granted to HR/Admin
 * only, so a decorator added there by reflex would 403 every ordinary
 * employee's own notification bell.
 */
describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: jest.Mocked<
    Pick<
      NotificationsService,
      | 'create'
      | 'findAll'
      | 'findForUser'
      | 'markRead'
      | 'markAllRead'
      | 'findOne'
      | 'update'
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
      create: jest.fn().mockResolvedValue({ batch_id: 'b-1' }),
      findAll: jest.fn().mockResolvedValue([]),
      findForUser: jest.fn().mockResolvedValue({ data: [], unread: 0 }),
      markRead: jest.fn().mockResolvedValue({ notification_id: 'n-1' }),
      markAllRead: jest.fn().mockResolvedValue({ updated: 0 }),
      findOne: jest.fn().mockResolvedValue({ notification_id: 'n-1' }),
      update: jest.fn().mockResolvedValue({ notification_id: 'n-1' }),
      remove: jest.fn().mockResolvedValue({ deleted: 1 }),
    } as any;

    controller = new NotificationsController(
      service as unknown as NotificationsService,
    );
  });

  const jwt = (user_id: string, role = 'hr_manager') =>
    ({ user_id, email: `${user_id}@example.com`, role }) as any;

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  describe('actor resolution', () => {
    it('takes the author from the JWT, never the body', async () => {
      const dto = { title: 'Office closed', message: 'Friday' } as any;

      await controller.create(jwt('u-1'), dto);

      expect(service.create).toHaveBeenCalledWith(dto, 'u-1');
    });

    it('scopes the bell to the caller', async () => {
      await controller.findMine(jwt('u-7', 'employee'));

      expect(service.findForUser).toHaveBeenCalledWith(
        'u-7',
        expect.any(Object),
      );
    });

    it('marks read as the caller, so no one can clear another bell', async () => {
      await controller.markRead(jwt('u-7', 'employee'), 'n-9');

      expect(service.markRead).toHaveBeenCalledWith('n-9', 'u-7');
    });

    it('scopes read-all to the caller', async () => {
      await controller.markAllRead(jwt('u-7', 'employee'));

      expect(service.markAllRead).toHaveBeenCalledWith('u-7');
    });
  });

  describe('query handling', () => {
    it('coerces unread and limit from their string query values', async () => {
      await controller.findMine(jwt('u-7', 'employee'), 'true', '10');

      expect(service.findForUser).toHaveBeenCalledWith('u-7', {
        unreadOnly: true,
        limit: 10,
      });
    });

    it('leaves limit undefined when not supplied, so the service default applies', async () => {
      await controller.findMine(jwt('u-7', 'employee'));

      expect(service.findForUser).toHaveBeenCalledWith('u-7', {
        unreadOnly: false,
        limit: undefined,
      });
    });

    it('treats any value other than "true" as a full read', async () => {
      await controller.findMine(jwt('u-7', 'employee'), '1');

      expect(service.findForUser).toHaveBeenCalledWith(
        'u-7',
        expect.objectContaining({ unreadOnly: false }),
      );
    });
  });

  describe('permission metadata', () => {
    const permissionOf = (method: keyof NotificationsController) =>
      Reflect.getMetadata(
        PERMISSION_KEY,
        NotificationsController.prototype[method],
      );

    it('matches the seeded permission matrix', () => {
      expect(permissionOf('create')).toBe('notifications.create');
      expect(permissionOf('findAll')).toBe('notifications.view');
      expect(permissionOf('findOne')).toBe('notifications.view');
      expect(permissionOf('update')).toBe('notifications.update');
      expect(permissionOf('remove')).toBe('notifications.delete');
    });

    it('leaves the /me routes permission-free so employees can read their own', () => {
      expect(permissionOf('findMine')).toBeUndefined();
      expect(permissionOf('markRead')).toBeUndefined();
      expect(permissionOf('markAllRead')).toBeUndefined();
    });

    it('registers /notifications/me before the :id route so it is not swallowed', () => {
      // Nest matches in declaration order; 'me' would otherwise be parsed as a
      // notification id and looked up as one.
      const paths = ['findAll', 'findMine', 'findOne'].map((m) =>
        Reflect.getMetadata(
          PATH_METADATA,
          NotificationsController.prototype[m as keyof NotificationsController],
        ),
      );
      expect(paths).toEqual(['/', 'me', ':id']);
    });
  });
});
