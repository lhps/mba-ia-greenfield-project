import { ExecutionContext } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

const TEST_SECRET = 'test-secret';

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('OptionalJwtAuthGuard', () => {
  let guard: OptionalJwtAuthGuard;
  let jwtService: JwtService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: TEST_SECRET,
          signOptions: { expiresIn: '15m' },
        }),
      ],
      providers: [OptionalJwtAuthGuard],
    }).compile();

    guard = module.get(OptionalJwtAuthGuard);
    jwtService = module.get(JwtService);
  });

  it('should set request.user from a valid bearer token', async () => {
    const token = jwtService.sign({ sub: 'user-1', email: 'a@example.com' });
    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${token}` },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(request.user).toMatchObject({
      sub: 'user-1',
      email: 'a@example.com',
    });
  });

  it('should stay anonymous when the Authorization header is missing', async () => {
    const request: Record<string, unknown> = { headers: {} };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('should stay anonymous on a non-Bearer Authorization header', async () => {
    const request: Record<string, unknown> = {
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('should stay anonymous on an invalid token', async () => {
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer not-a-valid-jwt' },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('should stay anonymous on a token signed with another secret', async () => {
    const token = new JwtService({ secret: 'other-secret' }).sign({
      sub: 'user-1',
      email: 'a@example.com',
    });
    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${token}` },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('should stay anonymous on an expired token', async () => {
    const expiredToken = jwtService.sign(
      { sub: 'user-1', email: 'a@example.com' },
      { expiresIn: -60 },
    );
    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${expiredToken}` },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });
});
