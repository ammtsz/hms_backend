import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

/** Header sent by the Next.js BFF (Server Actions / API routes) only. */
export const BFF_SECRET_HEADER = 'x-bff-secret';

@Injectable()
export class BffSecretGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.configService.get<string>('BFF_INTERNAL_SECRET')?.trim();
    const nodeEnv =
      this.configService.get<string>('NODE_ENV') || process.env.NODE_ENV;
    const isProduction = nodeEnv === 'production';

    if (!expected) {
      if (isProduction) {
        throw new UnauthorizedException('Unauthorized');
      }
      return true;
    }

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const raw = request.headers[BFF_SECRET_HEADER];
    const provided = (Array.isArray(raw) ? raw[0] : raw)?.trim();

    if (!provided || !this.secretsMatch(expected, provided)) {
      throw new UnauthorizedException('Unauthorized');
    }

    return true;
  }

  private secretsMatch(expected: string, provided: string): boolean {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(provided, 'utf8');
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  }
}
