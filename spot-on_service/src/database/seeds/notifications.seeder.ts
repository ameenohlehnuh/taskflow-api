import { DataSource } from 'typeorm';
import { Notification, NotificationType } from '../../notifications/entities/notification.entity';
import { SeedBookingIds, SeedUserIds, seedIds } from './seed-ids';

export async function seedNotifications(dataSource: DataSource, bookings: SeedBookingIds, users: SeedUserIds): Promise<void> {
  await dataSource.getRepository(Notification).upsert(
    [
      {
        id: seedIds.notifications.payment,
        userId: users.somchai,
        type: NotificationType.SLIP_SUBMITTED,
        payload: { bookingId: bookings.siam, amount: 150 } as Record<string, any>,
        isRead: true,
      },
      {
        id: seedIds.notifications.booking,
        userId: users.kittisak,
        type: NotificationType.BOOKING_APPROVED,
        payload: { bookingId: bookings.siam } as Record<string, any>,
        isRead: false,
      },
    ],
    ['id'],
  );
}