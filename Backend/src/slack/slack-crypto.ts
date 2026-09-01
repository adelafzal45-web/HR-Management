import { InternalServerErrorException, Logger } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

/**
 * Symmetric encryption for the stored Slack bot token.
 *
 * Why encryption and not hashing: unlike a user password, this credential has to
 * be *recovered* — it is presented to the Slack API as a bearer token on every
 * request. So the requirement is reversible-with-a-key, not one-way.
 *
 * AES-256-GCM specifically, because it is authenticated: a ciphertext modified
 * in the database fails the auth-tag check and throws, rather than silently
 * decrypting to garbage that then gets sent to Slack as an Authorization header.
 *
 * What this protects against: a leaked database dump or a SQL-injection read
 * does not yield a usable Slack credential. What it does not protect against:
 * an attacker who already has both the database and the application's
 * environment. That is inherent to any scheme where the app must be able to
 * decrypt unattended, and the honest mitigation is to keep
 * SLACK_ENCRYPTION_KEY out of the database and out of version control.
 *
 * This is a deliberate, self-contained copy of `mail/smtp-crypto.ts` keyed by
 * its own env var. Keeping the module independent — rather than importing the
 * mail helpers — matches how `mail/` is self-contained, and means a Slack
 * credential and an SMTP password never share a key.
 */

const logger = new Logger('SlackCrypto');

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit nonce, the size GCM is specified for.
const KEY_BYTES = 32;

/**
 * Marker prefix on stored ciphertext.
 *
 * Lets `decrypt` recognise a value it produced and refuse anything else, rather
 * than attempting to parse an arbitrary string and reporting a confusing error.
 * Also makes a stored value visibly non-plaintext to anyone reading the table.
 */
const PREFIX = 'gcm1';

/**
 * Derives the 32-byte key from SLACK_ENCRYPTION_KEY.
 *
 * A hex/base64 key of exactly 32 bytes is used directly. Anything else is run
 * through SHA-256 so an operator who sets a passphrase gets a valid key rather
 * than a boot failure. This is not a password-stretching KDF and does not need
 * to be: the input is expected to be generated entropy, not a human-chosen
 * secret, and the threat model here is database disclosure rather than offline
 * guessing of the key itself.
 *
 * Falls back to a fixed development key when the variable is unset, matching the
 * existing convention in `smtp-crypto.ts` (and `auth.constants.ts`) so local
 * development works without a .env file. It warns once, loudly, because shipping
 * that fallback to production would make the encryption decorative.
 */
let cachedKey: Buffer | null = null;
let warnedAboutFallback = false;

const DEV_FALLBACK_KEY = 'hrms-dev-slack-encryption-key-change-me-in-production';

function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const configured = process.env.SLACK_ENCRYPTION_KEY;

  if (!configured) {
    if (!warnedAboutFallback) {
      logger.warn(
        'SLACK_ENCRYPTION_KEY is not set — falling back to the built-in development key. ' +
          'Set SLACK_ENCRYPTION_KEY to a 32-byte random value before storing a real Slack bot token.',
      );
      warnedAboutFallback = true;
    }
    cachedKey = createHash('sha256').update(DEV_FALLBACK_KEY).digest();
    return cachedKey;
  }

  for (const encoding of ['hex', 'base64'] as const) {
    try {
      const decoded = Buffer.from(configured, encoding);
      if (decoded.length === KEY_BYTES) {
        cachedKey = decoded;
        return cachedKey;
      }
    } catch {
      // Not valid in this encoding — fall through to the digest below.
    }
  }

  cachedKey = createHash('sha256').update(configured, 'utf8').digest();
  return cachedKey;
}

/** True when `value` looks like output from `encrypt`. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(`${PREFIX}:`);
}

/** Encrypts a plaintext Slack bot token for storage. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return [
    PREFIX,
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/**
 * Decrypts a stored Slack bot token.
 *
 * Throws rather than returning null on a malformed or tampered value: silently
 * treating it as "no token" would turn a key rotation mistake into an
 * unauthenticated request against the Slack API, which is harder to diagnose
 * than an explicit failure.
 *
 * The thrown message never includes the ciphertext or the key.
 */
export function decrypt(stored: string): string {
  if (!isEncrypted(stored)) {
    throw new InternalServerErrorException(
      'Stored Slack bot token is not in the expected encrypted format',
    );
  }

  const [, ivB64, tagB64, payloadB64] = stored.split(':');

  if (!ivB64 || !tagB64 || !payloadB64) {
    throw new InternalServerErrorException(
      'Stored Slack bot token is malformed and cannot be decrypted',
    );
  }

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      encryptionKey(),
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(payloadB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Reached when the auth tag does not verify: either the row was modified or
    // SLACK_ENCRYPTION_KEY has changed since it was written.
    throw new InternalServerErrorException(
      'Stored Slack bot token could not be decrypted. It may have been written ' +
        'with a different SLACK_ENCRYPTION_KEY — re-enter the token in Slack settings.',
    );
  }
}

/** Test seam: clears the memoised key so a changed env var takes effect. */
export function resetKeyCacheForTesting(): void {
  cachedKey = null;
  warnedAboutFallback = false;
}
