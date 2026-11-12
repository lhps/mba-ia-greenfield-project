---
kind: phase
name: phase-06-social-interactions
test_specs_aware: true
sources_mtime:
  docs/phases/phase-06-social-interactions/context.md: "2026-11-11T13:47:03-03:00"
  docs/decisions/technical-decisions-phase-06-social-interactions.md: "2026-11-11T11:51:35-03:00"
  docs/decisions/technical-decisions-openapi-docs-nestjs.md: "2026-10-21T16:43:34-03:00"
  docs/decisions/technical-decisions-next-frontend-openapi-typing.md: "2026-10-21T16:43:34-03:00"
  docs/decisions/technical-decisions-next-frontend-config-base.md: "2026-10-21T16:43:34-03:00"
  docs/decisions/technical-decisions-next-frontend-msw-foundation.md: "2026-10-21T16:43:34-03:00"
---

# Phase 06 — Interações Sociais (Likes, Comentários, Inscrições) — backend slice

## Objective

Deliver the `nestjs-project` backend for social interactions — like e dislike em vídeos e em comentários, comentários em vídeos com respostas (comentários aninhados), inscrição em canais (seguir/deixar de seguir) com contagem de inscritos na página do canal, and the área de canais seguidos com acesso rápido aos vídeos — so that likes/dislikes, comentários com respostas, inscrição em canais and the listagem de canais seguidos work through the API, leaving the "Interface completa de comentários, likes e inscrições" to the future Phase 06 frontend slice.

---

## Step Implementations

### SI-06.1 — Infra: Social Data Model and Migration

**Description:** Create the reaction, comment and subscription tables plus the new counter columns, so every later SI writes to a schema that already enforces one reaction per user per target and one subscription per user per channel.

**Technical actions:**

1. Create `src/videos/entities/video-reaction.entity.ts` (`VideoReaction`, table `video_reactions`) and add `dislike_count` to `src/videos/entities/video.entity.ts`; export a shared `REACTION_VALUE` constant (`like` | `dislike`) from `src/videos/videos.constants.ts` (per `phase-06-social-interactions/TD-01`, `TD-03`; `### Data Model` → VideoReaction, Video)
2. Create `src/comments/entities/comment.entity.ts` (`Comment`, table `comments`, self FK `parent_id`, `deleted_at`, `like_count`, `dislike_count`, `reply_count`) and `src/comments/entities/comment-reaction.entity.ts` (`CommentReaction`, table `comment_reactions`, same `reaction_value` enum type) (per `phase-06-social-interactions/TD-01`, `TD-04`, `TD-06`; `### Data Model` → Comment, CommentReaction)
3. Create `src/channels/entities/subscription.entity.ts` (`Subscription`, table `subscriptions`) and add `subscriber_count` to `src/channels/entities/channel.entity.ts`; register `Subscription` in `ChannelsModule`'s `TypeOrmModule.forFeature` (per `phase-06-social-interactions/TD-07`; `### Data Model` → Subscription, Channel)
4. Generate one migration `src/database/migrations/{timestamp}-AddSocialInteractions.ts` with the 4 tables, the `reaction_value` enum, the FKs (`ON DELETE CASCADE`), composite PKs, indexes from `### Data Model`, and the two new counter columns; `down` drops them in reverse order
5. Create `src/comments/comments.module.ts` registering `TypeOrmModule.forFeature([Comment, CommentReaction])`, and register `CommentsModule` in `AppModule`; register `VideoReaction` in `VideosModule`'s `forFeature`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideoReaction`, `CommentReaction`, `Subscription` | Integration: composite PK rejects a second row for the same pair; invalid enum value rejected; cascade on video / comment / channel / user delete | `src/database/social-entities.integration-spec.ts` |
| `Comment`, counter columns | Integration: defaults of comment `like_count`/`dislike_count`/`reply_count`, channel `subscriber_count` and video `dislike_count` = 0; deleting a root cascades to its replies | `src/comments/comment.entity.integration-spec.ts` |

**Dependencies:** none

**Acceptance criteria:**

- `npm run migration:run` on the current schema creates `video_reactions`, `comments`, `comment_reactions` and `subscriptions`, and `migration:revert` removes them without errors
- Inserting a second `video_reactions` row for the same `(user_id, video_id)` fails with a unique/PK violation; same for `comment_reactions` and `subscriptions`
- Deleting a video removes its reactions, comments and comment reactions
- A new channel row has `subscriber_count = 0`; a new video row has `dislike_count = 0`

---

### SI-06.2 — Endpoints PUT/DELETE /videos/:id/reaction (Video Like/Dislike)

**Route:** PUT /videos/:id/reaction, DELETE /videos/:id/reaction
**Test Specs:** see `nestjs-project/specs/videos-reaction.plan.md`
**Authorization:** Authenticated — video readable + `ready`; owner allowed

**Description:** Let an authenticated user like, dislike or clear their reaction on a video, keeping `like_count`/`dislike_count` exact under concurrent writes.

**Technical actions:**

