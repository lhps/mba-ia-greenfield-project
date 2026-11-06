import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type SelectQueryBuilder } from 'typeorm';
import { ChannelsService } from '../channels/channels.service';
import type { PanelVideoDto, PanelVideoPageDto } from './dto/panel-video.dto';
import type {
  PublicVideoDto,
  PublicVideoPageDto,
} from './dto/public-video.dto';
import { Video } from './entities/video.entity';
import { decodeCursor, encodeCursor } from './pagination-cursor.util';
import { ThumbnailUrlResolver } from './thumbnail-url.resolver';
import {
  PROCESSING_STATUS,
  PUBLICATION_STATUS,
  SUGGESTIONS_LIMIT,
  VISIBILITY,
} from './videos.constants';

/** Raw alias carrying the exact (microsecond) `published_at` used to build cursors. */
const CURSOR_PUBLISHED_AT = 'cursor_published_at';

/** Read-side video lists: owner panel (offset) and public listings (keyset cursor) — TD-09. */
@Injectable()
export class VideoListingService {
  constructor(
    @InjectRepository(Video)
    private readonly videos: Repository<Video>,
    private readonly channels: ChannelsService,
    private readonly thumbnails: ThumbnailUrlResolver,
  ) {}

  /** Every video of the caller's channel, any status, newest first (TD-09 offset pagination). */
  async listOwn(
    userId: string,
    page: number,
    perPage: number,
  ): Promise<PanelVideoPageDto> {
    const channel = await this.channels.findByUserId(userId);
    if (!channel) throw new Error(`User ${userId} has no channel`);

    const [videos, total] = await this.videos.findAndCount({
      where: { channel_id: channel.id },
      order: { created_at: 'DESC', public_id: 'DESC' },
      skip: (page - 1) * perPage,
      take: perPage,
    });

    const items = await Promise.all(
      videos.map((video) => this.toPanelVideo(video)),
    );
    return { items, page, per_page: perPage, total };
  }

  /**
   * Public channel listing (TD-04 revision, TD-09): only published + public +
   * ready videos — never drafts or unlisted, not even for the owner — newest
   * `published_at` first with `public_id` as the unique tie-breaker. Keyset
   * pagination over the `(published_at, public_id)` tuple; one extra row is
   * fetched to know whether a next page exists.
   */
  async listPublicByChannel(
    nickname: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<PublicVideoPageDto> {
    const after = cursor === undefined ? null : decodeCursor(cursor);
    const channel = await this.channels.findByNicknameOrFail(nickname);

    const query = this.videos
      .createQueryBuilder('video')
      .addSelect(
        `to_char(video.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        CURSOR_PUBLISHED_AT,
      )
      .where('video.channel_id = :channelId', { channelId: channel.id })
      .andWhere('video.publication_status = :published', {
        published: PUBLICATION_STATUS.PUBLISHED,
      })
      .andWhere('video.visibility = :public', { public: VISIBILITY.PUBLIC })
      .andWhere('video.processing_status = :ready', {
        ready: PROCESSING_STATUS.READY,
      })
      .andWhere('video.published_at IS NOT NULL')
      .orderBy('video.published_at', 'DESC')
      .addOrderBy('video.public_id', 'DESC')
      .limit(limit + 1);

    if (after) {
      query.andWhere(
        '(video.published_at, video.public_id) < (CAST(:afterPublishedAt AS timestamptz), :afterPublicId)',
        {
          afterPublishedAt: after.published_at,
          afterPublicId: after.public_id,
        },
      );
    }

    const { entities, raw } =
      await query.getRawAndEntities<
        Record<typeof CURSOR_PUBLISHED_AT, string>
      >();
    const hasMore = entities.length > limit;
    const page = entities.slice(0, limit);

    const items = await Promise.all(
      page.map((video) => this.toPublicVideo(video)),
    );
    return {
      items,
      // No joins, so `raw[i]` is the row of `entities[i]`.
      next_cursor: hasMore
        ? encodeCursor({
            published_at: raw[limit - 1][CURSOR_PUBLISHED_AT],
            public_id: page[limit - 1].public_id,
          })
        : null,
    };
  }

  /**
   * Watch-page sidebar (phase-05 TD-02): the most viewed eligible videos of
   * the current video's category (recency breaks ties), topped up with the
   * most recent eligible videos of other categories, up to SUGGESTIONS_LIMIT.
   * A current video without category (only the owner's own draft) gets the
   * most recent eligible videos of any category.
   */
  async listSuggestions(current: Video): Promise<PublicVideoDto[]> {
    const picked: Video[] = [];

    if (current.category_id) {
      picked.push(
        ...(await this.suggestionCandidates(current)
          .andWhere('video.category_id = :categoryId', {
            categoryId: current.category_id,
          })
          .orderBy('video.view_count', 'DESC')
          .addOrderBy('video.published_at', 'DESC')
          .addOrderBy('video.public_id', 'DESC')
          .limit(SUGGESTIONS_LIMIT)
          .getMany()),
      );
    }

    if (picked.length < SUGGESTIONS_LIMIT) {
      const fill = this.suggestionCandidates(current)
        .orderBy('video.published_at', 'DESC')
        .addOrderBy('video.public_id', 'DESC')
        .limit(SUGGESTIONS_LIMIT - picked.length);
      if (current.category_id) {
        // Every same-category candidate is already picked when the list is short.
        fill.andWhere('video.category_id IS DISTINCT FROM :categoryId', {
          categoryId: current.category_id,
        });
      }
      picked.push(...(await fill.getMany()));
    }

    return Promise.all(picked.map((video) => this.toPublicVideo(video)));
  }

  /** Published + public + ready videos other than `current` — never drafts or unlisted. */
  private suggestionCandidates(current: Video): SelectQueryBuilder<Video> {
    return this.videos
      .createQueryBuilder('video')
      .where('video.publication_status = :published', {
        published: PUBLICATION_STATUS.PUBLISHED,
      })
      .andWhere('video.visibility = :public', { public: VISIBILITY.PUBLIC })
      .andWhere('video.processing_status = :ready', {
        ready: PROCESSING_STATUS.READY,
      })
      .andWhere('video.published_at IS NOT NULL')
      .andWhere('video.id != :currentId', { currentId: current.id });
  }

  private async toPublicVideo(video: Video): Promise<PublicVideoDto> {
    return {
      public_id: video.public_id,
      title: video.title,
      thumbnail_url: await this.thumbnails.resolve(video.thumbnail_key),
      duration_seconds: video.duration_seconds,
      // Non-null: the listing query filters `published_at IS NOT NULL`.
      published_at: (video.published_at as Date).toISOString(),
      view_count: video.view_count,
    };
  }

  private async toPanelVideo(video: Video): Promise<PanelVideoDto> {
    return {
      public_id: video.public_id,
      title: video.title,
      thumbnail_url: await this.thumbnails.resolve(video.thumbnail_key),
      processing_status: video.processing_status,
      publication_status: video.publication_status,
      visibility: video.visibility,
      published_at: video.published_at
        ? video.published_at.toISOString()
        : null,
      created_at: video.created_at.toISOString(),
      duration_seconds: video.duration_seconds,
      view_count: video.view_count,
      like_count: video.like_count,
      comment_count: video.comment_count,
    };
  }
}
