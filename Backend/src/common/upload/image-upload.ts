import { BadRequestException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { writeFile, unlink } from 'fs/promises';
import { join, resolve } from 'path';
import sharp from 'sharp';

/**
 * Profile-photo upload handling.
 *
 * Files are taken into memory, verified, then written under `uploads/` with a
 * generated name. Multer's own `diskStorage` is deliberately not used: it
 * writes the file before any validation runs, so a rejected upload still leaves
 * a file on disk, and it derives the stored name from client input.
 */

/** 2 MB. Matches the limit the frontend enforces before uploading. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

/** Extension used on disk for each accepted type. */
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
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
};

/** Directory photos are written to, and the URL prefix they are served under. */
export const PHOTO_UPLOAD_DIR = resolve(process.cwd(), 'uploads', 'employee-photos');
export const PHOTO_URL_PREFIX = '/uploads/employee-photos';

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
  const sourcePath = join(PHOTO_UPLOAD_DIR, photoPath.slice(PHOTO_URL_PREFIX.length + 1));
  const thumbPath = thumbPathFor(photoPath);
  const targetPath = join(PHOTO_UPLOAD_DIR, thumbPath.slice(PHOTO_URL_PREFIX.length + 1));

  try {
    await sharp(sourcePath)
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' })
      .webp({ quality: 80 })
      .toFile(targetPath);
    return thumbPath;
  } catch (error) {
    logger.warn(`Thumbnail generation failed for ${photoPath}: ${String(error)}`);
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

function matchesMagicBytes(buffer: Buffer, mimetype: string): boolean {
  const signatures = MAGIC_BYTES[mimetype];
  if (!signatures) return false;

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

/** Validates an uploaded photo, throwing 400 with a specific reason. */
export function validateImageUpload(file?: UploadedFile): UploadedFile {
  if (!file) {
    throw new BadRequestException('No image file was uploaded');
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype as never)) {
    throw new BadRequestException(
      `Unsupported image type. Allowed types: ${ALLOWED_IMAGE_MIME_TYPES.join(', ')}`,
    );
  }

  if (file.size > MAX_PHOTO_BYTES) {
    const limitMb = (MAX_PHOTO_BYTES / (1024 * 1024)).toFixed(0);
    throw new BadRequestException(
      `Image is too large. Maximum size is ${limitMb} MB.`,
    );
  }

  if (!file.buffer?.length) {
    throw new BadRequestException('The uploaded image is empty');
  }

  if (!matchesMagicBytes(file.buffer, file.mimetype)) {
    throw new BadRequestException(
      'The uploaded file is not a valid image, or its contents do not match its type',
    );
  }

  return file;
}

/**
 * Writes a validated photo to disk and returns its public path.
 *
 * The filename is a fresh UUID plus an extension derived from the verified
 * mimetype. The client's own filename is never used in the path, so it cannot
 * contain `../` or overwrite an existing file.
 */
export async function savePhoto(file: UploadedFile): Promise<string> {
  if (!existsSync(PHOTO_UPLOAD_DIR)) {
    mkdirSync(PHOTO_UPLOAD_DIR, { recursive: true });
  }

  const extension = EXTENSION_BY_MIME[file.mimetype] ?? 'bin';
  const filename = `${randomUUID()}.${extension}`;

  await writeFile(join(PHOTO_UPLOAD_DIR, filename), file.buffer);

  return `${PHOTO_URL_PREFIX}/${filename}`;
}

/**
 * Best-effort removal of a previously stored photo.
 *
 * Never throws: a replaced photo whose old file is already gone must not fail
 * the upload the user actually asked for. Paths outside the upload directory
 * are ignored, so a value tampered with in the database cannot be used to
 * delete arbitrary files.
 */
export async function deletePhoto(publicPath?: string | null): Promise<void> {
  if (!publicPath?.startsWith(`${PHOTO_URL_PREFIX}/`)) {
    return;
  }

  const filename = publicPath.slice(PHOTO_URL_PREFIX.length + 1);
  if (!filename || filename.includes('/') || filename.includes('\\')) {
    return;
  }

  const target = join(PHOTO_UPLOAD_DIR, filename);
  if (!target.startsWith(PHOTO_UPLOAD_DIR)) {
    return;
  }

  try {
    await unlink(target);
  } catch {
    // Already absent, or not removable — nothing useful to do here.
  }
}
