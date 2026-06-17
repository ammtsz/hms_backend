import { getDatabaseSslConfig } from '../databaseSsl';

describe('getDatabaseSslConfig', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSslReject = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalSslReject === undefined) {
      delete process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;
    } else {
      process.env.DATABASE_SSL_REJECT_UNAUTHORIZED = originalSslReject;
    }
  });

  it('returns false in non-production', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;

    expect(getDatabaseSslConfig()).toBe(false);
  });

  it('defaults to strict verification in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;

    expect(getDatabaseSslConfig()).toEqual({ rejectUnauthorized: true });
  });

  it('allows relaxed verification when DATABASE_SSL_REJECT_UNAUTHORIZED=false', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED = 'false';

    expect(getDatabaseSslConfig()).toEqual({ rejectUnauthorized: false });
  });

  it('treats DATABASE_SSL_REJECT_UNAUTHORIZED=FALSE case-insensitively', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED = 'FALSE';

    expect(getDatabaseSslConfig()).toEqual({ rejectUnauthorized: false });
  });
});
