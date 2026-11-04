import { MigrationInterface, QueryRunner } from 'typeorm';

// Fixed catalog (phase-04-channel-management/TD-01 revision 2026-11-04).
const SEED_CATEGORIES: [slug: string, name: string][] = [
  ['musica', 'Música'],
  ['jogos', 'Jogos'],
  ['educacao', 'Educação'],
  ['esportes', 'Esportes'],
  ['entretenimento', 'Entretenimento'],
  ['tecnologia', 'Tecnologia'],
  ['noticias', 'Notícias'],
  ['humor', 'Humor'],
  ['viagens', 'Viagens'],
  ['outros', 'Outros'],
];

export class CreateCategories1793764886633 implements MigrationInterface {
  name = 'CreateCategories1793764886633';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" character varying(50) NOT NULL, "name" character varying(50) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_420d9f679d41281f282f5bc7d09" UNIQUE ("slug"), CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`,
    );
    for (const [slug, name] of SEED_CATEGORIES) {
      await queryRunner.query(
        `INSERT INTO "categories" ("slug", "name") VALUES ($1, $2)`,
        [slug, name],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "categories"`);
  }
}
