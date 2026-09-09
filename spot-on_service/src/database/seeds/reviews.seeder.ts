import { DataSource } from 'typeorm';
import { Review } from '../../reviews/entities/review.entity';
import { SeedBookingIds, SeedSpotIds, SeedUserIds, seedIds } from './seed-ids';

export async function seedReviews(dataSource: DataSource, bookings: SeedBookingIds, spots: SeedSpotIds, users: SeedUserIds): Promise<void> {
  await dataSource.getRepository(Review).upsert(
    {
      id: seedIds.reviews.siam,
      bookingId: bookings.siam,
      fromUserId: users.kittisak,
      toUserId: users.somchai,
      spotId: spots.siam,
      rating: 5,
      comment: 'Great spot! Very easy to find and very close to Siam Paragon.',
    },
    ['id'],
  );
}