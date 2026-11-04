import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { DomainExceptionFilter } from '../../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../../src/common/filters/validation-exception.filter';
import { QUEUES } from '../../src/queue/queue.constants';
import { cleanAllTables } from '../../src/test/create-test-data-source';

export interface VideosE2eContext {
  app: INestApplication<App>;
  dataSource: DataSource;
  processingQueue: Queue;
}

const baseBucket = process.env.S3_BUCKET;

/** Boots AppModule like main.ts, pointed at the test bucket and an isolated queue prefix. */
export async function createVideosApp(
  env: Record<string, string> = {},
): Promise<VideosE2eContext> {
  Object.assign(process.env, {
    S3_BUCKET: `${baseBucket}-test`,
    QUEUE_PREFIX: 'bull-e2e',
    ...env,
  });
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(
    new DomainExceptionFilter(),
    new ValidationExceptionFilter(),
  );
  await app.init();

  return {
    app,
    dataSource: moduleFixture.get(DataSource),
    processingQueue: moduleFixture.get(getQueueToken(QUEUES.VIDEO_PROCESSING)),
  };
}

export async function resetVideosState(ctx: VideosE2eContext): Promise<void> {
  await cleanAllTables(ctx.dataSource);
  ctx.app.get<ThrottlerStorageService>(ThrottlerStorage).storage.clear();
  await ctx.processingQueue.obliterate({ force: true });
}

/** Registers, confirms (token captured from the mail spy) and logs in; returns the access token. */
export async function createConfirmedUser(
  app: INestApplication<App>,
  email: string,
  password = 'password123',
): Promise<string> {
  const mailService = (app.get(AuthService) as any).mailService;
  let token = '';
  jest
    .spyOn(mailService, 'sendConfirmationEmail')
    .mockImplementationOnce(async (_e: string, _n: string, t: string) => {
      token = t;
    });
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password })
    .expect(201);
  await request(app.getHttpServer())
    .get('/auth/confirm-email')
    .query({ token })
    .expect(204);
  const login = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(200);
  return login.body.access_token as string;
}
