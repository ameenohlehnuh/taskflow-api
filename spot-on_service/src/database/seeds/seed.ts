import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { User, UserRole } from '../../users/entities/user.entity';
import { ParkingSpot, SpotStatus } from '../../spots/entities/parking-spot.entity';
import { Booking, BookingStatus, RentalType } from '../../bookings/entities/booking.entity';
import { Payment, PaymentMethod, PaymentVerificationStatus } from '../../payments/entities/payment.entity';
import { Review } from '../../reviews/entities/review.entity';
import { Notification, NotificationType } from '../../notifications/entities/notification.entity';

config();

async function runSeed() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'spoton',
    entities: [User, ParkingSpot, Booking, Payment, Review, Notification],
    synchronize: false,
  });

  await dataSource.initialize();
  console.log('🌱 Connected to database for seeding...');

  const userRepo = dataSource.getRepository(User);
  const spotRepo = dataSource.getRepository(ParkingSpot);
  const bookingRepo = dataSource.getRepository(Booking);
  const paymentRepo = dataSource.getRepository(Payment);
  const reviewRepo = dataSource.getRepository(Review);
  const notificationRepo = dataSource.getRepository(Notification);

  // Clear existing mock data in reverse order of FKs using TRUNCATE CASCADE
  await dataSource.query('TRUNCATE TABLE "notifications", "reviews", "payments", "bookings", "parking_spots", "users" CASCADE;');

  console.log('🧹 Cleared old data.');

  // 1. Seed Users (Pre-hashed bcrypt for password123)
  const defaultHash = '$2b$10$epHa9O7j1047467wzYc5xeg4K8Yj5xU767Yg4j5k6l7m8n9o0p1q2'; // password123 hash

  const user1 = await userRepo.save({
    name: 'Somchai Jaidee',
    email: 'somchai@example.com',
    passwordHash: defaultHash,
    phone: '0812345678',
    avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400',
    role: UserRole.BOTH,
    rating: 4.8,
    reviewCount: 12,
  });

  const user2 = await userRepo.save({
    name: 'Jane Doe',
    email: 'jane@example.com',
    passwordHash: defaultHash,
    phone: '0898765432',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
    role: UserRole.HOST,
    rating: 5.0,
    reviewCount: 8,
  });

  const user3 = await userRepo.save({
    name: 'Kittisak Renter',
    email: 'kittisak@example.com',
    passwordHash: defaultHash,
    phone: '0865551234',
    avatarUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=400',
    role: UserRole.RENTER,
    rating: 4.5,
    reviewCount: 3,
  });

  console.log('✅ Users seeded.');

  // 2. Seed Parking Spots (Bangkok coordinates: Siam & Asoke)
  // Siam Paragon area: lat 13.7466, lng 100.5349
  // Asoke BTS area: lat 13.7367, lng 100.5608
  await dataSource.query(`
    INSERT INTO "parking_spots" 
    ("id", "host_id", "title", "description", "address", "location", "price_per_hour", "price_per_day", "price_per_month", "images", "amenities", "vehicle_types", "status", "rating", "review_count")
    VALUES 
    (
      uuid_generate_v4(),
      '${user1.id}',
      'Indoor Parking near Siam Paragon',
      'Covered private parking spot, 24/7 CCTV, easy walking distance to BTS Siam and Siam Paragon.',
      'Rama I Rd, Pathum Wan, Bangkok 10330',
      ST_SetSRID(ST_MakePoint(100.5349, 13.7466), 4326),
      50.00,
      350.00,
      4500.00,
      '["https://images.unsplash.com/photo-1506521781263-d8422e82f27a?w=800"]',
      '["CCTV", "Covered", "EV Charger", "Security Guard"]',
      '["sedan", "suv"]',
      'active',
      4.9,
      15
    ),
    (
      uuid_generate_v4(),
      '${user2.id}',
      'Condo Parking Spot at Asoke BTS',
      'Safe keycard-access parking lot in luxury condo building near Terminal 21 and BTS Asoke.',
      'Sukhumvit 21, Khlong Toei Nuea, Watthana, Bangkok 10110',
      ST_SetSRID(ST_MakePoint(100.5608, 13.7367), 4326),
      40.00,
      280.00,
      3800.00,
      '["https://images.unsplash.com/photo-1590674899484-d5640e854abe?w=800"]',
      '["CCTV", "Keycard Access", "Covered"]',
      '["sedan", "suv", "motorcycle"]',
      'active',
      5.0,
      8
    );
  `);

  const spots = await spotRepo.find();
  const spot1 = spots[0];
  console.log('✅ Parking spots seeded with PostGIS points.');

  // 3. Seed Booking
  const now = new Date();
  const startTime = new Date(now.getTime() + 3600 * 1000); // +1 hour
  const endTime = new Date(now.getTime() + 4 * 3600 * 1000); // +4 hours

  const booking1 = await bookingRepo.save({
    spotId: spot1.id,
    renterId: user3.id,
    hostId: user1.id,
    rentalType: RentalType.HOURLY,
    startTime,
    endTime,
    totalPrice: 150.00,
    status: BookingStatus.CONFIRMED,
  });

  console.log('✅ Booking seeded.');

  // 4. Seed Payment
  const payment1 = await paymentRepo.save({
    bookingId: booking1.id,
    method: PaymentMethod.PROMPTPAY,
    amount: 150.00,
    slipImageUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600',
    verificationStatus: PaymentVerificationStatus.VERIFIED,
    verifiedAt: new Date(),
    verifiedBy: user1.id,
  });

  // Link payment back to booking
  await bookingRepo.update(booking1.id, { paymentId: payment1.id });
  console.log('✅ Payment seeded.');

  // 5. Seed Review
  await reviewRepo.save({
    bookingId: booking1.id,
    fromUserId: user3.id,
    toUserId: user1.id,
    spotId: spot1.id,
    rating: 5,
    comment: 'Great spot! Very easy to find and very close to Siam Paragon.',
  });

  console.log('✅ Review seeded.');

  // 6. Seed Notification
  await notificationRepo.save([
    {
      userId: user1.id,
      type: NotificationType.SLIP_SUBMITTED,
      payload: { bookingId: booking1.id, spotTitle: spot1.title, amount: 150.00 },
      isRead: true,
    },
    {
      userId: user3.id,
      type: NotificationType.BOOKING_APPROVED,
      payload: { bookingId: booking1.id, spotTitle: spot1.title },
      isRead: false,
    },
  ]);

  console.log('✅ Notifications seeded.');

  await dataSource.destroy();
  console.log('🎉 Database seeding completed successfully!');
}

runSeed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
