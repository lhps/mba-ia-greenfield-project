import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVideoChannelManagement1793794482102 implements MigrationInterface {
  name = 'AddVideoChannelManagement1793794482102';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "channels" ADD "nickname_changed_at" TIMESTAMP WITH TIME ZONE`,
    );
    // Added nullable, backfilled from file_name (same rule as deriveTitleFromFileName), then NOT NULL.
    await queryRunner.query(
      `ALTER TABLE "videos" ADD "title" character varying(100)`,
    );
    await queryRunner.query(
      `UPDATE "videos" SET "title" = left(COALESCE(NULLIF(regexp_replace("file_name", '\\.[^.]*$', ''), ''), "file_name"), 100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ALTER COLUMN "title" SET NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "videos" ADD "description" text`);
    await queryRunner.query(`ALTER TABLE "videos" ADD "category_id" uuid`);
    await queryRunner.query(
      `CREATE TYPE "public"."videos_visibility_enum" AS ENUM('public', 'unlisted')`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ADD "visibility" "public"."videos_visibility_enum" NOT NULL DEFAULT 'public'`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ADD "published_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ADD "has_custom_thumbnail" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ADD "view_count" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ADD "like_count" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ADD "comment_count" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."videos_publication_status_enum" RENAME TO "videos_publication_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."videos_publication_status_enum" AS ENUM('draft', 'published')`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ALTER COLUMN "publication_status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ALTER COLUMN "publication_status" TYPE "public"."videos_publication_status_enum" USING "publication_status"::"text"::"public"."videos_publication_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ALTER COLUMN "publication_status" SET DEFAULT 'draft'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."videos_publication_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f9fe0463a9fa4899f41ab73651" ON "videos" ("category_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bb5d83474d5590596ef4637295" ON "videos" ("channel_id", "published_at", "public_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_350c48c9093177350f2c50e650" ON "videos" ("channel_id", "created_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ADD CONSTRAINT "FK_f9fe0463a9fa4899f41ab736511" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "videos" DROP CONSTRAINT "FK_f9fe0463a9fa4899f41ab736511"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_350c48c9093177350f2c50e650"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bb5d83474d5590596ef4637295"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f9fe0463a9fa4899f41ab73651"`,
    );
    // The Phase 03 enum has no 'published'; demote such rows so the type cast below succeeds.
    await queryRunner.query(
      `UPDATE "videos" SET "publication_status" = 'draft' WHERE "publication_status" = 'published'`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."videos_publication_status_enum_old" AS ENUM('draft')`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ALTER COLUMN "publication_status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ALTER COLUMN "publication_status" TYPE "public"."videos_publication_status_enum_old" USING "publication_status"::"text"::"public"."videos_publication_status_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ALTER COLUMN "publication_status" SET DEFAULT 'draft'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."videos_publication_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."videos_publication_status_enum_old" RENAME TO "videos_publication_status_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "videos" DROP COLUMN "comment_count"`);
    await queryRunner.query(`ALTER TABLE "videos" DROP COLUMN "like_count"`);
    await queryRunner.query(`ALTER TABLE "videos" DROP COLUMN "view_count"`);
    await queryRunner.query(
      `ALTER TABLE "videos" DROP COLUMN "has_custom_thumbnail"`,
    );
    await queryRunner.query(`ALTER TABLE "videos" DROP COLUMN "published_at"`);
    await queryRunner.query(`ALTER TABLE "videos" DROP COLUMN "visibility"`);
    await queryRunner.query(`DROP TYPE "public"."videos_visibility_enum"`);
    await queryRunner.query(`ALTER TABLE "videos" DROP COLUMN "category_id"`);
    await queryRunner.query(`ALTER TABLE "videos" DROP COLUMN "description"`);
    await queryRunner.query(`ALTER TABLE "videos" DROP COLUMN "title"`);
    await queryRunner.query(
      `ALTER TABLE "channels" DROP COLUMN "nickname_changed_at"`,
    );
  }
}