1. Create `src/videos/video-reactions.service.ts` — `VideoReactionsService.set(publicId, userId, value)` and `.clear(publicId, userId)`: resolve with `VideoAccessService.findReadableOrFail` (404 rule), throw `VideoNotReadyException` when `processing_status != ready`, then in one `DataSource.transaction` lock the caller's row (`SELECT … FOR UPDATE`), upsert/delete it and apply the counter deltas from `### Data Model` → Counter rules with atomic `increment`/`decrement` on `videos` (per `phase-06-social-interactions/TD-02`, `TD-03` + revision)
2. Return `ReactionState` `{ like_count, my_reaction }` read inside the same transaction (read-your-own-write); no dislike count in the response (per `phase-06-social-interactions/TD-03`; `### API Contracts` → ReactionState)
3. Create `src/videos/dto/set-reaction.dto.ts` (`value` with `@IsIn(Object.values(REACTION_VALUE))`) and `src/videos/dto/reaction-state.dto.ts` (`like_count`, `my_reaction` nullable enum) with `@ApiProperty` (inherited `openapi-docs-nestjs/TD-01` revision)
4. Create `src/videos/video-reactions.controller.ts` — `@Controller('videos')`, `@SkipThrottle()`, `PUT :id/reaction` (`@HttpCode(200)`) and `DELETE :id/reaction` (`@HttpCode(200)`), authenticated by the global `JwtAuthGuard`; `@ApiResponse` 200/400/401/404/409 with `errorSchema`; register controller + service in `VideosModule`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideoReactionsService` | Unit (mocked access + manager): not-ready → `VIDEO_NOT_READY`; delta per transition (none→like, like→dislike, dislike→none, same value, clear with none) | `src/videos/video-reactions.service.spec.ts` |
| `VideoReactionsService` | Integration (real DB): counters match row counts after a sequence of set/clear; 10 concurrent `set like` by distinct users → `like_count` 10; concurrent like/clear by one user never goes negative | `src/videos/video-reactions.service.integration-spec.ts` |

**Dependencies:** SI-06.1 — `video_reactions` table and `dislike_count` column

**Acceptance criteria:**

- `PUT /videos/:id/reaction` with `{ "value": "like" }` on a published ready video returns `200` with `{ "like_count": 1, "my_reaction": "like" }`; repeating it returns the same body
- `PUT` with `{ "value": "dislike" }` after a like returns `200` with `like_count` decreased by 1 and `my_reaction: "dislike"`
- `DELETE /videos/:id/reaction` returns `200` with `my_reaction: null`; a second `DELETE` returns the same counts
- `PUT` with `{ "value": "love" }` returns `400` with `error: "VALIDATION_ERROR"`; without a token returns `401`
- `PUT` on another user's draft returns `404` with `error: "VIDEO_NOT_FOUND"`; on a published video still `processing` returns `409` with `error: "VIDEO_NOT_READY"`
- The channel owner can like their own ready video and receives `200`

---

### SI-06.3 — Endpoints Create and List Comments with Replies

**Route:** POST /videos/:id/comments, GET /videos/:id/comments, GET /comments/:id/replies
**Test Specs:** see `nestjs-project/specs/videos-comments.plan.md`
**Authorization:** POST authenticated (readable + `ready`, throttled per user); GETs anonymous with optional auth

**Description:** Let authenticated users comment on a video or answer a comment (one reply level), and let anyone read top-level comments newest-first and replies oldest-first through keyset pages.

**Technical actions:**

1. Create `src/comments/comments.service.ts` — `create(publicId, userId, { body, parent_id })`: read rule + `VideoNotReadyException`; when `parent_id` is set, load it (missing, placeholder or other video → `CommentNotFoundException`) and attach to its root when it is itself a reply; insert and apply `videos.comment_count +1` (+ root `reply_count +1` for replies) in one transaction; add `CommentNotFoundException` and `CommentAccessDeniedException` to `domain.exception.ts` (per `phase-06-social-interactions/TD-04`, `TD-02` + revision, `TD-06` revision; `### Error Catalog`)
2. Add `listRoots(publicId, viewerId?, query)` (read rule; `parent_id IS NULL`, `created_at DESC, id DESC`, hide placeholders with `reply_count = 0`) and `listReplies(commentId, viewerId?, query)` (root only, its video readable; `created_at ASC, id ASC`), both keyset via a new `src/comments/comment-cursor.util.ts` (`created_at|id` base64url, `InvalidPaginationCursorException` on tampering), filling `my_reaction` with one `comment_reactions` lookup per page and `author` from the author's channel (per `phase-06-social-interactions/TD-05`, `TD-08`; inherited `phase-04-channel-management/TD-09`)
3. Add `COMMENT_RATE_LIMIT` (default 10) and `COMMENT_RATE_TTL_SECONDS` (default 60) to `src/config/env.validation.ts` with a `src/config/comments.config.ts` `registerAs('comments', …)` factory; create `src/comments/comment-throttler.guard.ts` extending `ThrottlerGuard` with `getTracker` = JWT `sub`, applied with `@Throttle` limits from that config to `POST` only (look up `@nestjs/throttler` v6 resolvable `limit`/`ttl` via context7) (per `phase-06-social-interactions/TD-06`; inherited `phase-02-auth/TD-08`, `phase-01-configuracao-base/TD-02`, `TD-03`)
4. Create DTOs `src/comments/dto/create-comment.dto.ts` (`body` trimmed via `@Transform`, `@Length(1, 2000)`; `parent_id` `@IsOptional() @IsUUID()`), `comments-query.dto.ts` (`cursor`, `limit` 1–50 default 20), `comment.dto.ts` (`Comment`, `CommentAuthor`, `CommentPage` per `### API Contracts`)
5. Create `src/comments/comments.controller.ts` — `@SkipThrottle()` class; `GET videos/:id/comments` and `GET comments/:id/replies` with `@Public()` + `OptionalJwtAuthGuard`; `POST videos/:id/comments` (`201`) with `CommentThrottlerGuard`; Swagger decorators per status; `CommentsModule` imports `VideosModule` (`VideoAccessService`), `AuthModule` (JwtService) and `ConfigModule.forFeature(commentsConfig)`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `CommentsService` | Unit (mocked repos + access): not-ready → `VIDEO_NOT_READY`; reply-to-reply attaches to root; parent of another video → `COMMENT_NOT_FOUND`; placeholder parent → `COMMENT_NOT_FOUND` | `src/comments/comments.service.spec.ts` |
| `CommentsService` | Integration (real DB): counters after create; roots newest-first and replies oldest-first across 2 keyset pages without duplicates; `my_reaction` filled for the viewer; placeholders with 0 replies hidden | `src/comments/comments.service.integration-spec.ts` |
| `comment-cursor.util` | Unit: round-trip; malformed/tampered → `VALIDATION_ERROR` | `src/comments/comment-cursor.util.spec.ts` |
| `CommentThrottlerGuard` | Unit: tracker is the JWT `sub`, not the IP | `src/comments/comment-throttler.guard.spec.ts` |
| `envValidationSchema` | Unit: defaults and rejection of `COMMENT_RATE_LIMIT=0` / `COMMENT_RATE_TTL_SECONDS=0` | `src/config/env.validation.spec.ts` |

**Dependencies:** SI-06.1 — `comments` table and `CommentsModule`

**Acceptance criteria:**

- `POST /videos/:id/comments` with `{ "body": "  Nice video  " }` on a ready video returns `201` with `body: "Nice video"`, `parent_id: null`, `author.nickname` of the caller, and `GET /videos/:id` shows `comment_count` +1
- `POST` with `parent_id` of a reply returns `201` whose `parent_id` is that reply's root, and the root's `reply_count` grows by 1
- `POST` with an empty or 2,001-character body returns `400` with `error: "VALIDATION_ERROR"`; with a `parent_id` from another video returns `404` with `error: "COMMENT_NOT_FOUND"`
- `POST` on a processing video returns `409` with `error: "VIDEO_NOT_READY"`; on another user's draft returns `404` with `error: "VIDEO_NOT_FOUND"`
- The 11th `POST` by the same user within 60 s returns `429` (default limits), even from different IPs
- `GET /videos/:id/comments?limit=2` without a token returns the 2 newest roots with `my_reaction: null` and a `next_cursor` that yields the next roots without overlap
- `GET /comments/:id/replies` returns replies oldest-first; called with a reply's id returns `404` with `error: "COMMENT_NOT_FOUND"`

