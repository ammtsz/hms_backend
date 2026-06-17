import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BffSecretGuard, BFF_SECRET_HEADER } from '../bff-secret.guard';

describe('BffSecretGuard', () => {
  let guard: BffSecretGuard;
  let configService: jest.Mocked<Pick<ConfigService, 'get'>>;

  function makeContext(headerValue?: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: headerValue !== undefined ? { [BFF_SECRET_HEADER]: headerValue } : {},
        }),
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    configService = { get: jest.fn() };
    guard = new BffSecretGuard(configService as unknown as ConfigService);
  });

  it('allows requests in development when secret is not configured', () => {
    configService.get.mockImplementation((key: string) =>
      key === 'NODE_ENV' ? 'development' : undefined,
    );

    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('rejects requests in production when secret is not configured', () => {
    configService.get.mockImplementation((key: string) =>
      key === 'NODE_ENV' ? 'production' : undefined,
    );

    expect(() => guard.canActivate(makeContext())).toThrow(UnauthorizedException);
  });

  it('rejects requests when secret is configured but header is missing', () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'BFF_INTERNAL_SECRET') return 'expected-secret';
      if (key === 'NODE_ENV') return 'development';
      return undefined;
    });

    expect(() => guard.canActivate(makeContext())).toThrow(UnauthorizedException);
  });

  it('rejects requests when header does not match', () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'BFF_INTERNAL_SECRET') return 'expected-secret';
      if (key === 'NODE_ENV') return 'development';
      return undefined;
    });

    expect(() => guard.canActivate(makeContext('wrong-secret'))).toThrow(
      UnauthorizedException,
    );
  });

  it('allows requests when header matches configured secret', () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'BFF_INTERNAL_SECRET') return 'expected-secret';
      if (key === 'NODE_ENV') return 'development';
      return undefined;
    });

    expect(guard.canActivate(makeContext('expected-secret'))).toBe(true);
  });
});
