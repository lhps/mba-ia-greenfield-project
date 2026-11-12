import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Channel } from './channel.entity';

/** One subscription per user per channel, enforced by the composite PK (phase-06 TD-07). */
@Entity('subscriptions')
// GET /me/subscriptions keyset: newest subscription first.
@Index(['user_id', 'created_at'])
export class Subscription {
  @PrimaryColumn({ type: 'uuid' })
  user_id: string;

  @Index()
  @PrimaryColumn({ type: 'uuid' })
  channel_id: string;

  // Millisecond precision so the created_at|nickname keyset cursor round-trips through a JS Date.
  @CreateDateColumn({ type: 'timestamptz', precision: 3 })
  created_at: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Channel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'channel_id' })
  channel: Channel;
}
