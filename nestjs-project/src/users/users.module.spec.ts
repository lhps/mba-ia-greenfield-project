import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import authConfig from '../config/auth.config';
import { createTestDataSource } from '../test/create-test-data-source';
import { Channel } from '../channels/entities/channel.entity';
import { User } from './entities/user.entity';
import { UsersModule } from './users.module';
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

describe('UsersModule', () => {
  it('should compile successfully', async () => {
    const module = await Test.createTestingModule({
      imports: [
        // AuthJwtModule (imported by ChannelsModule) reads the global auth config.
        ConfigModule.forRoot({ isGlobal: true, load: [authConfig] }),
        TypeOrmModule.forRoot(createTestDataSource(ALL_ENTITIES).options),
        UsersModule,
      ],
    }).compile();

    expect(module).toBeDefined();
    await module.close();
  }, 30000);
});
