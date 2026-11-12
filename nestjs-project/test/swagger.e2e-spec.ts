import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import { buildSwaggerConfig } from '../src/swagger/swagger-document';

async function createApp(withSwagger: boolean): Promise<INestApplication<App>> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<NestExpressApplication>();
  app.set('trust proxy', 1);
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

  if (withSwagger) {
    const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
    SwaggerModule.setup('api/docs', app, document, {
      customSiteTitle: 'StreamTube API Docs',
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.init();
  return app;
}

describe('Swagger endpoints (e2e)', () => {
  describe('when SWAGGER_ENABLED=true', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      process.env.SWAGGER_ENABLED = 'true';
      app = await createApp(true);
    });

    afterAll(async () => {
      await app.close();
      delete process.env.SWAGGER_ENABLED;
    });

    it('GET /api/docs returns 200 with HTML containing the custom title', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/docs')
        .expect(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toContain('StreamTube API Docs');
    });

    it('GET /api/docs-json returns 200 with valid OpenAPI JSON', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      const doc = res.body as Record<string, unknown>;
      expect((doc.info as Record<string, unknown>).title).toBe(
        'StreamTube API',
      );
      expect(
        (doc.components as Record<string, unknown>)?.securitySchemes as Record<
          string,
          unknown
        >,
      ).toMatchObject({
        'access-token': { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      });
    });

    it('GET /api/docs-json documents the video operations with bearer security on protected ones', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);
      const paths = (res.body as Record<string, unknown>).paths as Record<
        string,
        Record<string, { security?: unknown[] }>
      >;
      const operations: [string, string, boolean][] = [
        ['/videos', 'post', true],
        ['/videos/{id}/upload/parts', 'post', true],
        ['/videos/{id}/upload/complete', 'post', true],
        ['/videos/{id}', 'get', false],
        ['/videos/{id}/stream', 'get', false],
        ['/videos/{id}/download', 'get', true],
      ];

      for (const [path, method, isProtected] of operations) {
        const operation = paths[path]?.[method];
        expect(operation).toBeDefined();
        if (isProtected) {
          expect(operation.security).toEqual([{ 'access-token': [] }]);
        } else {
          expect(operation.security).toBeUndefined();
        }
      }
    });

    it('GET /api/docs-json documents the Phase 04 video and channel management operations with bearer security only on authenticated ones', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);
      const paths = (res.body as Record<string, unknown>).paths as Record<
        string,
        Record<string, { security?: unknown[] }>
      >;
      const operations: [string, string, boolean][] = [
        ['/categories', 'get', false],
        ['/videos/{id}', 'get', false],
        ['/videos/{id}/stream', 'get', false],
        ['/videos/{id}', 'patch', true],
        ['/videos/{id}/publish', 'post', true],
        ['/videos/{id}/unpublish', 'post', true],
        ['/videos/{id}/thumbnail', 'put', true],
        ['/channels/me', 'get', true],
        ['/channels/me', 'patch', true],
        ['/channels/me/videos', 'get', true],
        ['/channels/{nickname}', 'get', false],
        ['/channels/{nickname}/videos', 'get', false],
      ];

      for (const [path, method, isProtected] of operations) {
        const operation = paths[path]?.[method];
        expect(operation).toBeDefined();
        if (isProtected) {
          expect(operation.security).toEqual([{ 'access-token': [] }]);
        } else {
          expect(operation.security).toBeUndefined();
        }
      }
    });

    it('GET /api/docs-json documents the Phase 05 watch-page operations as public', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);
      const paths = (res.body as Record<string, unknown>).paths as Record<
        string,
        Record<
          string,
          { security?: unknown[]; responses: Record<string, unknown> }
        >
      >;

      const views = paths['/videos/{id}/views']?.post;
      expect(views).toBeDefined();
      expect(views.security).toBeUndefined();
      expect(Object.keys(views.responses).sort()).toEqual([
        '204',
        '404',
        '409',
      ]);

      const suggestions = paths['/videos/{id}/suggestions']?.get;
      expect(suggestions).toBeDefined();
      expect(suggestions.security).toBeUndefined();
      expect(Object.keys(suggestions.responses).sort()).toEqual(['200', '404']);
    });

    it('GET /api/docs-json documents view_count and the channel summary on VideoDetailDto', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);
      const schemas = (
        (res.body as Record<string, unknown>).components as Record<
          string,
          Record<string, { properties: Record<string, unknown> }>
        >
      ).schemas;

      expect(schemas.VideoDetailDto.properties).toMatchObject({
        view_count: { type: 'integer' },
        channel: { $ref: '#/components/schemas/VideoChannelDto' },
      });
      expect(Object.keys(schemas.VideoChannelDto.properties).sort()).toEqual([
        'is_subscribed',
        'name',
        'nickname',
        'subscriber_count',
      ]);
    });

    it('GET /api/docs-json documents the Phase 06 social operations with bearer security only on writes and /me reads', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);
      const paths = (res.body as Record<string, unknown>).paths as Record<
        string,
        Record<string, { security?: unknown[] }>
      >;
      const operations: [string, string, boolean][] = [
        ['/videos/{id}/reaction', 'put', true],
        ['/videos/{id}/reaction', 'delete', true],
        ['/videos/{id}/comments', 'get', false],
        ['/videos/{id}/comments', 'post', true],
        ['/comments/{id}/replies', 'get', false],
        ['/comments/{id}', 'delete', true],
        ['/comments/{id}/reaction', 'put', true],
        ['/comments/{id}/reaction', 'delete', true],
        ['/channels/{nickname}/subscription', 'put', true],
        ['/channels/{nickname}/subscription', 'delete', true],
        ['/me/subscriptions', 'get', true],
        ['/me/subscriptions/videos', 'get', true],
      ];

      for (const [path, method, isProtected] of operations) {
        const operation = paths[path]?.[method];
        expect(operation).toBeDefined();
        if (isProtected) {
          expect(operation.security).toEqual([{ 'access-token': [] }]);
        } else {
          expect(operation.security).toBeUndefined();
        }
      }
    });

    it('GET /api/docs-json documents the Phase 06 schemas and the social fields of VideoDetail and PublicChannel', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);
      const schemas = (
        (res.body as Record<string, unknown>).components as Record<
          string,
          Record<string, { properties: Record<string, unknown> }>
        >
      ).schemas;

      for (const name of [
        'ReactionStateDto',
        'CommentDto',
        'CommentPageDto',
        'SubscriptionStateDto',
        'SubscribedChannelPageDto',
      ]) {
        expect(schemas[name]).toBeDefined();
      }
      expect(Object.keys(schemas.VideoDetailDto.properties)).toEqual(
        expect.arrayContaining(['like_count', 'comment_count', 'my_reaction']),
      );
      expect(Object.keys(schemas.PublicChannelDto.properties)).toEqual(
        expect.arrayContaining(['subscriber_count', 'is_subscribed']),
      );
    });

    it('GET /api/docs-json documents PUT /videos/{id}/thumbnail as a multipart upload with a required binary file', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);
      const paths = (res.body as Record<string, unknown>).paths as Record<
        string,
        Record<string, { requestBody?: Record<string, unknown> }>
      >;

      const requestBody = paths['/videos/{id}/thumbnail']?.put?.requestBody;

      expect(requestBody).toMatchObject({
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['file'],
              properties: { file: { type: 'string', format: 'binary' } },
            },
          },
        },
      });
    });

    it('GET /api/docs-yaml returns 200 with YAML content', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/docs-yaml')
        .expect(200);
      expect(res.headers['content-type']).toMatch(/yaml/);
    });
  });

  describe('when SWAGGER_ENABLED is not set', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      delete process.env.SWAGGER_ENABLED;
      app = await createApp(false);
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /api/docs returns 404', async () => {
      await request(app.getHttpServer()).get('/api/docs').expect(404);
    });

    it('GET /api/docs-json returns 404', async () => {
      await request(app.getHttpServer()).get('/api/docs-json').expect(404);
    });

    it('GET /api/docs-yaml returns 404', async () => {
      await request(app.getHttpServer()).get('/api/docs-yaml').expect(404);
    });
  });
});
