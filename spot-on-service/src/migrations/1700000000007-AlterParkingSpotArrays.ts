import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterParkingSpotArrays1700000000007 implements MigrationInterface {
  name = 'AlterParkingSpotArrays1700000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "parking_spots" ALTER COLUMN "amenities" DROP DEFAULT;`,
    );
    await queryRunner.query(`
      ALTER TABLE "parking_spots"
        ALTER COLUMN "amenities" TYPE text[] USING array[]::text[],
        ALTER COLUMN "amenities" SET DEFAULT '{}';
    `);
    await queryRunner.query(
      `ALTER TABLE "parking_spots" ALTER COLUMN "vehicle_types" DROP DEFAULT;`,
    );
    await queryRunner.query(`
      ALTER TABLE "parking_spots"
        ALTER COLUMN "vehicle_types" TYPE text[] USING array[]::text[],
        ALTER COLUMN "vehicle_types" SET DEFAULT '{}';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "parking_spots"
        ALTER COLUMN "amenities" TYPE jsonb USING to_jsonb("amenities"),
        ALTER COLUMN "amenities" SET DEFAULT '[]'::jsonb;
    `);
    await queryRunner.query(`
      ALTER TABLE "parking_spots"
        ALTER COLUMN "vehicle_types" TYPE jsonb USING to_jsonb("vehicle_types"),
        ALTER COLUMN "vehicle_types" SET DEFAULT '[]'::jsonb;
    `);
  }
}
