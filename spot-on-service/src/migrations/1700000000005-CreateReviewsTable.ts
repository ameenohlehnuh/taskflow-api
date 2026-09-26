import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReviewsTable1700000000005 implements MigrationInterface {
  name = 'CreateReviewsTable1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "reviews" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "booking_id" uuid NOT NULL,
        "from_user_id" uuid NOT NULL,
        "to_user_id" uuid NOT NULL,
        "spot_id" uuid,
        "rating" smallint NOT NULL,
        "comment" text NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_reviews_rating" CHECK ("rating" >= 1 AND "rating" <= 5),
        CONSTRAINT "PK_reviews_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_reviews_booking_id" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_reviews_from_user_id" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_reviews_to_user_id" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_reviews_spot_id" FOREIGN KEY ("spot_id") REFERENCES "parking_spots"("id") ON DELETE CASCADE
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "reviews";`);
  }
}
