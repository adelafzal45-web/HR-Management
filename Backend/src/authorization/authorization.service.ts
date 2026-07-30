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
}
