import { BadRequestException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';

import { uploadDir, uploadUrlPrefix } from '../../config/upload-paths';

/**
 * Upload handling for photos, signatures and document attachments.
 *
 * Files are taken into memory, verified, then written under `uploads/` with a
 * generated name. Multer's own `diskStorage` is deliberately not used: it
 * writes the file before any validation runs, so a rejected upload still leaves
 * a file on disk, and it derives the stored name from client input.
 *
 * The photo functions near the bottom are the original API and are unchanged
 * from a caller's point of view; they now delegate to the generic
 * `validateUpload` / `saveUpload` / `deleteUpload` trio so a second module can
 * declare its own directory, size cap and accepted types without copying the
 * magic-byte checks.
 */

/** 2 MB. Matches the limit the frontend enforces before uploading. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

/**
 * Notification attachments: the same images, plus PDF. A payroll or policy
 * announcement is normally a PDF, which is why this list exists separately
 * rather than PDF being added to the image list — signature and photo uploads
 * must stay images-only.
 */
export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  ...ALLOWED_IMAGE_MIME_TYPES,
  'application/pdf',
] as const;

/**
 * Branding images: the same images, plus the two mimetypes browsers report for
 * a `.ico` file, since a favicon is still commonly one.
 *
 * SVG is deliberately absent. Uploads are served from the API origin with no
 * authentication, and an SVG is a document that may carry script — accepting
 * one would let anyone who can change the logo run script on that origin. PNG
 * covers every real logo need.
 */
export const ALLOWED_BRANDING_MIME_TYPES = [
  ...ALLOWED_IMAGE_MIME_TYPES,
  'image/x-icon',
  'image/vnd.microsoft.icon',
] as const;

/** Extension used on disk for each accepted type. */
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'application/pdf': 'pdf',
};

/**
 * Leading bytes that identify each accepted format.
 *
 * The Content-Type header is supplied by the client and can say anything, so a
 * `.exe` renamed to `.png` would pass a mimetype-only check. Checking the
 * actual signature means the bytes have to match the claimed type.
 *
 * WebP is RIFF....WEBP — bytes 8-11 carry the marker, so it is matched
 * separately below.
 */
const MAGIC_BYTES: Record<string, number[][]> = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/gif': [
    [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  ],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
  // ICO: a 6-byte header of reserved 0, type 1 (icon), then the image count.
  // The first four bytes are fixed, which is as much as can be checked.
  'image/x-icon': [[0x00, 0x00, 0x01, 0x00]],
  'image/vnd.microsoft.icon': [[0x00, 0x00, 0x01, 0x00]],
  // '%PDF'. Every conforming PDF opens with it, and the header may legally sit
  // a little way into the file, so this one is searched for rather than
  // required at offset 0 (see matchesMagicBytes).
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
};

/** Directory photos are written to, and the URL prefix they are served under. */
export const PHOTO_UPLOAD_DIR = uploadDir('employee-photos');
export const PHOTO_URL_PREFIX = uploadUrlPrefix('employee-photos');

/** 5 MB. A policy PDF or a scanned payslip fits comfortably. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** 1 MB. A signature is a small transparent PNG; more than this is a scan. */
export const MAX_SIGNATURE_BYTES = 1 * 1024 * 1024;

/** 2 MB. A logo or favicon, so the same cap a profile photo gets. */
export const MAX_BRANDING_BYTES = 2 * 1024 * 1024;

/**
 * Where each kind of upload lives. Separate directories rather than one shared
 * folder so `deleteUpload` can refuse a path belonging to another kind: a
 * tampered signature URL cannot be used to delete somebody's photo.
 *
 * All of them sit beneath the configured uploads root, so a single environment
 * variable moves the lot onto a disk that survives a deploy.
 */
export const ATTACHMENT_UPLOAD: UploadConfig = {
  dir: uploadDir('notification-attachments'),
  urlPrefix: uploadUrlPrefix('notification-attachments'),
  maxBytes: MAX_ATTACHMENT_BYTES,
  allowedMimeTypes: ALLOWED_ATTACHMENT_MIME_TYPES,
  noun: 'file',
};

export const SIGNATURE_UPLOAD: UploadConfig = {
  dir: uploadDir('company-signatures'),
  urlPrefix: uploadUrlPrefix('company-signatures'),
  maxBytes: MAX_SIGNATURE_BYTES,
  allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
  noun: 'image',
};

export const BRANDING_UPLOAD: UploadConfig = {
  dir: uploadDir('company-branding'),
  urlPrefix: uploadUrlPrefix('company-branding'),
  maxBytes: MAX_BRANDING_BYTES,
  allowedMimeTypes: ALLOWED_BRANDING_MIME_TYPES,
  noun: 'image',
};

export const PHOTO_UPLOAD: UploadConfig = {
  dir: PHOTO_UPLOAD_DIR,
  urlPrefix: PHOTO_URL_PREFIX,
  maxBytes: MAX_PHOTO_BYTES,
  allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
  noun: 'image',
};

/**
 * Thumbnail geometry. Small enough that a 50-row list downloads ~50 tiny
 * files, and cheap enough to generate once at upload time for every photo.
 */
export const THUMB_SIZE = 128;

const logger = new Logger('PhotoUpload');

/**
 * Derives the public path of the thumbnail that will accompany a photo.
 *
 * The full photo keeps its original extension; the thumbnail is always WebP,
 * so it gets its own name instead of swapping extensions — that keeps this
 * function a pure string transform with no filesystem access.
 */
export function thumbPathFor(photoPath: string): string {
  return `${photoPath.slice(0, photoPath.lastIndexOf('.'))}_thumb.webp`;
}

