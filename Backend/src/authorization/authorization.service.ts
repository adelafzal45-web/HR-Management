import { Injectable, NotFoundException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../users/user.entity';

@Injectable()
export class AuthorizationService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Checks whether a user has a specific permission.
   *
   * Flow:
   *
   * User
   *   ↓
   * Role
   *   ↓
   * RolePermission
   *   ↓
   * Permission
   *
   * Example:
   *
   * hasPermission(
   *   'dced0533-ad5e-4f86-8e76-34e9a4e78451',
   *   'employees.create',
   * )
   */
  async hasPermission(
    userId: string,
    permissionName: string,
  ): Promise<boolean> {
    // Find the CURRENT user and load:
    //
    // User → Role → RolePermissions → Permission
    //
    const user = await this.userRepository.findOne({
      where: {
        user_id: userId,
      },

      relations: {
        role: {
          rolePermissions: {
            permission: true,
          },
        },
      },
    });

    // ------------------------------------------
    // USER DOES NOT EXIST
    // ------------------------------------------

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // ------------------------------------------
    // USER HAS NO ROLE
    // ------------------------------------------

    if (!user.role) {
      return false;
    }

    // ------------------------------------------
    // GET ROLE PERMISSIONS
    // ------------------------------------------

    const rolePermissions = user.role.rolePermissions ?? [];

    // ------------------------------------------
    // CHECK REQUESTED PERMISSION
    // ------------------------------------------

    return rolePermissions.some(
      (rolePermission) =>
        rolePermission.permission?.permission_name === permissionName,
    );
  }

  /**
   * Every permission name granted to a user's role.
   *
   * Used at login so the frontend can gate its UI off the caller's real
   * permission set without having to read the RBAC config endpoints (which
   * are HR-only). Returns an empty array for a user with no role — the
   * least-privilege default.
   */
  async getPermissionsForUser(userId: string): Promise<string[]> {
    const user = await this.userRepository.findOne({
      where: { user_id: userId },
      relations: {
        role: {
          rolePermissions: {
            permission: true,
          },
        },
      },
    });

    if (!user?.role) {
      return [];
    }

    const names = (user.role.rolePermissions ?? [])
      .map((rp) => rp.permission?.permission_name)
      .filter((name): name is string => Boolean(name));

    // The role_permissions table has no unique constraint on
    // (role_id, permission_id), so duplicates are possible.
    return [...new Set(names)].sort();
  }
}
