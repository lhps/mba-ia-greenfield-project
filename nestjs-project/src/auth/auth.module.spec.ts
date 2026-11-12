import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import appConfig from '../config/app.config';
import authConfig from '../config/auth.config';
import mailConfig from '../config/mail.config';
import { Channel } from '../channels/entities/channel.entity';
import { User } from '../users/entities/user.entity';
import { createTestDataSource } from '../test/create-test-data-source';
import { AuthModule } from './auth.module';
import { RefreshToken } from './entities/refresh-token.entity';
import { VerificationToken } from './entities/verification-token.entity';
import { Video } from '../videos/entities/video.entity';
import { Category } from '../categories/entities/category.entity';
import { Subscription } from '../channels/entities/subscription.entity';

const ALL_ENTITIES = [
  User,
  Channel,
  RefreshToken,
  VerificationToken,
  Video,
  Category,
  Subscription,
];

describe('AuthModule', () => {
  it('should compile successfully with JwtModule, TypeOrmModule, UsersModule, and MailModule', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [appConfig, authConfig, mailConfig],
        }),
        TypeOrmModule.forRoot(createTestDataSource(ALL_ENTITIES).options),
        AuthModule,
      ],
    }).compile();

    expect(module).toBeDefined();
    await module.close();
  }, 30000);

  it('should still provide JwtService to importers through AuthJwtModule', async () => {
    @Module({
      imports: [AuthModule],
      providers: [{ provide: 'JWT', useExisting: JwtService }],
      exports: ['JWT'],
    })
    class ImporterModule {}

    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [appConfig, authConfig, mailConfig],
        }),
        TypeOrmModule.forRoot(createTestDataSource(ALL_ENTITIES).options),
        ImporterModule,
      ],
    }).compile();

    expect(module.get('JWT')).toBeInstanceOf(JwtService);
    await module.close();
  }, 30000);
});
