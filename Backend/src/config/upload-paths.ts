import './env';
import { resolve } from 'path';

/**
 * Where uploaded files live.
 *
 * Every upload directory used to be spelled `resolve(process.cwd(), 'uploads',
 * …)` at its own definition site — six of them, across three files. That is
 * fine on a machine where the working directory is the checkout and stays put,
 * and wrong on essentially every hosting platform: a deploy that rebuilds into
 * a fresh directory takes every logo, signature, employee photo, document and
 * notification attachment with it. The files are not in the repository and are
 * not in the database, so there is nothing to restore them from.
 *
 * `UPLOADS_ROOT` makes that one setting. Point `UPLOADS_DIR` at a disk that
 * survives deploys — a mounted volume, a persistent-storage path, an NFS share
 * — and every upload follows it, including the static route in `main.ts` that
 * serves them back. Left unset, it resolves exactly where it always did, so
 * local development and existing checkouts are unaffected.
 *
 * A relative value is resolved against the working directory, so `UPLOADS_DIR=
 * ../persistent/uploads` works as expected; an absolute one such as
 * `/var/data/uploads` is used as given.
 */
export const UPLOADS_ROOT = resolve(
  process.cwd(),
  process.env.UPLOADS_DIR || 'uploads',
);

/**
 * The public URL prefix `UPLOADS_ROOT` is served under, and the prefix stored
 * paths begin with.
 *
 * Deliberately not configurable: it is baked into the `attachment_url`,
 * `profile_image` and branding paths already written to the database. Changing
 * it would strand every existing row, and `deleteUpload` compares stored paths
 * against it to decide whether a file belongs to a given upload kind.
 */
export const UPLOADS_URL_PREFIX = '/uploads';

/** Resolves one upload directory beneath the configured root. */
export function uploadDir(...segments: string[]): string {
  return resolve(UPLOADS_ROOT, ...segments);
}

/** The public URL prefix matching `uploadDir(...segments)`. */
export function uploadUrlPrefix(...segments: string[]): string {
  return `${UPLOADS_URL_PREFIX}/${segments.join('/')}`;
}
