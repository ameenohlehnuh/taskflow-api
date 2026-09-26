import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationsTable1700000000006 implements MigrationInterface {
  name = 'CreateNotificationsTable1700000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."notifications_type_enum" AS ENUM('slip_submitted', 'booking_approved', 'booking_cancelled', 'payment_rejected');`);
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "type" "public"."notifications_type_enum" NOT NULL,
        "payload" jsonb NOT NULL DEFAULT '{}',
        "is_read" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notifications_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_notifications_user_id" ON "notifications" ("user_id");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_notifications_user_id";`);
    await queryRunner.query(`DROP TABLE "notifications";`);
    await queryRunner.query(`DROP TYPE "public"."notifications_type_enum";`);
  }
}