---

### SI-06.4 — Endpoint DELETE /comments/:id (Author Deletion)

**Route:** DELETE /comments/:id
**Test Specs:** see `nestjs-project/specs/comments-delete.plan.md`
**Authorization:** Authenticated — comment author only

**Description:** Let the author delete their own comment: a root with replies becomes a "Comment deleted" placeholder so the thread survives, anything else is removed, and the counters follow.

**Technical actions:**

1. Add `CommentsService.remove(commentId, userId)`: load the comment with its video (video not readable by the caller, unknown id or already a placeholder → `CommentNotFoundException`; author ≠ caller → `CommentAccessDeniedException`, checked after existence) (per `phase-06-social-interactions/TD-06`; `### Error Catalog`)
2. In one transaction: root with `reply_count > 0` → set `deleted_at = now()`, `body = null`; otherwise delete the row (its reactions cascade); apply the deltas from `### Data Model` → Counter rules (`videos.comment_count −1`; reply → root `reply_count −1`, and remove a placeholder root whose `reply_count` reaches 0) (per `phase-06-social-interactions/TD-02` + revision)
3. Render placeholders in `Comment` as `deleted: true`, `body: null`, `author: null` in both listings (per `### API Contracts` → Comment)
4. Add `DELETE comments/:id` (`@HttpCode(204)`) to `CommentsController` with `@ApiResponse` 204/401/403/404

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `CommentsService.remove` | Unit (mocked repos): 403 vs 404 order; placeholder vs hard delete branch; placeholder cleanup when last reply goes | `src/comments/comments.service.spec.ts` |
| `CommentsService.remove` | Integration (real DB): `comment_count` / `reply_count` after each delete branch; reactions of a removed comment are gone | `src/comments/comments.service.integration-spec.ts` |

**Dependencies:** SI-06.3 — comments must exist and be listable

**Acceptance criteria:**

- `DELETE /comments/:id` by the author on a root without replies returns `204`; the root disappears from `GET /videos/:id/comments` and `comment_count` drops by 1
- Deleting a root with replies returns `204`; the listing shows it with `deleted: true`, `body: null`, `author: null`, and its replies stay reachable through `GET /comments/:id/replies`
- Deleting a reply returns `204`; the root's `reply_count` and the video's `comment_count` each drop by 1
- When the last reply of a placeholder root is deleted, the placeholder no longer appears in the listing
- `DELETE` by another authenticated user returns `403` with `error: "COMMENT_ACCESS_DENIED"`; on an unknown id or an existing placeholder returns `404` with `error: "COMMENT_NOT_FOUND"`; without a token returns `401`

---

### SI-06.5 — Endpoints PUT/DELETE /comments/:id/reaction (Comment Like/Dislike)

**Route:** PUT /comments/:id/reaction, DELETE /comments/:id/reaction
**Test Specs:** see `nestjs-project/specs/comments-reaction.plan.md`
**Authorization:** Authenticated — comment's video readable + `ready`

**Description:** Let authenticated users like, dislike or clear their reaction on a comment, with the same idempotent contract and counter rules as video reactions.

**Technical actions:**

1. Create `src/comments/comment-reactions.service.ts` — `set(commentId, userId, value)` / `clear(commentId, userId)`: load the comment and apply the video read rule to its video (`CommentNotFoundException` when unknown, a placeholder, or the video is not readable), `VideoNotReadyException` when the video is not `ready` (per `phase-06-social-interactions/TD-03` revision)
2. In one transaction lock the caller's `comment_reactions` row, upsert/delete it and apply the counter deltas on `comments.like_count` / `comments.dislike_count`; return `ReactionState` (reuse `src/videos/dto/reaction-state.dto.ts` and `set-reaction.dto.ts`) (per `phase-06-social-interactions/TD-01`, `TD-02`, `TD-03`)
3. Add `PUT comments/:id/reaction` and `DELETE comments/:id/reaction` (`200`) to `CommentsController` with Swagger 200/400/401/404/409

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `CommentReactionsService` | Unit (mocked repos + access): placeholder → `COMMENT_NOT_FOUND`; not-ready video → `VIDEO_NOT_READY`; delta per transition | `src/comments/comment-reactions.service.spec.ts` |
| `CommentReactionsService` | Integration (real DB): counters equal row counts after mixed set/clear; concurrent likes by distinct users are all counted; listing shows `my_reaction` for the reacting viewer | `src/comments/comment-reactions.service.integration-spec.ts` |

**Dependencies:** SI-06.3 — comments; SI-06.2 — shared `ReactionState` / `SetReactionDto`

**Acceptance criteria:**

- `PUT /comments/:id/reaction` with `{ "value": "like" }` returns `200` with `{ "like_count": 1, "my_reaction": "like" }`, and `GET /videos/:id/comments` with the same token shows that comment with `like_count: 1`, `my_reaction: "like"`
- Switching to `dislike` returns `like_count` decreased by 1 and `my_reaction: "dislike"`; `DELETE` returns `my_reaction: null`; repeating either call returns the same body
- `PUT` on a placeholder comment returns `404` with `error: "COMMENT_NOT_FOUND"`
- `PUT` on a comment whose video is another user's draft returns `404` with `error: "COMMENT_NOT_FOUND"`; without a token returns `401`

---

### SI-06.6 — Channel Subscriptions and Subscriber Count (PUT/DELETE /channels/:nickname/subscription)

**Route:** PUT /channels/:nickname/subscription, DELETE /channels/:nickname/subscription, GET /channels/:nickname
**Test Specs:** see `nestjs-project/specs/channels-subscription.plan.md`
**Authorization:** PUT/DELETE authenticated (not on own channel); GET anonymous with optional auth

**Description:** Let users follow and unfollow channels idempotently, and show `subscriber_count` plus the viewer's `is_subscribed` on the public channel header.

**Technical actions:**

