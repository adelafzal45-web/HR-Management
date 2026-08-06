import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, createReadStream } from 'fs';
import { unlink, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import type { Response } from 'express';
import archiver = require('archiver');

import { User } from '../users/user.entity';
import type { UploadedFile } from '../common/upload/image-upload';
import { EmployeeDocument } from './employee-document.entity';

/** 10 MB per file. Matches the ceiling DocumentsUpload enforces client-side. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** The categories the Add Employee form offers. */
export const DOCUMENT_CATEGORIES = [
  'ID Proof',
  'Certificates',
  'Contracts',
  'Other Documents',
] as const;

const FALLBACK_CATEGORY = 'Other Documents';

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

/**
 * Leading bytes for the formats whose signature is stable.
 *
 * The Content-Type header comes from the client, so a `.exe` renamed to `.pdf`
 * would pass a mimetype-only check. The Office XML types are ZIP containers and
 * share PK\x03\x04 with every other zip, so they are matched on that alone —
 * it still rules out an executable, which is the point.
 */
const MAGIC_BYTES: Record<string, number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
  'application/msword': [[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]],
  'application/vnd.ms-excel': [[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    [0x50, 0x4b, 0x03, 0x04],
  ],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
    [0x50, 0x4b, 0x03, 0x04],
  ],
};

export const DOCUMENT_UPLOAD_DIR = resolve(
  process.cwd(),
  'uploads',
  'employee-documents',
);

/**
 * Strips anything that could escape a directory or break a zip entry.
 *
 * Applied to the pieces of the in-archive path (employee folder, category,
 * filename) rather than to anything touching the real filesystem — on disk the
 * name is always a generated UUID.
 */
