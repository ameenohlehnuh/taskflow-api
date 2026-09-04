import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateParkingSpotsTable1700000000002 implements MigrationInterface {
  name = 'CreateParkingSpotsTable1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."parking_spots_status_enum" AS ENUM('active', 'inactive');`);
    await queryRunner.query(`
      CREATE TABLE "parking_spots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "host_id" uuid NOT NULL,
        "title" character varying(255) NOT NULL,
        "description" text NOT NULL,
        "address" character varying(500) NOT NULL,
        "location" geography(Point,4326) NOT NULL,
        "price_per_hour" numeric(10,2),
        "price_per_day" numeric(10,2),
        "price_per_month" numeric(10,2),
        "images" jsonb NOT NULL DEFAULT '[]',
        "amenities" jsonb NOT NULL DEFAULT '[]',
        "vehicle_types" jsonb NOT NULL DEFAULT '[]',
        "status" "public"."parking_spots_status_enum" NOT NULL DEFAULT 'active',
        "rating" numeric(2,1) NOT NULL DEFAULT '0',
        "review_count" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_parking_spots_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_parking_spots_host_id" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_parking_spots_location" ON "parking_spots" USING GIST ("location");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_parking_spots_location";`);
    await queryRunner.query(`DROP TABLE "parking_spots";`);
    await queryRunner.query(`DROP TYPE "public"."parking_spots_status_enum";`);
  }
}