1. Extract the `JwtModule.registerAsync(...)` block of `AuthModule` into `src/auth/auth-jwt.module.ts` (`AuthJwtModule`, exports `JwtModule`); `AuthModule` imports and re-exports it, and `ChannelsModule` imports `AuthJwtModule` so `OptionalJwtAuthGuard` resolves `JwtService` without the `Channels → Auth → Users → Channels` import cycle (inherited `phase-02-auth/TD-02` Note; `phase-04-channel-management/TD-04`)
2. Create `src/channels/subscriptions.service.ts` — `subscribe(nickname, userId)` (channel by nickname case-insensitive → `ChannelNotFoundException`; own channel → new `SelfSubscriptionNotAllowedException` in `domain.exception.ts`) and `unsubscribe(nickname, userId)`: insert/delete with `ON CONFLICT DO NOTHING` semantics and `channels.subscriber_count ±1` only when a row was actually inserted/deleted, in one transaction; both return `SubscriptionState` (per `phase-06-social-interactions/TD-07`, `TD-02`; `### Error Catalog`)
3. Add `SubscriptionsService.isSubscribed(channelId, userId?)` and extend `ChannelsService.getPublicProfile(nickname, viewerId?)` + `src/channels/dto/public-channel.dto.ts` with `subscriber_count` and `is_subscribed` (`false` when anonymous) (per `phase-06-social-interactions/TD-08`)
4. Create `src/channels/dto/subscription-state.dto.ts` and `src/channels/channel-subscriptions.controller.ts` — `@Controller('channels')`, `@SkipThrottle()`, `PUT :nickname/subscription` / `DELETE :nickname/subscription` (`200`), Swagger 200/401/404/409; register controller + service in `ChannelsModule`
5. Add `@UseGuards(OptionalJwtAuthGuard)` to `GET /channels/:nickname` in `ChannelsController` (still `@Public()`), passing `user?.sub`; update its `@ApiOperation` description

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `SubscriptionsService` | Unit (mocked repos): own channel → `SELF_SUBSCRIPTION_NOT_ALLOWED`; unknown nickname → `CHANNEL_NOT_FOUND`; delta only on real insert/delete | `src/channels/subscriptions.service.spec.ts` |
| `SubscriptionsService` | Integration (real DB): repeated subscribe/unsubscribe keeps `subscriber_count` equal to row count; concurrent subscribes by distinct users all counted | `src/channels/subscriptions.service.integration-spec.ts` |
| `ChannelsModule` | Unit: compilation with `AuthJwtModule` (guard resolvable, no circular import) | `src/channels/channels.module.spec.ts` |
| `AuthModule` | Unit: compilation still provides `JwtService` to importers | `src/auth/auth.module.spec.ts` |

**Dependencies:** SI-06.1 — `subscriptions` table and `subscriber_count`

**Acceptance criteria:**

- `PUT /channels/:nickname/subscription` returns `200` with `{ "subscriber_count": 1, "is_subscribed": true }`; repeating it returns the same body
- `DELETE /channels/:nickname/subscription` returns `200` with `is_subscribed: false` and the count decreased by 1; repeating it leaves the count unchanged
- `PUT` on the caller's own channel returns `409` with `error: "SELF_SUBSCRIPTION_NOT_ALLOWED"`; on an unknown nickname returns `404` with `error: "CHANNEL_NOT_FOUND"`; without a token returns `401`
- `GET /channels/:nickname` without a token returns `subscriber_count` and `is_subscribed: false`; with a subscriber's token returns `is_subscribed: true`; with an expired token behaves as anonymous (`200`)

---

### SI-06.7 — VideoDetail with Counts and Viewer State (GET /videos/:id)

**Route:** GET /videos/:id
**Test Specs:** see `nestjs-project/specs/videos-detail-social.plan.md`
**Authorization:** Anonymous (optional auth) — unchanged read rule

**Description:** Extend the watch-page read so one call carries `like_count`, `comment_count`, the viewer's `my_reaction`, and the channel's `subscriber_count` / `is_subscribed`.

**Technical actions:**

