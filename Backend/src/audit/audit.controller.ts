import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { AuditService } from './audit.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '../authorization/guards/permission.guard';

/**
 * Read-only view of the audit trail.
 *
 * No write endpoint exists by design — rows are written by the services that
 * perform the audited change, inside that change's transaction. Exposing a
 * generic "create audit entry" route would let a caller forge history.
 */
@ApiTags('Audit Logs')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('audit-logs.view')
  @ApiOperation({
    summary: 'List audit log entries',
    description:
      'Paginated, newest first. Optionally filtered by entity type, entity id, or action.',
  })
  @ApiQuery({ name: 'entityType', required: false, example: 'User' })
  @ApiQuery({ name: 'entityId', required: false })
  @ApiQuery({ name: 'action', required: false, example: 'employee.update' })
  @ApiResponse({ status: 200, description: 'Audit entries retrieved.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  @ApiResponse({
    status: 403,
    description: 'Missing audit-logs.view permission.',
  })
  findAll(
    @Query() query: PaginationQueryDto,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
  ) {
    return this.auditService.findAll(query, { entityType, entityId, action });
  }
}
