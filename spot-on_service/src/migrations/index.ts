// Explicit migration registry — avoids glob-loading issues in compiled builds,
// where a wildcard pattern may fail to discover every migration file.
import { EnablePostgis1700000000000 } from './1700000000000-EnablePostgis';
import { CreateUsersTable1700000000001 } from './1700000000001-CreateUsersTable';
import { CreateParkingSpotsTable1700000000002 } from './1700000000002-CreateParkingSpotsTable';
import { CreateBookingsTable1700000000003 } from './1700000000003-CreateBookingsTable';
import { CreatePaymentsTable1700000000004 } from './1700000000004-CreatePaymentsTable';
import { CreateReviewsTable1700000000005 } from './1700000000005-CreateReviewsTable';
import { CreateNotificationsTable1700000000006 } from './1700000000006-CreateNotificationsTable';
import { AlterParkingSpotArrays1700000000007 } from './1700000000007-AlterParkingSpotArrays';
import { BookingModulePhaseOne1700000000008 } from './1700000000008-BookingModulePhase1';

// Order matters: each migration's FK dependencies must already exist.
export const migrations = [
  EnablePostgis1700000000000,
  CreateUsersTable1700000000001,
  CreateParkingSpotsTable1700000000002,
  CreateBookingsTable1700000000003,
  CreatePaymentsTable1700000000004,
  CreateReviewsTable1700000000005,
  CreateNotificationsTable1700000000006,
  AlterParkingSpotArrays1700000000007,
  BookingModulePhaseOne1700000000008,
];