1. Extend `src/videos/dto/video-detail.dto.ts`: `VideoDetailDto` gains `like_count`, `comment_count`, `my_reaction` (nullable enum); `VideoChannelDto` gains `subscriber_count`, `is_subscribed` (per `phase-06-social-interactions/TD-08`; `### API Contracts` → GET /videos/:id)
2. Change `VideosService.toVideoDetail(video, viewerId?)` to fill the new fields: counts from the loaded `video` / `video.channel` rows, `my_reaction` from one `video_reactions` lookup, `is_subscribed` through `SubscriptionsService.isSubscribed` (exported by `ChannelsModule`); anonymous → `null` / `false`
3. Pass the caller id from `findReadable` (`GET /videos/:id`) and from `VideoManagementService.update` / `publish` / `unpublish` (owner) so every `VideoDetail` response carries the same shape
4. Update the `GET /videos/:id` `@ApiOperation` description to mention the viewer fields

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService.toVideoDetail` | Unit (mocked repos + subscriptions): anonymous → `my_reaction: null`, `is_subscribed: false`; viewer with dislike → `"dislike"`; subscriber → `true` | `src/videos/videos.service.spec.ts` |

**Dependencies:** SI-06.2 — `video_reactions` writes; SI-06.6 — `SubscriptionsService.isSubscribed`

**Acceptance criteria:**

- `GET /videos/:id` without a token returns `like_count`, `comment_count`, `my_reaction: null`, `channel.subscriber_count` and `channel.is_subscribed: false`
- After `PUT /videos/:id/reaction` with `like`, `GET /videos/:id` with the same token returns `my_reaction: "like"` and the increased `like_count`
- After `PUT /channels/:nickname/subscription`, `GET /videos/:id` of that channel's video with the same token returns `channel.is_subscribed: true`
- `PATCH /videos/:id` by the owner returns the same new fields

---

### SI-06.8 — Subscribed-channels Area (GET /me/subscriptions, GET /me/subscriptions/videos)

**Route:** GET /me/subscriptions, GET /me/subscriptions/videos
**Test Specs:** see `nestjs-project/specs/me-subscriptions.plan.md`
**Authorization:** Authenticated — the caller's own data

**Description:** Give the "canais seguidos" area its two reads: the followed channels (most recent subscription first) and a feed of their latest public videos, both keyset-paginated.

**Technical actions:**

1. Add `SubscriptionsService.listMine(userId, query)` — join `subscriptions` → `channels`, order `subscriptions.created_at DESC, channels.nickname ASC`, keyset through a new `src/channels/subscription-cursor.util.ts` (`created_at|nickname` base64url, tampering → `InvalidPaginationCursorException`), items `{ nickname, name, subscriber_count, subscribed_at }` (per `phase-06-social-interactions/TD-09`; inherited `phase-04-channel-management/TD-09`)
2. Add `VideoListingService.listSubscriptionFeed(userId, query)` — same filters, ordering and `PublicationCursor` as the public channel listing (`publication_status = published`, `visibility = public`, `processing_status = ready`), restricted to `channel_id IN (SELECT channel_id FROM subscriptions WHERE user_id = :userId)`, returning `PublicVideoPage` (per `phase-06-social-interactions/TD-09`)
3. Create `src/channels/me-subscriptions.controller.ts` (`@Controller('me')`, `GET subscriptions`, query DTO with `cursor` + `limit` 1–50 default 24, response DTO `SubscribedChannelPage`) in `ChannelsModule`, and `src/videos/subscription-feed.controller.ts` (`@Controller('me')`, `GET subscriptions/videos`, reusing `PublicChannelVideosQueryDto` and `PublicVideoPageDto`) in `VideosModule`; both `@SkipThrottle()`, Swagger 200/400/401

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `SubscriptionsService.listMine` | Integration (real DB): order by subscription date; 2 keyset pages without overlap; only the caller's subscriptions | `src/channels/subscriptions.service.integration-spec.ts` |
| `VideoListingService.listSubscriptionFeed` | Integration (real DB): only followed channels; drafts, unlisted and non-ready excluded; keyset pages; empty when following nobody | `src/videos/video-listing.service.integration-spec.ts` |
| `subscription-cursor.util` | Unit: round-trip; malformed → `VALIDATION_ERROR` | `src/channels/subscription-cursor.util.spec.ts` |

**Dependencies:** SI-06.6 — subscriptions exist

**Acceptance criteria:**

- `GET /me/subscriptions` returns the followed channels, most recent subscription first, each with `nickname`, `name`, `subscriber_count`, `subscribed_at`; `limit=1` returns a `next_cursor` that yields the next channel
- `GET /me/subscriptions/videos` returns only published, public, ready videos of followed channels, newest first, in the `PublicVideoPage` shape
- A user who follows no channel gets `200` with `items: []` and `next_cursor: null` from both endpoints
- Both endpoints without a token return `401`; with `cursor=abc!` return `400` with `error: "VALIDATION_ERROR"`

---

### SI-06.9 — OpenAPI Contract Export and HTTP Examples for Social Interactions

**Description:** Publish this slice's contract in the committed OpenAPI document that the future Phase 06 frontend slice will consume, and document the social flows for manual testing.

**Technical actions:**

1. Run `npm run openapi:export` and commit the regenerated `nestjs-project/openapi.json` with the reaction, comment, subscription and `/me/subscriptions*` paths plus the extended `VideoDetail` and `PublicChannel` schemas (inherited `openapi-docs-nestjs/TD-01`, `openapi-docs-nestjs/TD-02`, `next-frontend-openapi-typing/TD-02`)
2. Extend `test/swagger.e2e-spec.ts` — assert the new paths and methods exist, that write routes carry bearer security while `GET /videos/{id}/comments` and `GET /comments/{id}/replies` do not, and that `VideoDetail` has `like_count`, `comment_count`, `my_reaction` and `PublicChannel` has `subscriber_count`, `is_subscribed`
3. Add to `nestjs-project/api.http` — like a video → comment → reply → list comments/replies → like a comment → delete a comment → subscribe → channel header → my subscriptions → feed → unsubscribe

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| Swagger document | E2E: Phase 06 paths, security and extended schemas present | `test/swagger.e2e-spec.ts` |

**Dependencies:** SI-06.2, SI-06.3, SI-06.4, SI-06.5, SI-06.6, SI-06.7, SI-06.8 — all Phase 06 contract changes implemented

**Acceptance criteria:**

- `nestjs-project/openapi.json` contains every endpoint of `### API Contracts` with its documented status codes and snake_case schemas
- Running `npm run openapi:export` again produces no diff
- `GET /api/docs-json` shows `ReactionState`, `Comment`, `CommentPage` and `SubscriptionState` schemas

---

## Technical Specifications

### Data Model

All new tables and columns land in one TypeORM migration (SI-06.1). Counters follow the delta rule of phase-06-social-interactions/TD-02: every write that changes a reaction, comment or subscription updates the matching counter with an atomic `col = col ± 1` inside the same transaction.

#### VideoReaction (`video_reactions`) — new *(per phase-06-social-interactions/TD-01)*

| Field | Type | Constraints |
|-------|------|-------------|
| user_id | uuid | PK (composite), FK → `users.id` `ON DELETE CASCADE` |
| video_id | uuid | PK (composite), FK → `videos.id` `ON DELETE CASCADE` |
| value | enum `reaction_value` (`like` \| `dislike`) | not null |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now(), on update |

**Relations:** `User` has many `VideoReaction`; `Video` has many `VideoReaction`.
**Indexes:** composite PK `(user_id, video_id)` — one reaction per user per video; index on `video_id`.

#### Comment (`comments`) — new *(per phase-06-social-interactions/TD-04, TD-05, TD-06)*

| Field | Type | Constraints |
|-------|------|-------------|
| id | uuid | PK, generated |
| video_id | uuid | not null, FK → `videos.id` `ON DELETE CASCADE` |
| user_id | uuid | not null, FK → `users.id` `ON DELETE CASCADE` — the author |
| parent_id | uuid | nullable, FK → `comments.id` `ON DELETE CASCADE` — always a top-level comment (one reply level) |
| body | varchar(2000) | nullable — trimmed, 1–2,000 chars on write; `null` once a root is turned into a placeholder |
| deleted_at | timestamptz | nullable — set only when a root with replies is deleted (placeholder) |
| like_count | integer | not null, default 0 |
| dislike_count | integer | not null, default 0 |
| reply_count | integer | not null, default 0 — non-deleted replies of a root; always 0 on replies |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now(), on update |

**Relations:** `Video` has many `Comment`; `User` has many `Comment`; `Comment` (root) has many `Comment` (replies) via `parent_id`.
**Indexes:** `(video_id, parent_id, created_at, id)` — roots page (`parent_id IS NULL`, newest-first); `(parent_id, created_at, id)` — replies page (oldest-first); `user_id`.

#### CommentReaction (`comment_reactions`) — new *(per phase-06-social-interactions/TD-01)*

| Field | Type | Constraints |
|-------|------|-------------|
| user_id | uuid | PK (composite), FK → `users.id` `ON DELETE CASCADE` |
| comment_id | uuid | PK (composite), FK → `comments.id` `ON DELETE CASCADE` |
| value | enum `reaction_value` (`like` \| `dislike`) | not null — same Postgres enum type as `video_reactions.value` |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now(), on update |

**Relations:** `User` has many `CommentReaction`; `Comment` has many `CommentReaction`.
**Indexes:** composite PK `(user_id, comment_id)`; index on `comment_id`.

#### Subscription (`subscriptions`) — new *(per phase-06-social-interactions/TD-07)*

| Field | Type | Constraints |
|-------|------|-------------|
| user_id | uuid | PK (composite), FK → `users.id` `ON DELETE CASCADE` — the subscriber |
| channel_id | uuid | PK (composite), FK → `channels.id` `ON DELETE CASCADE` |
| created_at | timestamptz | default now() — the subscription date (keyset key of `GET /me/subscriptions`) |

