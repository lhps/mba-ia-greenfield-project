import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Video } from '../../videos/entities/video.entity';

@Entity('comments')
// Roots page (parent_id IS NULL, newest-first) and replies page (oldest-first) keysets (phase-06 TD-05).
@Index(['video_id', 'parent_id', 'created_at', 'id'])
@Index(['parent_id', 'created_at', 'id'])
export class Comment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  video_id: string;

  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  /** Always a root comment: replies have one level (phase-06 TD-04). */
  @Column({ type: 'uuid', nullable: true })
  parent_id: string | null;

  /** `null` once a root with replies is turned into a placeholder (phase-06 TD-06). */
  @Column({ type: 'varchar', length: 2000, nullable: true })
  body: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  deleted_at: Date | null;

  @Column({ type: 'integer', default: 0 })
  like_count: number;

  @Column({ type: 'integer', default: 0 })
  dislike_count: number;

  /** Non-deleted replies of a root; always 0 on replies (phase-06 TD-02). */
  @Column({ type: 'integer', default: 0 })
  reply_count: number;

  // Millisecond precision so the created_at|id keyset cursor round-trips through a JS Date.
  @CreateDateColumn({ type: 'timestamptz', precision: 3 })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @ManyToOne(() => Video, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'video_id' })
  video: Video;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Comment, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parent_id' })
  parent: Comment | null;
}
