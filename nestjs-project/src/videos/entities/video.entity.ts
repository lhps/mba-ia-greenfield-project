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
import { Category } from '../../categories/entities/category.entity';
import { Channel } from '../../channels/entities/channel.entity';
import {
  PROCESSING_STATUS,
  PUBLICATION_STATUS,
  VISIBILITY,
  type ProcessingStatus,
  type PublicationStatus,
  type Visibility,
} from '../videos.constants';

@Entity('videos')
@Index(['processing_status', 'created_at'])
@Index(['channel_id', 'created_at'])
@Index(['channel_id', 'published_at', 'public_id'])
// Suggestions sidebar: same category ordered by view_count, then recency (phase-05 TD-02).
@Index(['category_id', 'view_count', 'published_at'])
export class Video {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 11, unique: true })
  public_id: string;

  @Index()
  @Column({ type: 'uuid' })
  channel_id: string;

  @Column({ type: 'varchar', length: 255 })
  file_name: string;

  @Column({ type: 'varchar', length: 100 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  category_id: string | null;

  @Column({
    type: 'bigint',
    transformer: {
      to: (value: number) => value,
      from: (value: string | null) => (value === null ? null : Number(value)),
    },
  })
  file_size: number;

  @Column({ type: 'varchar', length: 100 })
  content_type: string;

  @Column({
    type: 'enum',
    enum: Object.values(PROCESSING_STATUS),
    default: PROCESSING_STATUS.UPLOADING,
  })
  processing_status: ProcessingStatus;

  @Column({
    type: 'enum',
    enum: Object.values(PUBLICATION_STATUS),
    default: PUBLICATION_STATUS.DRAFT,
  })
  publication_status: PublicationStatus;

  @Column({
    type: 'enum',
    enum: Object.values(VISIBILITY),
    default: VISIBILITY.PUBLIC,
  })
  visibility: Visibility;

  @Column({ type: 'timestamptz', nullable: true })
  published_at: Date | null;

  @Column({ type: 'varchar', nullable: true })
  upload_id: string | null;

  @Column({ type: 'varchar' })
  original_key: string;

  @Column({ type: 'varchar', nullable: true })
  video_key: string | null;

  @Column({ type: 'varchar', nullable: true })
  thumbnail_key: string | null;

  @Column({ type: 'boolean', default: false })
  has_custom_thumbnail: boolean;

  @Column({ type: 'integer', default: 0 })
  view_count: number;

  @Column({ type: 'integer', default: 0 })
  like_count: number;

  @Column({ type: 'integer', default: 0 })
  comment_count: number;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 3,
    nullable: true,
    transformer: {
      to: (value: number | null) => value,
      from: (value: string | null) => (value === null ? null : Number(value)),
    },
  })
  duration_seconds: number | null;

  @Column({ type: 'integer', nullable: true })
  width: number | null;

  @Column({ type: 'integer', nullable: true })
  height: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  video_codec: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  audio_codec: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  failure_reason: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Channel, (channel) => channel.videos, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'channel_id' })
  channel: Channel;

  @ManyToOne(() => Category, (category) => category.videos, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'category_id' })
  category: Category | null;
}
