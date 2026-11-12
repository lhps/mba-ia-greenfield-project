import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
// AuthJwtModule (not AuthModule): JwtService for OptionalJwtAuthGuard without the
// Channels → Auth → Users → Channels import cycle.
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { ChannelSubscriptionsController } from './channel-subscriptions.controller';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { Channel } from './entities/channel.entity';
import { Subscription } from './entities/subscription.entity';
import { MeSubscriptionsController } from './me-subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [TypeOrmModule.forFeature([Channel, Subscription]), AuthJwtModule],
  controllers: [
    ChannelsController,
    ChannelSubscriptionsController,
    MeSubscriptionsController,
  ],
  providers: [ChannelsService, SubscriptionsService],
  exports: [TypeOrmModule, ChannelsService, SubscriptionsService],
})
export class ChannelsModule {}
