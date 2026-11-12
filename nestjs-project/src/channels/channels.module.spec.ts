import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { User } from '../users/entities/user.entity';
import authConfig from '../config/auth.config';
import { createTestDataSource } from '../test/create-test-data-source';
import { Channel } from './entities/channel.entity';
import { ChannelsModule } from './channels.module';
import { SubscriptionsService } from './subscriptions.service';
import { Video } from '../videos/entities/video.entity';
import { Category } from '../categories/entities/category.entity';
import { Subscription } from './entities/subscription.entity';

const ALL_ENTITIES = [
  User,
  Channel,
  RefreshToken,
  VerificationToken,
  Video,
  Category,
  Subscription,
];

describe('ChannelsModule', () => {
  it('should compile with AuthJwtModule, resolving the optional-auth guard without a circular import', async () => {
    const module = await Test.createTestingModule({
      imports: [
        // AuthJwtModule (imported by ChannelsModule) reads the global auth config.
        ConfigModule.forRoot({ isGlobal: true, load: [authConfig] }),
        TypeOrmModule.forRoot(createTestDataSource(ALL_ENTITIES).options),
        ChannelsModule,
      ],
    }).compile();

    expect(module.get(SubscriptionsService)).toBeInstanceOf(
      SubscriptionsService,
    );
    expect(module.get(JwtService)).toBeInstanceOf(JwtService);
    await module.close();
  }, 30000);
});