**Relations:** `User` has many `Subscription`; `Channel` has many `Subscription`.
**Indexes:** composite PK `(user_id, channel_id)`; `(user_id, created_at)` for the subscriptions list; `channel_id` for the feed join.

#### Video (`videos`) — modified

| Field | Type | Constraints |
|-------|------|-------------|
| dislike_count | integer | not null, default 0 — new; stored, never exposed *(per phase-06-social-interactions/TD-03)* |

`like_count` and `comment_count` already exist (phase-04-channel-management/TD-08). `comment_count` counts all non-deleted comments of the video — roots + replies; a placeholder is not counted *(per phase-06-social-interactions/TD-02 revision 2026-11-11)*.

#### Channel (`channels`) — modified

| Field | Type | Constraints |
|-------|------|-------------|
| subscriber_count | integer | not null, default 0 — new *(per phase-06-social-interactions/TD-07)* |

#### Counter rules *(per phase-06-social-interactions/TD-02)*

| Write | Counter deltas (same transaction) |
|-------|------------------------------------|
| Reaction none → `like` | target `like_count +1` |
| Reaction none → `dislike` | target `dislike_count +1` |
| Reaction `like` → `dislike` (or reverse) | old value counter `−1`, new value counter `+1` |
| Reaction removed | removed value counter `−1` |
| Same value set again (idempotent PUT) / DELETE with no reaction | no change |
| Root comment created | `videos.comment_count +1` |
| Reply created | `videos.comment_count +1`, root `reply_count +1` |
| Root without replies deleted (row removed) | `videos.comment_count −1` |
| Root with replies deleted (placeholder) | `videos.comment_count −1` (replies keep counting) |
| Reply deleted (row removed) | `videos.comment_count −1`, root `reply_count −1`; when the root is a placeholder and its `reply_count` reaches 0, the root row is removed too |
| Subscribe (new row) | `channels.subscriber_count +1` |
| Unsubscribe (row removed) | `channels.subscriber_count −1` |

Reaction writes lock the caller's existing reaction row (`SELECT … FOR UPDATE`) before computing the delta, so concurrent PUT/DELETE pairs never drift the counters.

### API Contracts

Every error uses the inherited envelope `{ statusCode, error, message }` with a domain `error` code *(per phase-02-auth/TD-07)*; field names are snake_case *(per phase-03-videos/TD-09 revision)*. `:id` of a video is its `public_id`; `:id` of a comment is its `uuid`. Optional-auth reads are `@Public()` + `OptionalJwtAuthGuard`: an invalid or expired bearer is treated as anonymous *(per phase-04-channel-management/TD-04)*. Write rule for reactions and comments: the video must pass the read rule (draft of another user → 404 `VIDEO_NOT_FOUND`; unlisted reachable by link) and be `processing_status = ready`, otherwise 409 `VIDEO_NOT_READY`; the channel owner may react and comment on their own video *(per phase-06-social-interactions/TD-03 and TD-06 revisions 2026-11-11)*. A comment-scoped route applies the same rule to the comment's video.

Shared response shapes:

