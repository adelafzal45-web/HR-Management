import './env';



const isProduction = process.env.NODE_ENV === 'production';

function setting(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value) return value;

  if (isProduction) {
    throw new Error(
      `${name} is not set. Database settings must come from the environment ` +
        `when NODE_ENV=production. See .env.example for the full list.`,
    );
  }

  return devFallback;
}

const port = Number(setting('DB_PORT', '5432'));
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`DB_PORT must be a port number, received "${port}".`);
}

/**
 * Whether to connect over TLS. Off by default so local development is
 * unaffected, but most managed Postgres providers require it, and the driver
 * rejects the connection outright without it.
 *
 * `rejectUnauthorized: false` accompanies it because those same providers
 * commonly present a certificate signed by their own internal CA, which Node
 * will not validate against the system trust store. This still encrypts the
 * connection; it does not authenticate the server, so point `DB_HOST` at a host
 * you trust — on managed platforms that is a private network address.
 */
const useSsl = process.env.DB_SSL === 'true';

export const databaseConfig = {
  type: 'postgres',
  host: setting('DB_HOST', 'localhost'),
  port,
  username: setting('DB_USER', 'postgres'),
  password: setting('DB_PASSWORD', 'admin'),
  database: setting('DB_NAME', 'HR'),
 

  /**
   * Never enabled, and deliberately not configurable. The schema belongs to the
   * migrations in `src/migrations`; letting TypeORM reshape it from the entity
   * definitions would drop columns those migrations added.
   */
  synchronize: false,
} as const;
