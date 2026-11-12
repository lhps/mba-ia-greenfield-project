import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import {
  REACTION_VALUE,
  REACTION_VALUE_ENUM_NAME,
  type ReactionValue,
} from '../../videos/videos.constants';
import { Comment } from './comment.entity';

/** One like/dislike per user per comment, enforced by the composite PK (phase-06 TD-01). */
@Entity('comment_reactions')
export class CommentReaction {
  @PrimaryColumn({ type: 'uuid' })
  user_id: string;

  @Index()
  @PrimaryColumn({ type: 'uuid' })
  comment_id: string;

  @Column({
    type: 'enum',
    enum: Object.values(REACTION_VALUE),
    enumName: REACTION_VALUE_ENUM_NAME,
  })
  value: ReactionValue;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Comment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'comment_id' })
  comment: Comment;
}