/**
 * Generates and stores a 128x128 WebP thumbnail next to the just-written photo.
 *
 * Returns the public thumbnail path, or null when sharp could not process the
 * image. Thumbnail failure is deliberately non-fatal: the photo itself has
 * already passed magic-byte validation and been saved, so a valid-but-unusual
 * image should still upload — the avatar fallback reads the full image.
 */
export async function saveThumbnail(photoPath: string): Promise<string | null> {
  const sourcePath = join(
    PHOTO_UPLOAD_DIR,
    photoPath.slice(PHOTO_URL_PREFIX.length + 1),
  );
  const thumbPath = thumbPathFor(photoPath);
  const targetPath = join(
    PHOTO_UPLOAD_DIR,
    thumbPath.slice(PHOTO_URL_PREFIX.length + 1),
  );

  try {
    await sharp(sourcePath)
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' })
      .webp({ quality: 80 })
      .toFile(targetPath);
    return thumbPath;
  } catch (error) {
    logger.warn(
      `Thumbnail generation failed for ${photoPath}: ${String(error)}`,
    );
    return null;
  }
}

/** The minimal shape of a multer file. */
export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * One kind of upload: where it lands, how big it may be, and what it may
 * contain. Passed to `validateUpload` / `saveUpload` / `deleteUpload` so each
 * module can set its own rules without restating the byte checks.
 */
export interface UploadConfig {
  /** Absolute directory files are written to. */
  dir: string;
  /** Public URL prefix `dir` is served under. */
  urlPrefix: string;
  maxBytes: number;
  allowedMimeTypes: readonly string[];
  /** Noun used in the rejection messages — 'image' for photos, 'file' otherwise. */
  noun: string;
}

function matchesMagicBytes(buffer: Buffer, mimetype: string): boolean {
  const signatures = MAGIC_BYTES[mimetype];
  if (!signatures) return false;

  // A PDF's header is allowed a small offset — some producers prepend bytes,
  // and readers accept it — so the marker is searched for near the start
  // rather than required at position 0. The window is bounded so this stays a
  // signature check and not a scan of the whole file for the string '%PDF'.
  if (mimetype === 'application/pdf') {
    return buffer.subarray(0, 1024).includes('%PDF');
  }

  const matchesPrefix = signatures.some((signature) =>
    signature.every((byte, index) => buffer[index] === byte),
  );

  if (!matchesPrefix) return false;

  // RIFF alone is also AVI/WAV, so require the WEBP marker too.
  if (mimetype === 'image/webp') {
    return buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }

  return true;
}

/** Validates an upload against a config, throwing 400 with a specific reason. */
export function validateUpload(
  file: UploadedFile | undefined,
  config: UploadConfig,
): UploadedFile {
  const { noun } = config;
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);

  if (!file) {
    throw new BadRequestException(`No ${noun} was uploaded`);
  }

  if (!config.allowedMimeTypes.includes(file.mimetype)) {
    throw new BadRequestException(
      `Unsupported ${noun} type. Allowed types: ${config.allowedMimeTypes.join(', ')}`,
    );
  }

  if (file.size > config.maxBytes) {
    const limitMb = (config.maxBytes / (1024 * 1024)).toFixed(0);
    throw new BadRequestException(
      `${Noun} is too large. Maximum size is ${limitMb} MB.`,
    );
  }

  if (!file.buffer?.length) {
    throw new BadRequestException(`The uploaded ${noun} is empty`);
  }

  if (!matchesMagicBytes(file.buffer, file.mimetype)) {
    throw new BadRequestException(
      `The uploaded ${noun} is not valid, or its contents do not match its type`,
    );
  }

  return file;
}

/**
 * Writes a validated upload to disk and returns its public path.
 *
 * The filename is a fresh UUID plus an extension derived from the verified
 * mimetype. The client's own filename is never used in the path, so it cannot
 * contain `../` or overwrite an existing file. Callers that need the original
 * name back (a download prompt, say) store it in a column of its own.
 */
export async function saveUpload(
  file: UploadedFile,
  config: UploadConfig,
): Promise<string> {
  if (!existsSync(config.dir)) {
    mkdirSync(config.dir, { recursive: true });
  }

  const extension = EXTENSION_BY_MIME[file.mimetype] ?? 'bin';
  const filename = `${randomUUID()}.${extension}`;

  await writeFile(join(config.dir, filename), file.buffer);

  return `${config.urlPrefix}/${filename}`;
}

/**
 * Best-effort removal of a previously stored upload.
 *
 * Never throws: a replaced file whose predecessor is already gone must not
 * fail the upload the user actually asked for. Paths outside this config's
 * directory are ignored, so a value tampered with in the database cannot be
 * used to delete arbitrary files.
 */
export async function deleteUpload(
  publicPath: string | null | undefined,
  config: UploadConfig,
): Promise<void> {
  if (!publicPath?.startsWith(`${config.urlPrefix}/`)) {
    return;
  }

  const filename = publicPath.slice(config.urlPrefix.length + 1);
  if (!filename || filename.includes('/') || filename.includes('\\')) {
    return;
  }

  const target = join(config.dir, filename);
  if (!target.startsWith(config.dir)) {
    return;
  }

  try {
    await unlink(target);
  } catch {
    // Already absent, or not removable — nothing useful to do here.
  }
}

/** Validates an uploaded photo, throwing 400 with a specific reason. */
export function validateImageUpload(file?: UploadedFile): UploadedFile {
  return validateUpload(file, PHOTO_UPLOAD);
}

/** Writes a validated photo to disk and returns its public path. */
export async function savePhoto(file: UploadedFile): Promise<string> {
  return saveUpload(file, PHOTO_UPLOAD);
}

/** Best-effort removal of a previously stored photo. */
export async function deletePhoto(publicPath?: string | null): Promise<void> {
  return deleteUpload(publicPath, PHOTO_UPLOAD);
}
