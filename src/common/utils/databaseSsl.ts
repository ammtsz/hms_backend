/**
 * Production Postgres TLS settings for managed hosts (e.g. Railway) whose CA chain
 * Node does not trust by default. Traffic is still encrypted; `rejectUnauthorized`
 * only controls whether the server certificate is verified.
 *
 * Set DATABASE_SSL_REJECT_UNAUTHORIZED=false on Railway (see .env.railway).
 */
export function getDatabaseSslConfig():
  | false
  | { rejectUnauthorized: boolean } {
  if (process.env.NODE_ENV !== 'production') {
    return false;
  }

  const rejectUnauthorized =
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED?.toLowerCase() !== 'false';

  return { rejectUnauthorized };
}
