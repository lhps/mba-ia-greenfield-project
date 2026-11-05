import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Channel } from '../channels/entities/channel.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Video } from '../videos/entities/video.entity';
import { Category } from '../categories/entities/category.entity';
import { CreateUsersAndChannels1775687773260 } from './migrations/1775687773260-CreateUsersAndChannels';
import { CreateAuthTokens1777579850478 } from './migrations/1777579850478-CreateAuthTokens';
import { CreateVideos1793753568714 } from './migrations/1793753568714-CreateVideos';
import { CreateCategories1793764886633 } from './migrations/1793764886633-CreateCategories';
import { AddVideoChannelManagement1793794482102 } from './migrations/1793794482102-AddVideoChannelManagement';
import { createTestDataSource } from '../test/create-test-data-source';

const MANAGED_TABLES = [
  'users',
  'channels',
  'refresh_tokens',
  'verification_tokens',
  'videos',
  'categories',
];

// DROP TABLE does not drop enum types; leftovers make re-applying migrations fail.
const MANAGED_ENUM_TYPES = [
  'verification_tokens_type_enum',
  'videos_processing_status_enum',
  'videos_publication_status_enum',
  'videos_visibility_enum',
];

async function columnExists(
  dataSource: DataSource,
  table: string,
  column: string,
): Promise<boolean> {
  const rows = await dataSource.query<unknown[]>(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return rows.length > 0;
}

async function typeExists(
  dataSource: DataSource,
  typeName: string,
): Promise<boolean> {
  const rows = await dataSource.query<unknown[]>(
    'SELECT 1 FROM pg_type WHERE typname = $1',
    [typeName],
  );
  return rows.length > 0;
}

describe('Database migrations (integration)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = createTestDataSource(
      [User, Channel, RefreshToken, VerificationToken, Video, Category],
      {
        synchronize: false,
        migrations: [
          CreateUsersAndChannels1775687773260,
          CreateAuthTokens1777579850478,
          CreateVideos1793753568714,
          CreateCategories1793764886633,
          AddVideoChannelManagement1793794482102,
        ],
      },
    );

    await dataSource.initialize();

    for (const table of [...MANAGED_TABLES, 'migrations']) {
      await dataSource.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
    }
    for (const type of MANAGED_ENUM_TYPES) {
      await dataSource.query(`DROP TYPE IF EXISTS "public"."${type}"`);
    }
  });

  afterAll(async () => {
    // Tests run in order: the revert test undoes AddVideoChannelManagement and the backfill
    // test re-applies it. Re-apply anyway so the shared DB is fully migrated afterwards.
    // Re-apply so the shared DB is fully migrated when subsequent suites run.
    await dataSource.runMigrations();
    await dataSource.destroy();
  });

  it('should apply all migrations and create all managed tables', async () => {
    const ranMigrations = await dataSource.runMigrations();

    expect(ranMigrations).toHaveLength(5);

    const result = await dataSource.query<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      [MANAGED_TABLES],
    );
    const tableNames = result.map((r) => r.table_name);
    expect(tableNames).toEqual([
      'categories',
      'channels',
      'refresh_tokens',
      'users',
      'verification_tokens',
      'videos',
    ]);
  });

  it('should seed the 10 categories', async () => {
    const rows = await dataSource.query<{ count: string }[]>(
      'SELECT COUNT(*)::text AS count FROM "categories"',
    );
    expect(rows[0].count).toBe('10');
  });

  it('should revert AddVideoChannelManagement back to the Phase 03 schema', async () => {
    await dataSource.undoLastMigration();

    await expect(columnExists(dataSource, 'videos', 'title')).resolves.toBe(
      false,
    );
    await expect(
      columnExists(dataSource, 'channels', 'nickname_changed_at'),
    ).resolves.toBe(false);
    await expect(
      typeExists(dataSource, 'videos_visibility_enum'),
    ).resolves.toBe(false);
  });

  // Depends on the previous test: AddVideoChannelManagement must be reverted.
  it('should backfill title from file_name for pre-existing videos', async () => {
    const [user] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO users (email, password)
       VALUES ('backfill@example.com', 'hashed') RETURNING id`,
    );
    const [channel] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO channels (name, nickname, user_id)
       VALUES ('backfill', 'backfill', $1) RETURNING id`,
      [user.id],
    );
    const fileNames = ['Minha viagem.mp4', '.mp4', `${'x'.repeat(150)}.mov`];
    for (const [index, fileName] of fileNames.entries()) {
      await dataSource.query(
        `INSERT INTO videos (public_id, channel_id, file_name, file_size, content_type, original_key)
         VALUES ($1, $2, $3, 1, 'video/mp4', 'k')`,
        [`backfill${index}`, channel.id, fileName],
      );
    }

    try {
      await dataSource.runMigrations();

      const rows = await dataSource.query<
        { file_name: string; title: string }[]
      >('SELECT file_name, title FROM videos WHERE channel_id = $1', [
        channel.id,
      ]);
      const titles = Object.fromEntries(
        rows.map((r) => [r.file_name, r.title]),
      );
      expect(titles['Minha viagem.mp4']).toBe('Minha viagem');
      expect(titles['.mp4']).toBe('.mp4');
      expect(titles[`${'x'.repeat(150)}.mov`]).toBe('x'.repeat(100));
    } finally {
      // videos cascade on channel delete; channels.user_id has no cascade.
      await dataSource.query('DELETE FROM channels WHERE id = $1', [
        channel.id,
      ]);
      await dataSource.query('DELETE FROM users WHERE id = $1', [user.id]);
    }
  });
});
