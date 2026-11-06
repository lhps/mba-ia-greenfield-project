import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVideoSuggestionsIndex1793998924959 implements MigrationInterface {
  name = 'AddVideoSuggestionsIndex1793998924959';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_197e38ff35f4b5196ef22b7c62" ON "videos" ("category_id", "view_count", "published_at") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_197e38ff35f4b5196ef22b7c62"`,
    );
  }
}
