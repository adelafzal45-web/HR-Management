import { InjectRepository } from '@nestjs/typeorm';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { UpdateRoleDto } from './dto/update-role.dto';
import { ILike, Repository } from 'typeorm';

import { Role } from './roles.entity';
import { User } from '../users/user.entity';

import { CreateRoleDto } from './dto/create-role.dto';
import {
  SettingsListQueryDto,
  escapeLikeTerm,
  type SettingsListResult,
} from '../common/dto/settings-list-query.dto';

/**
 * Postgres `unique_violation`. `roles.role_name` is UNIQUE, so a duplicate name
 * arrives here as a driver error rather than anything this service checked for.
 */
const UNIQUE_VIOLATION = '23505';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
  ) {}

  async create(createRoleDto: CreateRoleDto) {
    const role = this.roleRepository.create(createRoleDto);

    return this.persist(role);
  }

  /**
   * Paginated, searchable list.
   *
   * This used to be a bare `find()` that ignored the query string entirely. The
   * Roles and Permissions screens both send `search`/`page`/`pageSize` and both
   * render whatever comes back verbatim, so the search box did nothing and the
   * pager advertised pages that all showed the same rows.
   */
  async findAll(
    query: SettingsListQueryDto,
  ): Promise<SettingsListResult<Role>> {
    const term = query.search?.trim();
    const pattern = term ? `%${escapeLikeTerm(term)}%` : null;

    // An array of conditions is OR-ed by TypeORM, so this matches either column.
    const where = pattern
      ? [{ role_name: ILike(pattern) }, { description: ILike(pattern) }]
      : undefined;

    const [data, total] = await this.roleRepository.findAndCount({
      where,
      order: { role_name: 'ASC' },
      ...(query.pageSize
        ? { skip: (query.page - 1) * query.pageSize, take: query.pageSize }
        : {}),
    });

    return { data, total };
  }

  /**
   * Throws rather than returning null: the controller documents a 404 for a
   * missing role, and returning `null` with a 200 made the client render an
   * empty edit form as though the role existed.
   */
  async findOne(id: string) {
    const role = await this.roleRepository.findOne({
      where: {
        role_id: id,
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return role;
  }

  async update(id: string, updateRoleDto: UpdateRoleDto) {
    const role = await this.findOne(id);

    Object.assign(role, updateRoleDto);

    return this.persist(role);
  }

  async remove(id: string) {
    await this.findOne(id);

    /*
     * `users.role_id` is ON DELETE NO ACTION (secondLast-Schema), so deleting a
     * role somebody still holds raises a raw foreign-key violation — a 500 with
     * a Postgres constraint name in it. Check first and say what is actually
     * wrong and how to fix it.
     *
     * `role_permissions.role_id` is ON DELETE CASCADE, so this role's grants go
     * with it and need no cleanup here.
     */
    const assigned = await this.roleRepository.manager.count(User, {
      where: { role: { role_id: id } },
    });

    if (assigned > 0) {
      throw new ConflictException(
        `This role is still assigned to ${assigned} user${
          assigned === 1 ? '' : 's'
        }. Move them to another role before deleting it.`,
      );
    }

    await this.roleRepository.delete(id);

    return {
      role_id: id,
      message: 'Role deleted successfully',
    };
  }

  /**
   * Save, translating the UNIQUE violation on `role_name` into a 409 that names
   * the conflict. Checking with a SELECT first would still race two concurrent
   * creates into the same 500, so the constraint stays the authority and this
   * only improves the message.
   */
  private async persist(role: Role) {
    try {
      return await this.roleRepository.save(role);
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ConflictException(
          `A role named "${role.role_name}" already exists.`,
        );
      }

      throw err;
    }
  }
}
