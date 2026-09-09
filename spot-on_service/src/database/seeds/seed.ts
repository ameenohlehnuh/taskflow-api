import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../../app.module';
import { seedBookings } from './bookings.seeder';
import { seedNotifications } from './notifications.seeder';
import { seedPayments } from './payments.seeder';
import { seedReviews } from './reviews.seeder';
import { seedSpots } from './spots.seeder';
import { seedUsers } from './users.seeder';

async function runSeed(): Promise<void> {
  const logger = new Logger('DatabaseSeed');
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const dataSource = app.get(DataSource);
    await dataSource.runMigrations();
    logger.log('Database migrations are up to date.');

    logger.log('Seeding users...');
    const users = await seedUsers(dataSource);
    logger.log('Users seeded.');

    logger.log('Seeding parking spots...');
    const spots = await seedSpots(dataSource, users);
    logger.log('Parking spots seeded.');

    logger.log('Seeding bookings...');
    const bookings = await seedBookings(dataSource, users, spots);
    logger.log('Bookings seeded.');

    logger.log('Seeding payments...');
    await seedPayments(dataSource, bookings, users);
    logger.log('Payments seeded.');

    logger.log('Seeding reviews...');
    await seedReviews(dataSource, bookings, spots, users);
    logger.log('Reviews seeded.');

    logger.log('Seeding notifications...');
    await seedNotifications(dataSource, bookings, users);
    logger.log('Notifications seeded.');

    logger.log('Database seeding completed successfully.');
  } finally {
    await app.close();
  }
}

runSeed().catch((error: unknown) => {
  const logger = new Logger('DatabaseSeed');
  logger.error('Database seeding failed.', error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
