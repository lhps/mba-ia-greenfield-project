import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { MailService } from '../../src/mail/mail.service';
import { DomainExceptionFilter } from '../../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../../src/common/filters/validation-exception.filter';
import { QUEUES } from '../../src/queue/queue.constants';
import { cleanAllTables } from '../../src/test/create-test-data-source';
import { User } from '../../src/users/entities/user.entity';
import { Video } from '../../src/videos/entities/video.entity';
import { generatePublicId } from '../../src/videos/public-id.util';

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
  const mailService = app.get(MailService);
  let token = '';
  jest
    .spyOn(mailService, 'sendConfirmationEmail')
    .mockImplementationOnce((_e: string, _n: string, t: string) => {
      token = t;
      return Promise.resolve();
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
  return (login.body as { access_token: string }).access_token;
}

/** Inserts a video row directly (bypassing upload/processing) for read-side scenarios. */
export async function seedVideo(
  ctx: VideosE2eContext,
  ownerEmail: string,
  overrides: Partial<Video> = {},
): Promise<Video> {
  const user = await ctx.dataSource.getRepository(User).findOneOrFail({
    where: { email: ownerEmail },
    relations: { channel: true },
  });
  const repository = ctx.dataSource.getRepository(Video);
  return repository.save(
    repository.create({
      channel_id: user.channel.id,
      public_id: generatePublicId(),
      file_name: 'clip.mov',
      title: 'clip',
      file_size: 1024,
      content_type: 'video/quicktime',
      original_key: 'unused',
      ...overrides,
    }),
  );
}
