import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSocialInteractions1794432662530 implements MigrationInterface {
  name = 'AddSocialInteractions1794432662530';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "subscriptions" ("user_id" uuid NOT NULL, "channel_id" uuid NOT NULL, "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f517dfb9e95674ffed33138db58" PRIMARY KEY ("user_id", "channel_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f94727d15ad613cd0e651ce299" ON "subscriptions" ("channel_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bb960a8ea4d683ad5c19df47c5" ON "subscriptions" ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "comments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "video_id" uuid NOT NULL, "user_id" uuid NOT NULL, "parent_id" uuid, "body" character varying(2000), "deleted_at" TIMESTAMP WITH TIME ZONE, "like_count" integer NOT NULL DEFAULT '0', "dislike_count" integer NOT NULL DEFAULT '0', "reply_count" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_8bf68bc960f2b69e818bdb90dcb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4c675567d2a58f0b07cef09c13" ON "comments" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6e7bf11b53776a1becab6fe98c" ON "comments" ("parent_id", "created_at", "id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5c0de7e14dfcc6b4c74cf44f5e" ON "comments" ("video_id", "parent_id", "created_at", "id") `,
    );
    // One enum type shared by video_reactions and comment_reactions (phase-06 TD-01).
    await queryRunner.query(
      `CREATE TYPE "public"."reaction_value" AS ENUM('like', 'dislike')`,
    );
    await queryRunner.query(
      `CREATE TABLE "video_reactions" ("user_id" uuid NOT NULL, "video_id" uuid NOT NULL, "value" "public"."reaction_value" NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3dd378126c2292642543ab79ae7" PRIMARY KEY ("user_id", "video_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_119b9e05b9aa06fda68e5a8100" ON "video_reactions" ("video_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "comment_reactions" ("user_id" uuid NOT NULL, "comment_id" uuid NOT NULL, "value" "public"."reaction_value" NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a883c2a09d16ce1d0db8b9758d4" PRIMARY KEY ("user_id", "comment_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dc714054fc62b698018fcb0ae3" ON "comment_reactions" ("comment_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "channels" ADD "subscriber_count" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ADD "dislike_count" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD CONSTRAINT "FK_d0a95ef8a28188364c546eb65c1" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD CONSTRAINT "FK_f94727d15ad613cd0e651ce299c" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "comments" ADD CONSTRAINT "FK_0528681f0d2c6e89116dd3eb3f4" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "comments" ADD CONSTRAINT "FK_4c675567d2a58f0b07cef09c13d" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "comments" ADD CONSTRAINT "FK_d6f93329801a93536da4241e386" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "video_reactions" ADD CONSTRAINT "FK_b260ec9a671397dc435249c040c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "video_reactions" ADD CONSTRAINT "FK_119b9e05b9aa06fda68e5a81001" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "comment_reactions" ADD CONSTRAINT "FK_481c40600b2ee590adb27abb0e6" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "comment_reactions" ADD CONSTRAINT "FK_dc714054fc62b698018fcb0ae37" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "comment_reactions" DROP CONSTRAINT "FK_dc714054fc62b698018fcb0ae37"`,
    );
    await queryRunner.query(
      `ALTER TABLE "comment_reactions" DROP CONSTRAINT "FK_481c40600b2ee590adb27abb0e6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "video_reactions" DROP CONSTRAINT "FK_119b9e05b9aa06fda68e5a81001"`,
    );
    await queryRunner.query(
      `ALTER TABLE "video_reactions" DROP CONSTRAINT "FK_b260ec9a671397dc435249c040c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "comments" DROP CONSTRAINT "FK_d6f93329801a93536da4241e386"`,
    );
    await queryRunner.query(
      `ALTER TABLE "comments" DROP CONSTRAINT "FK_4c675567d2a58f0b07cef09c13d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "comments" DROP CONSTRAINT "FK_0528681f0d2c6e89116dd3eb3f4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" DROP CONSTRAINT "FK_f94727d15ad613cd0e651ce299c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" DROP CONSTRAINT "FK_d0a95ef8a28188364c546eb65c1"`,
    );
    await queryRunner.query(`ALTER TABLE "videos" DROP COLUMN "dislike_count"`);
    await queryRunner.query(
      `ALTER TABLE "channels" DROP COLUMN "subscriber_count"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_dc714054fc62b698018fcb0ae3"`,
    );
    await queryRunner.query(`DROP TABLE "comment_reactions"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_119b9e05b9aa06fda68e5a8100"`,
    );
    await queryRunner.query(`DROP TABLE "video_reactions"`);
    await queryRunner.query(`DROP TYPE "public"."reaction_value"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5c0de7e14dfcc6b4c74cf44f5e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6e7bf11b53776a1becab6fe98c"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4c675567d2a58f0b07cef09c13"`,
    );
    await queryRunner.query(`DROP TABLE "comments"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bb960a8ea4d683ad5c19df47c5"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f94727d15ad613cd0e651ce299"`,
    );
    await queryRunner.query(`DROP TABLE "subscriptions"`);
  }
}