function safeSegment(value: string, fallback: string): string {
  const cleaned = value
    .replace(/[/\\]/g, '-')
    .replace(/[\x00-\x1f<>:"|?*]/g, '')
    .trim();
  return cleaned || fallback;
}

@Injectable()
export class EmployeeDocumentsService {
  private readonly logger = new Logger(EmployeeDocumentsService.name);

  constructor(
    @InjectRepository(EmployeeDocument)
    private readonly documents: Repository<EmployeeDocument>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  // ---- validation ---------------------------------------------------------

  private validate(file: UploadedFile): void {
    if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.mimetype as never)) {
      throw new BadRequestException(
        `"${file.originalname}" has an unsupported type. Allowed: PDF, JPEG, PNG, WebP, Word and Excel.`,
      );
    }

    if (file.size > MAX_DOCUMENT_BYTES) {
      throw new BadRequestException(
        `"${file.originalname}" is larger than ${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB.`,
      );
    }

    if (!file.buffer?.length) {
      throw new BadRequestException(`"${file.originalname}" is empty.`);
    }

    const signatures = MAGIC_BYTES[file.mimetype];
    const matches = signatures?.some((signature) =>
      signature.every((byte, index) => file.buffer[index] === byte),
    );

    // RIFF alone is also AVI/WAV, so require the WEBP marker too.
    const ok =
      matches &&
      (file.mimetype !== 'image/webp' ||
        file.buffer.subarray(8, 12).toString('ascii') === 'WEBP');

    if (!ok) {
      throw new BadRequestException(
        `"${file.originalname}" does not match its declared type.`,
      );
    }
  }

  // ---- write --------------------------------------------------------------

  /**
   * Stores every file, or none of them.
   *
   * All files are validated before the first byte is written, so a rejected
   * third file cannot leave the first two on disk and half a record in the
   * database. Writes that fail partway are rolled back the same way.
   */
  async uploadMany(
    employeeId: string,
    files: UploadedFile[],
    categories: string[],
    uploadedBy: string,
  ): Promise<EmployeeDocument[]> {
    if (!files.length) {
      throw new BadRequestException('No files were uploaded.');
    }

    const employee = await this.users.findOne({
      where: { user_id: employeeId },
      select: { user_id: true },
    });
    if (!employee) {
      throw new NotFoundException('No such employee.');
    }

    files.forEach((file) => this.validate(file));

    if (!existsSync(DOCUMENT_UPLOAD_DIR)) {
      mkdirSync(DOCUMENT_UPLOAD_DIR, { recursive: true });
    }

    const written: string[] = [];
    try {
      const rows = await Promise.all(
        files.map(async (file, index) => {
          const extension = EXTENSION_BY_MIME[file.mimetype] ?? 'bin';
          const storedName = `${randomUUID()}.${extension}`;

          await writeFile(join(DOCUMENT_UPLOAD_DIR, storedName), file.buffer);
          written.push(storedName);

          // An absent or unrecognised category is filed rather than rejected —
          // losing the upload over a label would be the worse outcome.
          const raw = categories[index];
          const category = DOCUMENT_CATEGORIES.includes(raw as never)
            ? raw
            : FALLBACK_CATEGORY;

          return this.documents.create({
            employeeId,
            category,
            original_name: file.originalname.slice(0, 255),
            stored_name: storedName,
            mime_type: file.mimetype,
            size_bytes: file.size,
            uploaded_by: uploadedBy,
          });
        }),
      );

      return await this.documents.save(rows);
    } catch (error) {
      await Promise.all(written.map((name) => this.unlinkQuietly(name)));
      throw error;
    }
  }

  // ---- read ---------------------------------------------------------------

  listForEmployee(employeeId: string): Promise<EmployeeDocument[]> {
    return this.documents.find({
      where: { employeeId },
      order: { uploaded_at: 'DESC' },
    });
  }

  // ---- delete -------------------------------------------------------------

  /**
   * Scoped by employee as well as document id: without it, any id from any
   * employee would delete, and the `:id` in the route would be decoration.
   */
  async remove(employeeId: string, documentId: string): Promise<void> {
    const document = await this.documents.findOne({
      where: { document_id: documentId, employeeId },
    });
    if (!document) {
      throw new NotFoundException('No such document for this employee.');
    }

    await this.documents.remove(document);
    await this.unlinkQuietly(document.stored_name);
  }

  /**
   * Best-effort file removal. Never throws: the row is already gone, and a
   * missing file must not turn a successful delete into a 500.
   */
  private async unlinkQuietly(storedName: string): Promise<void> {
    if (!storedName || storedName.includes('/') || storedName.includes('\\')) {
      return;
    }
    const target = join(DOCUMENT_UPLOAD_DIR, storedName);
    if (!target.startsWith(DOCUMENT_UPLOAD_DIR)) return;

    try {
      await unlink(target);
    } catch {
      this.logger.warn(`Could not remove ${storedName} — already gone?`);
    }
  }

  // ---- export -------------------------------------------------------------

  /**
   * Streams one zip of every document belonging to the given employees.
   *
   * Streamed rather than buffered: a 50-employee export is arbitrarily large,
   * and holding it in memory to set Content-Length would be the one thing that
   * reliably breaks it. That is also why the 404 for "nothing to export" is
   * raised before any header is written — once the archive starts, the status
   * line is already sent and an error can only truncate the download.
   */
  async streamArchive(employeeIds: string[], response: Response): Promise<void> {
    if (!employeeIds.length) {
      throw new BadRequestException('Select at least one employee.');
    }

    const documents = await this.documents.find({
      where: { employeeId: In(employeeIds) },
      order: { uploaded_at: 'DESC' },
    });

    if (!documents.length) {
      throw new NotFoundException(
        'None of the selected employees have any documents on file.',
      );
    }

    // Folder names come from the employee code, which is unique and stable —
    // two people with the same name would otherwise share a folder.
    const employees = await this.users.find({
      where: { user_id: In(employeeIds) },
      select: {
        user_id: true,
        employee_code: true,
        first_name: true,
        last_name: true,
      },
    });
    const folderById = new Map(
      employees.map((e) => [
        e.user_id,
        safeSegment(
          `${e.employee_code} ${e.first_name} ${e.last_name}`.trim(),
          e.user_id,
        ),
      ]),
    );

    const stamp = new Date().toISOString().slice(0, 10);
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="employee-documents-${stamp}.zip"`,
    );

    const archive = archiver('zip', { zlib: { level: 9 } });

    // Missing files are warned about and skipped rather than aborting: one
    // deleted file should not cost the operator the other 200 documents.
    archive.on('warning', (err) => this.logger.warn(String(err)));
    archive.on('error', (err) => {
      this.logger.error(`Archive failed: ${String(err)}`);
      response.destroy(err);
    });

    archive.pipe(response);

    let appended = 0;
    for (const doc of documents) {
      const path = join(DOCUMENT_UPLOAD_DIR, doc.stored_name);
      if (!existsSync(path)) {
        this.logger.warn(`Skipping ${doc.stored_name} — file missing on disk.`);
        continue;
      }

      const folder = folderById.get(doc.employeeId) ?? doc.employeeId;
      const category = safeSegment(doc.category, FALLBACK_CATEGORY);
      const name = safeSegment(doc.original_name, doc.stored_name);

      archive.append(createReadStream(path), {
        // Prefixed with the row id so two files with the same name under one
        // category do not silently overwrite each other inside the zip.
        name: `${folder}/${category}/${doc.document_id.slice(0, 8)}-${name}`,
      });
      appended += 1;
    }

    if (appended === 0) {
      archive.append('Every document on record is missing from storage.\n', {
        name: 'README.txt',
      });
    }

    await archive.finalize();
  }
}
