import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

// Stub the passport AuthGuard so tests don't need real strategy
// NOTE: canActivate must be on the prototype so JwtAuthGuard.canActivate
// can override it; instance-property assignment would shadow the override.
const mockSuperCanActivate = jest.fn().mockReturnValue(true);

jest.mock('@nestjs/passport', () => ({
  AuthGuard: () =>
    class {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canActivate(...args: unknown[]): unknown {
        return mockSuperCanActivate(...args);
      }
    },
}));

import { JwtAuthGuard } from '../jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../../decorators/public.decorator';

describe('JwtAuthGuard – M1 global guard with @Public() bypass', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  beforeEach(() => {
    mockSuperCanActivate.mockClear();
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector);
  });

  function makeContext(): ExecutionContext {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  it('uses IS_PUBLIC_KEY constant to check the @Public() decorator', () => {
    expect(IS_PUBLIC_KEY).toBe('isPublic');
  });

  it('returns true for @Public() routes without calling super.canActivate', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    const result = guard.canActivate(makeContext());

    expect(result).toBe(true);
    expect(mockSuperCanActivate).not.toHaveBeenCalled();
  });

  it('calls super.canActivate for non-public routes', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    mockSuperCanActivate.mockReturnValue(true);

    guard.canActivate(makeContext());

    expect(mockSuperCanActivate).toHaveBeenCalledTimes(1);
  });

  it('propagates falsy result from super.canActivate (invalid token)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    mockSuperCanActivate.mockReturnValue(false);

    const result = guard.canActivate(makeContext());

    expect(result).toBe(false);
  });

  it('checks isPublic on both handler and class metadata', () => {
    const spy = jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    guard.canActivate(makeContext());

    expect(spy).toHaveBeenCalledWith('isPublic', expect.any(Array));
    const [, targets] = spy.mock.calls[0];
    expect((targets as unknown[]).length).toBe(2); // handler + class
  });
});
