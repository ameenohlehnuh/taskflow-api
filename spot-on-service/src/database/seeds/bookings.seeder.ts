import { DataSource } from 'typeorm';
import { Booking, BookingStatus, RentalType } from '../../bookings/entities/booking.entity';
import { SeedSpotIds, SeedUserIds, seedIds, SeedBookingIds } from './seed-ids';

export async function seedBookings(
  dataSource: DataSource,
  users: SeedUserIds,
  spots: SeedSpotIds,
): Promise<SeedBookingIds> {
  const repository = dataSource.getRepository(Booking);
  const startTime = new Date('2030-01-15T10:00:00.000Z');
  const endTime = new Date('2030-01-15T13:00:00.000Z');

  await repository.upsert(
    {
      id: seedIds.bookings.siam,
      spotId: spots.siam,
      renterId: users.kittisak,
      hostId: users.somchai,
      rentalType: RentalType.HOURLY,
      startTime,
      endTime,
      totalPrice: 150,
      status: BookingStatus.CONFIRMED,
      paymentId: null,
    },
    ['id'],
  );

  return seedIds.bookings;
}