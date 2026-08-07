import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { PasswordResetService } from './password-reset.service';
import {
  BulkPasswordResetDto,
  type BulkPasswordResetResult,
  type BulkPasswordResetSummary,
} from './dto/bulk-password-reset.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import type { JwtUser } from './auth.constants';
import { User } from '../users/user.entity';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import type { AuditActor } from '../audit/audit.service';

/**
 * Admin-issued password reset links.
 *
 * Mounted under `users` because that is where these endpoints belong from the
 * client's point of view, but it lives in `AuthModule` rather than `UserModule`
 * for a structural reason: `PasswordResetService` is an `AuthModule` provider
 * and `AuthModule` already imports `UserModule`, so `UserController` cannot
 * reach it without a cycle. A second controller on the same path prefix is the
 * cheaper fix — Nest merges them into one route table, and Swagger groups them
 * by tag, not by class.
 *
 * Guarded by the already-seeded `employees.password.reset`, the same permission
 * as the direct admin reset: both let a privileged user take over an account, so
 * neither should be reachable without the other.
 */
@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class PasswordResetAdminController {
  constructor(
    private readonly passwordResetService: PasswordResetService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  private actorFrom(user: JwtUser, request: Request): AuditActor {
    return {
      user_id: user.user_id,
      email: user.email,
      ip: request.ip,
      userAgent: request.get('user-agent') ?? undefined,
    };
  }

  @Post('password-reset-links')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.password.reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send password reset links to one or more employees',
    description:
      'Emails each selected employee a one-time link that expires in 60 minutes. Accounts with password resets disabled, or with no email address, are reported as `skipped` rather than failing the batch. Issuing a new link invalidates any earlier unused link for that employee, so this doubles as "resend". One audit row is written per target.',
  })
  @ApiBody({ type: BulkPasswordResetDto })
  @ApiResponse({
    status: 200,
    description:
      'Per-employee outcome. Always 200 when the request itself was well formed — a partial failure is reported in the body, not as an error status, because "3 of 5 sent" is not something a single status code can express.',
  })
  @ApiResponse({
    status: 400,
    description: 'Empty, oversized, or duplicated id list.',
  })
  @ApiResponse({
    status: 403,
    description: 'Missing employees.password.reset.',
  })
  async sendResetLinks(
    @Body() dto: BulkPasswordResetDto,
    @CurrentUser() currentUser: JwtUser,
    @Req() request: Request,
  ): Promise<BulkPasswordResetSummary> {
    const actor = this.actorFrom(currentUser, request);

    // One query for the whole batch, with the relations the email templates read
    // ({{department}}, {{designation}}). Loading per id would be N round trips
    // and N template contexts assembled from partially-loaded entities.
    const users = await this.userRepository.find({
      where: { user_id: In(dto.user_ids) },
      relations: ['department', 'designation'],
    });

    const byId = new Map(users.map((user) => [user.user_id, user]));

    const results: BulkPasswordResetResult[] = [];

    // Sequential, not `Promise.all`. Each issue opens a transaction that
    // invalidates prior tokens for its user and inserts a new one; running a
    // hundred of those concurrently would spike the pool for no user-visible
    // gain, since the mail itself is queued and sent by the drain regardless.
    for (const userId of dto.user_ids) {
      const user = byId.get(userId);

      if (!user) {
        // Reported rather than thrown: one stale id in a selection should not
        // discard the other ninety-nine links.
        results.push({
          user_id: userId,
          status: 'skipped',
          reason: 'No such employee',
        });
        continue;
      }

      const outcome = await this.passwordResetService.issueFor(user, {
        actor,
        requestedByAdmin: currentUser.user_id,
        ip: request.ip,
      });

      results.push(
        outcome.status === 'sent'
          ? {
              user_id: userId,
              status: 'sent',
              email: outcome.email,
              expires_at: outcome.expiresAt.toISOString(),
            }
          : {
              user_id: userId,
              status: outcome.status,
              reason: outcome.reason,
            },
      );
    }

    return {
      requested: dto.user_ids.length,
      sent: results.filter((r) => r.status === 'sent').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      failed: results.filter((r) => r.status === 'failed').length,
      results,
    };
  }

  @Get(':id/password-reset-links')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.password.reset')
  @ApiOperation({
    summary: 'Reset-link history for one employee',
    description:
      'The 20 most recent links, newest first, each with a derived status: `pending` (live), `used`, `expired`, or `superseded` (replaced by a later request). Token values are never returned — the digest is all the server holds, and returning even that would make this endpoint a source of working links.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Issue history.' })
  @ApiResponse({ status: 404, description: 'Employee not found.' })
  async resetLinkHistory(@Param('id', ParseUUIDPipe) id: string) {
    // Existence is checked so an unknown id gives 404 rather than an empty list,
    // which would read as "this employee has never been sent a link".
    const exists = await this.userRepository.exists({ where: { user_id: id } });
    if (!exists) {
      throw new NotFoundException('User not found');
    }

    return this.passwordResetService.historyFor(id);
  }
}
