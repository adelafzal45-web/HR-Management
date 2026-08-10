import { config } from 'dotenv';

/**
 * Loads `.env` into `process.env`.
 *
 * This file exists because nothing was loading it. The backend reads a dozen
 * settings from `process.env` — `JWT_SECRET`, `SMTP_ENCRYPTION_KEY`,
 * `CORS_ORIGINS`, `PORT` and the rest — and `.env` defines them all, but with
 * no loader anywhere in `src/` every one of those reads fell through to its
 * development default. A deployment could fill in `.env` correctly and still be
 * running on the shipped dev secrets, which is the kind of failure that reports
 * itself as "working".
 *
 * Import this before anything that reads `process.env` at module scope.
 * `database.config.ts` and `upload-paths.ts` both do, so they are safe wherever
 * they are imported from; `main.ts` imports it on its first line so the auth and
 * mail constants are populated before their modules are evaluated.
 *
 * Variables already present in the real environment win over the file — that is
 * dotenv's default and what we want, so a hosting platform's own configuration
 * is authoritative and `.env` is only the local fallback.
 */
config();
