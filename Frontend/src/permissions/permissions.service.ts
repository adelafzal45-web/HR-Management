import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { ILike, Repository } from 'typeorm';

import { Permission } from './permission.entity';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import {
  SettingsListQueryDto,
  escapeLikeTerm,
  type SettingsListResult,
} from '../common/dto/settings-list-query.dto';

/** Postgres `unique_violation`. `permissions.permission_name` is UNIQUE. */
const UNIQUE_VIOLATION = '23505';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
  ) {}

  create(permission: CreatePermissionDto) {
    const newPermission = this.permissionRepository.create(permission);

    return this.persist(newPermission);
  }

  /** Paginated and searchable — see the note on `RoleService.findAll`. */
  async findAll(
    query: SettingsListQueryDto,
  ): Promise<SettingsListResult<Permission>> {
    const term = query.search?.trim();
    const pattern = term ? `%${escapeLikeTerm(term)}%` : null;

    const where = pattern
      ? [{ permission_name: ILike(pattern) }, { description: ILike(pattern) }]
      : undefined;

    const [data, total] = await this.permissionRepository.findAndCount({
      where,
      // Name-ordered so the Roles screen's checkbox tree groups by module
      // (`appraisal.*`, `employees.*`, ...) without sorting client-side.
      order: { permission_name: 'ASC' },
      ...(query.pageSize
        ? { skip: (query.page - 1) * query.pageSize, take: query.pageSize }
        : {}),
    });

    return { data, total };
  }

  async findOne(id: string) {
    const permission = await this.permissionRepository.findOne({
      where: {
        permission_id: id,
      },
    });

    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    return permission;
  }

  /**
   * The update half of this module's CRUD, which never existed: `PATCH
   * /permissions/:id` had no route and no service method, so a permission's
   * name or description could only ever be fixed by deleting the row — which
   * cascades away every role grant that depended on it — and creating it again.
   */
  async update(id: string, dto: UpdatePermissionDto) {
    const permission = await this.findOne(id);

    Object.assign(permission, dto);

    return this.persist(permission);
  }

  async delete(id: string) {
    await this.findOne(id);

    // `role_permissions.permission_id` is ON DELETE CASCADE, so every role that
    // granted this permission quietly loses it. The delete dialog says so.
    await this.permissionRepository.delete(id);

    return {
      permission_id: id,
      message: 'Permission deleted successfully',
    };
  }

  private async persist(permission: Permission) {
    try {
      return await this.permissionRepository.save(permission);
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ConflictException(
          `A permission named "${permission.permission_name}" already exists.`,
        );
      }

      throw err;
    }
  }
}
