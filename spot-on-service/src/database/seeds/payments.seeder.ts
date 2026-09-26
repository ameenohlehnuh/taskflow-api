import { DataSource } from 'typeorm';
import { Booking } from '../../bookings/entities/booking.entity';
import { Payment, PaymentMethod, PaymentVerificationStatus } from '../../payments/entities/payment.entity';
import { SeedBookingIds, SeedUserIds, seedIds } from './seed-ids';

export async function seedPayments(dataSource: DataSource, bookings: SeedBookingIds, users: SeedUserIds): Promise<void> {
  const repository = dataSource.getRepository(Payment);

  await repository.upsert(
    {
      id: seedIds.payments.siam,
      bookingId: bookings.siam,
      method: PaymentMethod.PROMPTPAY,
      amount: 150,
      slipImageUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600',
      verificationStatus: PaymentVerificationStatus.VERIFIED,
      verifiedAt: new Date('2030-01-15T09:00:00.000Z'),
      verifiedBy: users.somchai,
    },
    ['id'],
  );

  await dataSource.getRepository(Booking).update(bookings.siam, { paymentId: seedIds.payments.siam });
}