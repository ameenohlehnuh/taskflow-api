import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentsTable1700000000004 implements MigrationInterface {
  name = 'CreatePaymentsTable1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."payments_method_enum" AS ENUM('promptpay');`);
    await queryRunner.query(`CREATE TYPE "public"."payments_verification_status_enum" AS ENUM('awaiting_slip', 'pending_review', 'verified', 'rejected');`);
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "booking_id" uuid NOT NULL,
        "method" "public"."payments_method_enum" NOT NULL DEFAULT 'promptpay',
        "amount" numeric(10,2) NOT NULL,
        "slip_image_url" character varying(500),
        "verification_status" "public"."payments_verification_status_enum" NOT NULL DEFAULT 'awaiting_slip',
        "verified_at" TIMESTAMP WITH TIME ZONE,
        "verified_by" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_payments_booking_id" UNIQUE ("booking_id"),
        CONSTRAINT "PK_payments_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_payments_booking_id" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_payments_verified_by" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "payments";`);
    await queryRunner.query(`DROP TYPE "public"."payments_verification_status_enum";`);
    await queryRunner.query(`DROP TYPE "public"."payments_method_enum";`);
  }
}
