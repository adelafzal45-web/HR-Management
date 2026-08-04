import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { MailQueueProcessor } from './mail-queue.processor';
import { EmailQueueQueryDto } from './dto/email-queue-query.dto';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/auth.constants';
import { actorFrom } from '../common/audit/actor.util';

/**
 * The outbound mail log.
 *
 * Read is gated on `email-queue.view` and mutation on `email-queue.manage`,
 * because the rows contain the full rendered body of every message sent —
 * including password-reset emails. That is deliberately a narrower audience than
 * `email-templates.view`.
 *
 * Note the rendered body includes the reset *link*, but a reset token is
 * single-use and short-lived, and this endpoint already requires an authenticated
 * admin. The alternative — omitting the body — would make the log useless for the
 * thing it exists for, which is answering "what exactly did we send this person".
 */
@ApiTags('Email Queue')
@ApiBearerAuth()
@Controller('email-queue')
export class EmailQueueController {
  constructor(private readonly queue: MailQueueProcessor) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('email-queue.view')
  @ApiOperation({
    summary: 'List queued and sent emails',
    description:
      'Paginated, newest first. Filter by `status` and `template_key`; `search` matches recipient address and subject.',
  })
  @ApiResponse({ status: 200, description: 'Queue retrieved.' })
  @ApiResponse({ status: 403, description: 'Missing email-queue.view.' })
  findAll(@Query() query: EmailQueueQueryDto) {
    return this.queue.findAll(query);
  }

  /** Before `GET :id` so the literal path is not captured by the UUID param. */
  @Get('stats')
  @UseGuards(PermissionGuard)
  @RequirePermission('email-queue.view')
  @ApiOperation({
    summary: 'Counts per delivery status',
    description: 'Drives the summary strip on the email settings screen.',
  })
  @ApiResponse({ status: 200, description: 'Stats retrieved.' })
  stats() {
    return this.queue.stats();
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('email-queue.view')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Get one queued email including its rendered body',
  })
  @ApiResponse({ status: 200, description: 'Email retrieved.' })
  @ApiResponse({ status: 404, description: 'Not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.queue.findOne(id);
  }

  @Post(':id/retry')
  @HttpCode(200)
  @UseGuards(PermissionGuard)
  @RequirePermission('email-queue.manage')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Retry a failed email',
    description:
      'Only `failed` and `cancelled` rows can be retried — retrying a `sent` one would deliver a duplicate. Resets the attempt counter and schedules an immediate send, so the retry gets the full backoff schedule rather than whatever was left of it.',
  })
  @ApiResponse({ status: 200, description: 'Retry scheduled.' })
  @ApiResponse({ status: 403, description: 'Missing email-queue.manage.' })
  @ApiResponse({ status: 409, description: 'Already sent or in flight.' })
  @ApiResponse({ status: 404, description: 'Not found.' })
  retry(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
  ) {
    return this.queue.retry(id, actorFrom(user, request));
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @UseGuards(PermissionGuard)
  @RequirePermission('email-queue.manage')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Cancel a pending or failed email',
    description:
      'Only `pending` and `failed` rows can be cancelled — a `sending` row is already with the mail server, and a `sent` one has left.',
  })
  @ApiResponse({ status: 200, description: 'Email cancelled.' })
  @ApiResponse({ status: 409, description: 'Already sent or in flight.' })
  @ApiResponse({ status: 404, description: 'Not found.' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
  ) {
    return this.queue.cancel(id, actorFrom(user, request));
  }
}
