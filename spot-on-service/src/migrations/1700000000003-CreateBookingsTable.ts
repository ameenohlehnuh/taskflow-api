import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBookingsTable1700000000003 implements MigrationInterface {
  name = 'CreateBookingsTable1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."bookings_rental_type_enum" AS ENUM('hourly', 'daily', 'monthly');`);
    await queryRunner.query(`CREATE TYPE "public"."bookings_status_enum" AS ENUM('pending_payment', 'confirmed', 'ongoing', 'completed', 'cancelled');`);
    await queryRunner.query(`
      CREATE TABLE "bookings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "spot_id" uuid NOT NULL,
        "renter_id" uuid NOT NULL,
        "host_id" uuid NOT NULL,
        "rental_type" "public"."bookings_rental_type_enum" NOT NULL,
        "start_time" TIMESTAMP WITH TIME ZONE NOT NULL,
        "end_time" TIMESTAMP WITH TIME ZONE NOT NULL,
        "total_price" numeric(10,2) NOT NULL,
        "status" "public"."bookings_status_enum" NOT NULL DEFAULT 'pending_payment',
        "payment_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bookings_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bookings_spot_id" FOREIGN KEY ("spot_id") REFERENCES "parking_spots"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_bookings_renter_id" FOREIGN KEY ("renter_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_bookings_host_id" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_bookings_spot_time" ON "bookings" ("spot_id", "start_time", "end_time");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_bookings_spot_time";`);
    await queryRunner.query(`DROP TABLE "bookings";`);
    await queryRunner.query(`DROP TYPE "public"."bookings_status_enum";`);
    await queryRunner.query(`DROP TYPE "public"."bookings_rental_type_enum";`);
  }
}