- **ReactionState** — `like_count`: integer; `my_reaction`: `"like"` | `"dislike"` | null. No dislike count *(per phase-06-social-interactions/TD-03)*.
- **CommentAuthor** — `nickname`: string; `name`: string (the author's channel).
- **Comment** — `id`: string (uuid); `parent_id`: string (uuid) | null; `body`: string | null (null on a placeholder); `deleted`: boolean (true on a placeholder); `author`: CommentAuthor | null (null on a placeholder); `like_count`: integer; `reply_count`: integer; `my_reaction`: `"like"` | `"dislike"` | null (null for anonymous callers) *(per phase-06-social-interactions/TD-08)*; `created_at`: string (date-time). The frontend shows the delete action when `author.nickname` equals the session `channelSlug` (same pattern as the download button, phase-05-video-watch/TD-03).
- **CommentPage** — `items`: Comment[]; `next_cursor`: string | null.
- **SubscriptionState** — `subscriber_count`: integer; `is_subscribed`: boolean.

#### PUT /videos/:id/reaction (SI-06.2)

**Request headers:**
- Authorization: Bearer {access_token}
- Content-Type: application/json

**Request body:**
- value: string, required — `like` | `dislike`

**Response 200:** ReactionState. Idempotent: setting the current value again changes nothing *(per phase-06-social-interactions/TD-03)*.

**Error responses:**
- 400 VALIDATION_ERROR: when `value` is missing or not `like` / `dislike`
- 401 (JwtAuthGuard): missing or invalid access token
- 404 VIDEO_NOT_FOUND: unknown video, or a draft the caller does not own
- 409 VIDEO_NOT_READY: video readable but `processing_status` is not `ready`

---

#### DELETE /videos/:id/reaction (SI-06.2)

**Request headers:**
- Authorization: Bearer {access_token}

**Response 200:** ReactionState with `my_reaction: null`. Idempotent: no reaction → unchanged counts.

**Error responses:**
- 401 (JwtAuthGuard): missing or invalid access token
- 404 VIDEO_NOT_FOUND: unknown video, or a draft the caller does not own
- 409 VIDEO_NOT_READY: video readable but not `ready`

---

#### GET /videos/:id/comments (SI-06.3)

**Request headers:**
- Authorization: Bearer {access_token} — optional (fills `my_reaction`)

**Request query parameters:**
- cursor: string, optional — opaque `next_cursor` of a previous page
- limit: integer, optional — 1–50, default 20

**Response 200:** CommentPage of top-level comments, newest first (`created_at DESC, id DESC`), each with `reply_count`. Placeholders (`deleted: true`) appear only while they still have replies *(per phase-06-social-interactions/TD-05, TD-06)*.

**Error responses:**
- 400 VALIDATION_ERROR: malformed `cursor` or `limit` out of range
- 404 VIDEO_NOT_FOUND: unknown video, or a draft the caller does not own

---

#### POST /videos/:id/comments (SI-06.3)

**Request headers:**
- Authorization: Bearer {access_token}
- Content-Type: application/json

**Request body:**
- body: string, required — trimmed, 1–2,000 characters
- parent_id: string (uuid), optional — comment being answered; when it is a reply, the new comment is attached to that reply's root *(per phase-06-social-interactions/TD-04)*

**Response 201:** Comment (the created comment; `my_reaction: null`, `like_count: 0`, `reply_count: 0`).

**Error responses:**
- 400 VALIDATION_ERROR: `body` empty after trim or longer than 2,000 characters; `parent_id` not a uuid
- 401 (JwtAuthGuard): missing or invalid access token
- 404 VIDEO_NOT_FOUND: unknown video, or a draft the caller does not own
- 404 COMMENT_NOT_FOUND: `parent_id` does not exist, is a placeholder, or belongs to another video
- 409 VIDEO_NOT_READY: video readable but not `ready`
- 429 (ThrottlerException): more than `COMMENT_RATE_LIMIT` comments by the same user within `COMMENT_RATE_TTL_SECONDS` *(per phase-06-social-interactions/TD-06)*

---

#### GET /comments/:id/replies (SI-06.3)

**Request headers:**
- Authorization: Bearer {access_token} — optional (fills `my_reaction`)

**Request query parameters:**
- cursor: string, optional — opaque `next_cursor` of a previous page
- limit: integer, optional — 1–50, default 20

**Response 200:** CommentPage of the replies of the top-level comment `:id`, oldest first (`created_at ASC, id ASC`) *(per phase-06-social-interactions/TD-05)*.

**Error responses:**
- 400 VALIDATION_ERROR: malformed `cursor` or `limit` out of range
- 404 COMMENT_NOT_FOUND: unknown comment, a reply (not a top-level comment), or its video is not readable by the caller

---

#### DELETE /comments/:id (SI-06.4)

**Request headers:**
- Authorization: Bearer {access_token}

**Response 204:** No content. A top-level comment with replies becomes a placeholder; any other comment is removed *(per phase-06-social-interactions/TD-06)*.

**Error responses:**
- 401 (JwtAuthGuard): missing or invalid access token
- 403 COMMENT_ACCESS_DENIED: caller is not the comment author
- 404 COMMENT_NOT_FOUND: unknown comment, already a placeholder, or its video is not readable by the caller

---

#### PUT /comments/:id/reaction (SI-06.5)

**Request headers:**
- Authorization: Bearer {access_token}
- Content-Type: application/json

**Request body:**
- value: string, required — `like` | `dislike`

**Response 200:** ReactionState of the comment. Idempotent *(per phase-06-social-interactions/TD-03)*.

**Error responses:**
- 400 VALIDATION_ERROR: `value` missing or invalid
- 401 (JwtAuthGuard): missing or invalid access token
- 404 COMMENT_NOT_FOUND: unknown comment, a placeholder, or its video is not readable by the caller
- 409 VIDEO_NOT_READY: the comment's video is not `ready`

---

#### DELETE /comments/:id/reaction (SI-06.5)

**Request headers:**
- Authorization: Bearer {access_token}

**Response 200:** ReactionState with `my_reaction: null`. Idempotent.

**Error responses:**
- 401 (JwtAuthGuard): missing or invalid access token
- 404 COMMENT_NOT_FOUND: unknown comment, a placeholder, or its video is not readable by the caller
- 409 VIDEO_NOT_READY: the comment's video is not `ready`

---

#### PUT /channels/:nickname/subscription (SI-06.6)

**Request headers:**
- Authorization: Bearer {access_token}

**Response 200:** SubscriptionState (`is_subscribed: true`). Idempotent *(per phase-06-social-interactions/TD-07)*.

**Error responses:**
- 401 (JwtAuthGuard): missing or invalid access token
- 404 CHANNEL_NOT_FOUND: no channel with this nickname (case-insensitive, as `GET /channels/:nickname`)
- 409 SELF_SUBSCRIPTION_NOT_ALLOWED: the channel belongs to the caller

---

#### DELETE /channels/:nickname/subscription (SI-06.6)

**Request headers:**
- Authorization: Bearer {access_token}

**Response 200:** SubscriptionState (`is_subscribed: false`). Idempotent: not subscribed → unchanged count.

**Error responses:**
- 401 (JwtAuthGuard): missing or invalid access token
- 404 CHANNEL_NOT_FOUND: no channel with this nickname

---

#### GET /channels/:nickname — modified (SI-06.6)

**Request headers:**
- Authorization: Bearer {access_token} — optional (new: the route gains `OptionalJwtAuthGuard`)

**Response 200:** existing `PublicChannel` (`nickname`, `name`, `description`, `created_at`) plus:
- subscriber_count: integer
- is_subscribed: boolean — `false` for anonymous callers *(per phase-06-social-interactions/TD-08)*

**Error responses:** unchanged — 404 CHANNEL_NOT_FOUND.

---

#### GET /videos/:id — modified (SI-06.7)

**Request headers:**
- Authorization: Bearer {access_token} — optional (unchanged)

**Response 200:** existing `VideoDetail` plus:
- like_count: integer
- comment_count: integer
- my_reaction: `"like"` | `"dislike"` | null — null for anonymous callers
- channel.subscriber_count: integer
- channel.is_subscribed: boolean — `false` for anonymous callers *(per phase-06-social-interactions/TD-08)*

Every route that returns `VideoDetail` (`PATCH /videos/:id`, `POST /videos/:id/publish`, `POST /videos/:id/unpublish`) carries the same fields for the authenticated owner.

**Error responses:** unchanged — 404 VIDEO_NOT_FOUND.

---

#### GET /me/subscriptions (SI-06.8)

**Request headers:**
- Authorization: Bearer {access_token}

**Request query parameters:**
- cursor: string, optional — opaque `next_cursor` of a previous page
- limit: integer, optional — 1–50, default 24

**Response 200:** keyset page, most recent subscription first *(per phase-06-social-interactions/TD-09)*:
- items: array of `{ nickname: string, name: string, subscriber_count: integer, subscribed_at: string (date-time) }`
- next_cursor: string | null

**Error responses:**
- 400 VALIDATION_ERROR: malformed `cursor` or `limit` out of range
- 401 (JwtAuthGuard): missing or invalid access token

---

#### GET /me/subscriptions/videos (SI-06.8)

**Request headers:**
- Authorization: Bearer {access_token}

**Request query parameters:**
- cursor: string, optional — opaque `next_cursor` of a previous page (same cursor format as the public channel listing)
- limit: integer, optional — 1–50, default 24

**Response 200:** `PublicVideoPage` (`items`: `PublicVideo`[], `next_cursor`) of published, public and ready videos of the channels the caller follows, newest first by `published_at, public_id` — the same card shape and keyset convention as `GET /channels/:nickname/videos` *(per phase-06-social-interactions/TD-09, phase-04-channel-management/TD-09)*. Empty `items` when the caller follows no channel.

**Error responses:**
- 400 VALIDATION_ERROR: malformed `cursor` or `limit` out of range
- 401 (JwtAuthGuard): missing or invalid access token

#### Validation Rules — social interactions

- `value` (reactions): required, one of `like`, `dislike` (`@IsIn`).
- `body` (comments): string, trimmed before validation (`@Transform`), length 1–2,000.
- `parent_id`: optional uuid (`@IsUUID`).
- `cursor`: opaque base64url string; decoding failures → 400 VALIDATION_ERROR (`InvalidPaginationCursorException`, as the public listing). Comment cursors encode `created_at|id`; the subscriptions cursor encodes `created_at|nickname`; the feed reuses `published_at|public_id`.
- `limit`: integer 1–50; comments default 20, subscriptions and feed default 24 (`PUBLIC_LISTING_PAGINATION`).
- Env (Joi): `COMMENT_RATE_LIMIT` integer ≥ 1, default 10; `COMMENT_RATE_TTL_SECONDS` integer ≥ 1, default 60 *(per phase-06-social-interactions/TD-06)*.

### Authorization Matrix

"Owner" = owner of the target resource (video's channel, comment author, or channel). "Readable" = passes the video read rule (published public/unlisted, or own draft).

| Endpoint | Anonymous | Authenticated | Owner |
|----------|-----------|---------------|-------|
| PUT/DELETE /videos/:id/reaction | ✗ (401) | ✓ readable + ready | ✓ own video (incl. own draft when ready) |
| GET /videos/:id/comments | ✓ readable | ✓ readable (+ `my_reaction`) | ✓ own draft |
| POST /videos/:id/comments | ✗ (401) | ✓ readable + ready, throttled per user | ✓ own video |
| GET /comments/:id/replies | ✓ comment's video readable | ✓ (+ `my_reaction`) | ✓ |
| DELETE /comments/:id | ✗ (401) | ✗ (403 COMMENT_ACCESS_DENIED) | ✓ comment author only |
| PUT/DELETE /comments/:id/reaction | ✗ (401) | ✓ comment's video readable + ready | ✓ own comment |
| PUT /channels/:nickname/subscription | ✗ (401) | ✓ | ✗ (409 SELF_SUBSCRIPTION_NOT_ALLOWED) |
| DELETE /channels/:nickname/subscription | ✗ (401) | ✓ | ✓ (no-op) |
| GET /channels/:nickname | ✓ (`is_subscribed: false`) | ✓ (+ `is_subscribed`) | ✓ |
| GET /videos/:id | ✓ (`my_reaction: null`, `is_subscribed: false`) | ✓ (+ viewer state) | ✓ |
| GET /me/subscriptions | ✗ (401) | ✓ own list | — |
| GET /me/subscriptions/videos | ✗ (401) | ✓ own feed | — |

Throttling: the global `ThrottlerGuard` registered by `AuthModule` (`APP_GUARD`, 10 req / 60 s per IP) applies to every route without `@SkipThrottle()`. The new social controllers are `@SkipThrottle()` except `POST /videos/:id/comments`, which uses a per-user limit (tracker = JWT `sub`) of `COMMENT_RATE_LIMIT` per `COMMENT_RATE_TTL_SECONDS` *(per phase-06-social-interactions/TD-06, phase-02-auth/TD-08)*.

### Error Catalog

Existing codes reused: `VIDEO_NOT_FOUND` (404), `VIDEO_NOT_READY` (409), `CHANNEL_NOT_FOUND` (404), `VALIDATION_ERROR` (400). New domain exceptions in `src/common/exceptions/domain.exception.ts`:

| errorCode | HTTP | Trigger |
|-----------|------|---------|
| COMMENT_NOT_FOUND | 404 | Unknown comment id; a placeholder targeted by delete/reaction/reply; a reply passed to `GET /comments/:id/replies`; `parent_id` of another video; comment whose video is not readable by the caller |
| COMMENT_ACCESS_DENIED | 403 | `DELETE /comments/:id` by someone other than the author |
| SELF_SUBSCRIPTION_NOT_ALLOWED | 409 | `PUT /channels/:nickname/subscription` on the caller's own channel *(per phase-06-social-interactions/TD-07)* |
| VIDEO_NOT_READY | 409 | Reaction or comment write on a readable video whose `processing_status` is not `ready` *(per phase-06-social-interactions/TD-03, TD-06 revisions)* |

`429` from the comment throttle keeps the `@nestjs/throttler` default body, like the auth routes.

---

## Dependency Map

```
SI-06.1 (root — schema)
├── SI-06.2 — depends on SI-06.1 (video_reactions + dislike_count)
│   ├── SI-06.5 — depends on SI-06.2 (shared ReactionState DTOs) + SI-06.3 (comments)
│   └── SI-06.7 — depends on SI-06.2 (my_reaction) + SI-06.6 (is_subscribed)
├── SI-06.3 — depends on SI-06.1 (comments table + CommentsModule)
│   ├── SI-06.4 — depends on SI-06.3 (comments to delete)
│   └── SI-06.5 — (see above)
└── SI-06.6 — depends on SI-06.1 (subscriptions + subscriber_count)
    ├── SI-06.7 — (see above)
    └── SI-06.8 — depends on SI-06.6 (subscriptions exist)
SI-06.9 — depends on SI-06.2 … SI-06.8 (all contract changes)
```

---

## Deliverables

- [ ] SI-06.1 — Infra: Social Data Model and Migration
- [ ] SI-06.2 — Endpoints PUT/DELETE /videos/:id/reaction (Video Like/Dislike)
- [ ] SI-06.3 — Endpoints Create and List Comments with Replies
- [ ] SI-06.4 — Endpoint DELETE /comments/:id (Author Deletion)
- [ ] SI-06.5 — Endpoints PUT/DELETE /comments/:id/reaction (Comment Like/Dislike)
- [ ] SI-06.6 — Channel Subscriptions and Subscriber Count (PUT/DELETE /channels/:nickname/subscription)
- [ ] SI-06.7 — VideoDetail with Counts and Viewer State (GET /videos/:id)
- [ ] SI-06.8 — Subscribed-channels Area (GET /me/subscriptions, GET /me/subscriptions/videos)
- [ ] SI-06.9 — OpenAPI Contract Export and HTTP Examples for Social Interactions

**Full test suites:**

- [ ] Backend unit + integration tests pass (`docker compose exec nestjs-api npm test -- --runInBand`)
- [ ] E2E tests pass (`docker compose exec nestjs-api npm run test:e2e -- --runInBand`)
- [ ] Type check passes (`docker compose exec nestjs-api npx tsc --noEmit`)
- [ ] Lint passes (`docker compose exec nestjs-api npm run lint`)
- [ ] Project builds successfully, including the worker entrypoint (`docker compose exec nestjs-api npm run build` → `dist/main.js` and `dist/worker.js`)
