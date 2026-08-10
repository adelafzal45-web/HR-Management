import { BadRequestException } from '@nestjs/common';
import { unlink } from 'fs/promises';
import { join } from 'path';

import {
  ATTACHMENT_UPLOAD,
  BRANDING_UPLOAD,
  PHOTO_UPLOAD,
  SIGNATURE_UPLOAD,
  deleteUpload,
  thumbPathFor,
  validateUpload,
  type UploadedFile,
} from './image-upload';

jest.mock('fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

const unlinkMock = unlink as jest.MockedFunction<typeof unlink>;

/**
 * The upload gatekeeper: what may be stored, and what may be deleted.
 *
 * Both halves are security checks rather than conveniences. `validateUpload` is
 * what stops a mimetype header — which the client writes and can say anything —
 * from being taken at its word, and `deleteUpload` is what stops a tampered
 * database value from removing a file it does not own. Neither has an
 * observable effect when it works, so a regression in either would be silent.
 */
describe('upload validation', () => {
  /** Leading bytes of each real format, enough for the signature check. */
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const JPEG = [0xff, 0xd8, 0xff, 0xe0];
  const GIF = [...Buffer.from('GIF89a')];
  const PDF = [...Buffer.from('%PDF-1.7\n')];

  const file = (over: Partial<UploadedFile> = {}): UploadedFile => ({
    originalname: 'policy.pdf',
    mimetype: 'application/pdf',
    size: 1024,
    buffer: Buffer.from(PDF),
    ...over,
  });

  /** A RIFF container that is not WebP — the AVI/WAV case the marker rules out. */
  const riff = (marker: string) =>
    Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from(marker),
    ]);

  const reasonFor = (run: () => unknown): string => {
    try {
      run();
      return '';
    } catch (error) {
      return (error as BadRequestException).message;
    }
  };

  describe('what the bytes actually are', () => {
    it('accepts a PDF attachment', () => {
      expect(() => validateUpload(file(), ATTACHMENT_UPLOAD)).not.toThrow();
    });

    it('rejects a buffer that only claims to be a PDF', () => {
      // The whole point of the magic-byte check: an executable renamed and sent
      // with `Content-Type: application/pdf` passes every header-based test.
      const disguised = file({ buffer: Buffer.from('MZ\x90\x00executable') });

      expect(reasonFor(() => validateUpload(disguised, ATTACHMENT_UPLOAD))).toBe(
        'The uploaded file is not valid, or its contents do not match its type',
      );
    });

    it('rejects a PNG buffer sent as a PDF', () => {
      // Both types are individually allowed here, so only the cross-check
      // between the claimed type and the bytes catches this one.
      const mismatched = file({ buffer: Buffer.from(PNG) });

      expect(() => validateUpload(mismatched, ATTACHMENT_UPLOAD)).toThrow(
        BadRequestException,
      );
    });

    it('finds a PDF header that sits a little way into the file', () => {
      // Some producers prepend bytes and readers accept it, so the marker is
      // searched for near the start rather than required at offset 0.
      const offset = file({
        buffer: Buffer.concat([Buffer.alloc(64), Buffer.from(PDF)]),
      });

      expect(() => validateUpload(offset, ATTACHMENT_UPLOAD)).not.toThrow();
    });

    it('does not scan the whole file for the marker', () => {
      // Past the 1 KB window a stray '%PDF' in the body is just data. Accepting
      // it would make the check meaningless for any large file.
      const late = file({
        buffer: Buffer.concat([Buffer.alloc(4096), Buffer.from(PDF)]),
      });

      expect(() => validateUpload(late, ATTACHMENT_UPLOAD)).toThrow(
        BadRequestException,
      );
    });

    it('requires the WEBP marker, not just the RIFF container', () => {
      const avi = file({ mimetype: 'image/webp', buffer: riff('AVI ') });
      const webp = file({ mimetype: 'image/webp', buffer: riff('WEBP') });

      expect(() => validateUpload(avi, PHOTO_UPLOAD)).toThrow(
        BadRequestException,
      );
      expect(() => validateUpload(webp, PHOTO_UPLOAD)).not.toThrow();
    });

    it('accepts each still-image type it claims to', () => {
      const cases: Array<[string, number[]]> = [
        ['image/png', PNG],
        ['image/jpeg', JPEG],
        ['image/gif', GIF],
      ];

      for (const [mimetype, bytes] of cases) {
        expect(() =>
          validateUpload(
            file({ mimetype, buffer: Buffer.from(bytes) }),
            PHOTO_UPLOAD,
          ),
        ).not.toThrow();
      }
    });
  });

  describe('what each kind of upload will take', () => {
    it('refuses a PDF as a signature, though it is a valid attachment', () => {
      // Signatures are drawn onto a certificate. A PDF cannot be, so the
      // narrower list is the one that matters here.
      expect(reasonFor(() => validateUpload(file(), SIGNATURE_UPLOAD))).toContain(
        'Unsupported image type',
      );
    });

    it('refuses an SVG logo', () => {
      // Uploads are served unauthenticated from the API origin, and an SVG can
      // carry script — accepting one would let anyone who can change the logo
      // run script on that origin.
      const svg = file({
        mimetype: 'image/svg+xml',
        buffer: Buffer.from('<svg onload="alert(1)"/>'),
      });

      expect(() => validateUpload(svg, BRANDING_UPLOAD)).toThrow(
        BadRequestException,
      );
    });

    it('applies each kind’s own size cap', () => {
      // A PNG, because both configs accept the type — so the cap is the only
      // thing that differs between the two calls.
      const big = file({
        mimetype: 'image/png',
        buffer: Buffer.from(PNG),
        size: 3 * 1024 * 1024,
      });

      // 3 MB: over the 1 MB signature cap, under the 5 MB attachment one.
      expect(reasonFor(() => validateUpload(big, SIGNATURE_UPLOAD))).toBe(
        'Image is too large. Maximum size is 1 MB.',
      );
      expect(() => validateUpload(big, ATTACHMENT_UPLOAD)).not.toThrow();
    });

    it('names the noun the caller configured', () => {
      // 'file' for attachments, 'image' everywhere else — the message is shown
      // to the person uploading.
      expect(reasonFor(() => validateUpload(undefined, ATTACHMENT_UPLOAD))).toBe(
        'No file was uploaded',
      );
      expect(reasonFor(() => validateUpload(undefined, PHOTO_UPLOAD))).toBe(
        'No image was uploaded',
      );
    });

    it('rejects an empty buffer before it reads any bytes from it', () => {
      const empty = file({ buffer: Buffer.alloc(0) });

      expect(reasonFor(() => validateUpload(empty, ATTACHMENT_UPLOAD))).toBe(
        'The uploaded file is empty',
      );
    });
  });

  describe('deleting only what belongs to this kind', () => {
    beforeEach(() => unlinkMock.mockClear());

    it('removes a file under its own prefix', async () => {
      await deleteUpload(
        `${ATTACHMENT_UPLOAD.urlPrefix}/9f3c1b2a.pdf`,
        ATTACHMENT_UPLOAD,
      );

      expect(unlinkMock).toHaveBeenCalledWith(
        join(ATTACHMENT_UPLOAD.dir, '9f3c1b2a.pdf'),
      );
    });

    it('ignores a path belonging to another kind', async () => {
      // A tampered signature URL must not become a way to delete somebody's
      // photo — which is why each kind has a directory of its own.
      await deleteUpload(
        `${PHOTO_UPLOAD.urlPrefix}/someones-face.png`,
        SIGNATURE_UPLOAD,
      );

      expect(unlinkMock).not.toHaveBeenCalled();
    });

    it('ignores a traversal attempt dressed as the right prefix', async () => {
      await deleteUpload(
        `${ATTACHMENT_UPLOAD.urlPrefix}/../../.env`,
        ATTACHMENT_UPLOAD,
      );

      expect(unlinkMock).not.toHaveBeenCalled();
    });

    it('does nothing for an absent path', async () => {
      await deleteUpload(null, ATTACHMENT_UPLOAD);
      await deleteUpload(undefined, ATTACHMENT_UPLOAD);
      await deleteUpload('', ATTACHMENT_UPLOAD);

      expect(unlinkMock).not.toHaveBeenCalled();
    });

    it('swallows a failure to remove a file that is already gone', async () => {
      unlinkMock.mockRejectedValueOnce(new Error('ENOENT'));

      await expect(
        deleteUpload(`${PHOTO_UPLOAD.urlPrefix}/gone.png`, PHOTO_UPLOAD),
      ).resolves.toBeUndefined();
    });
  });

  describe('thumbnail naming', () => {
    it('keeps the name and always uses webp', () => {
      expect(thumbPathFor('/uploads/employee-photos/abc.jpg')).toBe(
        '/uploads/employee-photos/abc_thumb.webp',
      );
    });
  });
});
