import { MigrationInterface, QueryRunner } from 'typeorm';

export class BookingModulePhase1170000000008 implements MigrationInterface {
  name = 'BookingModulePhase1170000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Recreate bookings_status_enum with UPPERCASE contract values
    //    (drop dependent default first, then recreate type via column re-cast)
    await queryRunner.query(`ALTER TABLE "bookings" ALTER COLUMN "status" DROP DEFAULT;`);
    await queryRunner.query(`ALTER TABLE "bookings" ALTER COLUMN "status" TYPE text USING status::text;`);
    await queryRunner.query(`DROP TYPE "public"."bookings_status_enum";`);
    await queryRunner.query(`CREATE TYPE "public"."bookings_status_enum" AS ENUM(
      'PENDING_PAYMENT', 'PAYMENT_SUBMITTED', 'CONFIRMED', 'ONGOING', 'COMPLETED',
      'CANCELLED_BY_USER', 'CANCELLED_BY_HOST', 'REJECTED_BY_HOST', 'EXPIRED', 'REFUNDED'
    );`);
    await queryRunner.query(`ALTER TABLE "bookings" ALTER COLUMN "status" TYPE "public"."bookings_status_enum" USING 'PENDING_PAYMENT'::"bookings_status_enum";`);
    await queryRunner.query(`ALTER TABLE "bookings" ALTER COLUMN "status" SET DEFAULT 'PENDING_PAYMENT';`);

    // 2. Add new bookings columns
    await queryRunner.query(`ALTER TABLE "bookings"
      ADD COLUMN "vehicle_details" jsonb,
      ADD COLUMN "notes" text,
      ADD COLUMN "currency" varchar(3) NOT NULL DEFAULT 'THB',
      ADD COLUMN "unit_rate" numeric(10,2),
      ADD COLUMN "subtotal" numeric(10,2),
      ADD COLUMN "service_fee" numeric(10,2) NOT NULL DEFAULT 0,
      ADD COLUMN "idempotency_key" uuid;`);

    // 3. Idempotency key: unique + indexed
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_bookings_idempotency_key" ON "bookings" ("idempotency_key");`);

    // 4. booking_status_history table
    await queryRunner.query(`CREATE TYPE "public"."booking_status_history_actor_type_enum" AS ENUM('RENTER', 'HOST', 'SYSTEM');`);
    await queryRunner.query(`
      CREATE TABLE "booking_status_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "booking_id" uuid NOT NULL,
        "status" "public"."bookings_status_enum" NOT NULL,
        "previous_status" "public"."bookings_status_enum",
        "actor_id" uuid,
        "actor_type" "public"."booking_status_history_actor_type_enum" NOT NULL,
        "reason" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_booking_status_history_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_booking_status_history_booking_id" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_booking_status_history_booking_id" ON "booking_status_history" ("booking_id");`);

    // 5. refund_requests table
    await queryRunner.query(`CREATE TYPE "public"."refund_requests_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'PROCESSED');`);
    await queryRunner.query(`
      CREATE TABLE "refund_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "booking_id" uuid NOT NULL,
        "requested_amount" numeric(10,2) NOT NULL,
        "currency" varchar(3) NOT NULL DEFAULT 'THB',
        "reason" text NOT NULL,
        "status" "public"."refund_requests_status_enum" NOT NULL DEFAULT 'PENDING',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refund_requests_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_refund_requests_booking_id" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_refund_requests_booking_id" ON "refund_requests" ("booking_id");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_refund_requests_booking_id";`);
    await queryRunner.query(`DROP TABLE "refund_requests";`);
    await queryRunner.query(`DROP TYPE "public"."refund_requests_status_enum";`);
    await queryRunner.query(`DROP INDEX "public"."UQ_bookings_idempotency_key";`);
    await queryRunner.query(`ALTER TABLE "bookings"
      DROP COLUMN "vehicle_details",
      DROP COLUMN "notes",
      DROP COLUMN "currency",
      DROP COLUMN "unit_rate",
      DROP COLUMN "subtotal",
      DROP COLUMN "service_fee",
      DROP COLUMN "idempotency_key";`);
    await queryRunner.query(`DROP TABLE "booking_status_history";`);
    await queryRunner.query(`DROP TYPE "public"."booking_status_history_actor_type_enum";`);
    await queryRunner.query(`ALTER TABLE "bookings" ALTER COLUMN "status" DROP DEFAULT;`);
    await queryRunner.query(`DROP TYPE "public"."bookings_status_enum";`);
    await queryRunner.query(`CREATE TYPE "public"."bookings_status_enum" AS ENUM('pending_payment', 'confirmed', 'ongoing', 'completed', 'cancelled');`);
    await queryRunner.query(`ALTER TABLE "bookings" ALTER COLUMN "status" TYPE "public"."bookings_status_enum" USING 'pending_payment'::"bookings_status_enum";`);
    await queryRunner.query(`ALTER TABLE "bookings" ALTER COLUMN "status" SET DEFAULT 'pending_payment';`);
  }
}