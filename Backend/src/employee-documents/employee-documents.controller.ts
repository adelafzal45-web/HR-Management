import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/auth.constants';
import type { UploadedFile } from '../common/upload/image-upload';

import {
  EmployeeDocumentsService,
  MAX_DOCUMENT_BYTES,
} from './employee-documents.service';
import { ExportDocumentsDto } from './dto/export-documents.dto';
import { UploadDocumentsDto } from './dto/upload-documents.dto';

/**
 * Employee document storage.
 *
 * Mounted under `/users` so document routes sit alongside the employee they
 * belong to, matching how `POST /users/:id/photo` already works. Every route is
 * guarded by its own `employees.documents.*` permission — those were seeded by
 * SeedEmployeeManagementPermissions but had no endpoints behind them until now.
 */
@ApiTags('Employee Documents')
@ApiBearerAuth()
@Controller('users')
export class EmployeeDocumentsController {
  constructor(private readonly documentsService: EmployeeDocumentsService) {}

  /**
   * Bulk export, declared before `:id/documents` so the literal segment is not
   * captured by the UUID param route.
   *
   * POST rather than GET because the id list is unbounded — a 200-employee
   * export would not survive a query string, and the body is the only place
   * that scales.
   */
  @Post('documents/export')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.documents.view')
  @ApiOperation({
    summary: 'Download every document of the selected employees as one zip',
    description:
      'Folders inside the archive are named by employee code and category. Employees with no documents are skipped.',
  })
  @ApiResponse({ status: 201, description: 'Zip archive streamed.' })
  @ApiResponse({ status: 404, description: 'None of the selected employees had documents.' })
  async exportDocuments(
    @Body() dto: ExportDocumentsDto,
    @Res() response: Response,
  ): Promise<void> {
    await this.documentsService.streamArchive(dto.employeeIds, response);
  }

  @Post(':id/documents')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.documents.upload')
  @UseInterceptors(
    FilesInterceptor('files', 20, { limits: { fileSize: MAX_DOCUMENT_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload one or more documents for an employee',
    description:
      'Send files under the `files` field and a matching `categories` entry per file. Contents are checked against the declared type.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
        categories: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Documents stored.' })
  @ApiResponse({ status: 400, description: 'Invalid, empty or oversized file.' })
  uploadDocuments(
    @Param('id', ParseUUIDPipe) employeeId: string,
    @UploadedFiles() files: UploadedFile[] | undefined,
    @Body() dto: UploadDocumentsDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.documentsService.uploadMany(
      employeeId,
      files ?? [],
      dto.categories,
      user.user_id,
    );
  }

  @Get(':id/documents')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.documents.view')
  @ApiOperation({ summary: "List an employee's stored documents" })
  @ApiParam({ name: 'id', format: 'uuid' })
  listDocuments(@Param('id', ParseUUIDPipe) employeeId: string) {
    return this.documentsService.listForEmployee(employeeId);
  }

  @Delete(':id/documents/:documentId')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.documents.delete')
  @ApiOperation({ summary: 'Delete a stored document' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'documentId', format: 'uuid' })
  @ApiResponse({ status: 404, description: 'No such document for this employee.' })
  async deleteDocument(
    @Param('id', ParseUUIDPipe) employeeId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    await this.documentsService.remove(employeeId, documentId);
    return { success: true };
  }
}
