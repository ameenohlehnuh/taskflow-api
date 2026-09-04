import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersTable1700000000001 implements MigrationInterface {
  name = 'CreateUsersTable1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
    await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('renter', 'host', 'both');`);
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(255) NOT NULL,
        "email" character varying(255) NOT NULL,
        "password_hash" character varying(255) NOT NULL,
        "phone" character varying(20) NOT NULL,
        "avatar_url" character varying(500),
        "role" "public"."users_role_enum" NOT NULL DEFAULT 'renter',
        "rating" numeric(2,1) NOT NULL DEFAULT '0',
        "review_count" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id")
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "users";`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum";`);
  }
}
