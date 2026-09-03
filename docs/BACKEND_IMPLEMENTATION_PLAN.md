# SpotOn — Backend Implementation Plan (NestJS + PostgreSQL)

Companion to `IMPLEMENTATION_PLAN.md` (Flutter frontend). This plan covers the backend that the
mock `MockRepository` will eventually be replaced with.

## 0. Stack

- **NestJS** (TypeScript)
- **PostgreSQL** + **PostGIS** extension (geospatial nearby-search)
- **TypeORM** (migrations, entities)
- **Redis** + **BullMQ** (stage 3 — background jobs)
- **class-validator / class-transformer** (DTO validation)
- **Passport + JWT** (auth)

---

## Stage 1 — Database Foundation

### 1.1 Project scaffold
- `nest new spoton-backend`
- Module skeleton: `AuthModule`, `UsersModule`, `SpotsModule`, `BookingsModule`, `PaymentsModule`, `ReviewsModule`, `NotificationsModule`
- `ConfigModule` with `.env` (DB creds, JWT secret)

### 1.2 Database connection & TypeORM setup
- `TypeOrmModule.forRootAsync` reading from `ConfigService`
- Migration-based workflow only (`synchronize: false` — never auto-sync in this project)

### 1.3 Enable PostGIS
- First migration: `CREATE EXTENSION IF NOT EXISTS postgis;`
- This must run before the `parking_spots` table migration since it uses a `geography` column

### 1.4 Entities + migrations (one migration per table, in this order to satisfy FK dependencies)
1. `users`
2. `parking_spots` (FK → users.id as hostId)
3. `bookings` (FK → parking_spots.id, users.id ×2 for renterId/hostId)
4. `payments` (FK → bookings.id)
5. `reviews` (FK → bookings.id, users.id ×2, parking_spots.id)
6. `notifications` (FK → users.id)

### 1.5 Seed script
- `seed.ts` using the same shape as the frontend's mock JSON, so early API responses are diff-able
  against what the Flutter team already built UI for

---

## Stage 2 — API, Auth & Business Logic

Split into sub-stages because auth must land before anything else can be guarded.

### 2.1 Auth foundation
- `POST /auth/register`, `POST /auth/login`
- Password hashing (`bcrypt`)
- JWT access token + `JwtAuthGuard`
- `RolesGuard` + `@Roles()` decorator for renter/host/both-gated endpoints

### 2.2 Users module
- `GET /users/me`, `PATCH /users/me`
- Rating/reviewCount are **derived fields**, recomputed on review creation — not directly PATCH-able

### 2.3 Spots module
- `POST /spots`, `PATCH /spots/:id`, `PATCH /spots/:id/status` (host only)
- `GET /spots/nearby?lat=&lng=&radiusKm=&vehicleType=&minPrice=&maxPrice=&amenities=`
  - Core query: `ST_DWithin(location, ST_MakePoint(:lng,:lat)::geography, :radiusMeters)` ordered by `ST_Distance`
- `GET /spots/:id`

### 2.4 Bookings module
- `POST /bookings` — **business logic**: reject if overlapping `[startTime, endTime]` exists for the
  same `spotId` with status in `(confirmed, ongoing)`
- `GET /bookings/mine` (renter), `GET /bookings/host` (host)
- `PATCH /bookings/:id/cancel`
- Write a focused unit test for the overlap-check logic here rather than waiting for stage 4 —
  it's the one piece of business logic that will silently break the product if it regresses

### 2.5 Payments module
- `POST /payments/:bookingId/slip` (renter uploads slip → `verificationStatus: pending_review`)
- `PATCH /payments/:id/verify` (host approves/rejects → `verified`/`rejected`, cascades booking
  status to `confirmed` or back to `pending_payment`)

### 2.6 Reviews module
- `POST /reviews` (only allowed if the referenced booking is `completed`)
- `GET /reviews/spot/:spotId`, `GET /reviews/user/:userId`
- On create: recompute the target's `rating`/`reviewCount` (transaction, so it can't drift)

### 2.7 Notifications module
- Internal service method `notify(userId, type, payload)` called from Bookings/Payments modules
- `GET /notifications`, `PATCH /notifications/:id/read`
- Stage 2 = synchronous DB write only; stage 3 moves dispatch to a queue

---

## Stage 3 — Redis, BullMQ, Dashboard

- Redis connection module
- Queues:
  - `notification-dispatch` — decouples notification creation from the request/response cycle
  - `payment-reminder` — delayed job that nudges a renter if `awaiting_slip` for >X minutes
  - `rating-recalc` — optional, if review volume ever makes synchronous recompute too slow
- **Bull Board** mounted at `/admin/queues` for visual job monitoring
- Cache layer on `GET /spots/nearby` (short TTL) — this is where the cache-stampede handling from
  [[easy-backend002]] directly applies; reuse the same stampede-guard pattern here

---

## Stage 4 — Testing

- **Unit tests**: services in isolation (mocked repositories) — priority order: booking overlap
  check, payment verification state machine, rating recompute
- **Integration/e2e tests**: `supertest` against a test database (docker-compose test profile),
  covering full request flows: register → login → create spot → book → pay → verify → review

---

## Stage 5 — CI/CD

Parked for now — revisit once stages 1–4 are stable.

---

## Backend Folder Structure

```
src/
  main.ts
  config/
    database.config.ts
    jwt.config.ts
  auth/
    auth.module.ts
    auth.controller.ts
    auth.service.ts
    guards/
      jwt-auth.guard.ts
      roles.guard.ts
    decorators/
      roles.decorator.ts
    dto/
      register.dto.ts
      login.dto.ts
  users/
    entities/user.entity.ts
    users.module.ts
    users.service.ts
    users.controller.ts
    dto/update-user.dto.ts
  spots/
    entities/parking-spot.entity.ts
    spots.module.ts
    spots.service.ts
    spots.controller.ts
    dto/
      create-spot.dto.ts
      update-spot.dto.ts
      nearby-query.dto.ts
  bookings/
    entities/booking.entity.ts
    bookings.module.ts
    bookings.service.ts        # overlap-check logic lives here
    bookings.controller.ts
    dto/create-booking.dto.ts
  payments/
    entities/payment.entity.ts
    payments.module.ts
    payments.service.ts
    payments.controller.ts
    dto/
      upload-slip.dto.ts
      verify-payment.dto.ts
  reviews/
    entities/review.entity.ts
    reviews.module.ts
    reviews.service.ts
    reviews.controller.ts
    dto/create-review.dto.ts
  notifications/
    entities/notification.entity.ts
    notifications.module.ts
    notifications.service.ts
    notifications.controller.ts
    processors/notification.processor.ts   # BullMQ consumer, stage 3
  queues/
    queue.module.ts             # stage 3 — Redis + BullMQ registration
  database/
    migrations/
    seed.ts
```

---

## Entities & Database Fields

### `users`
| Field | Type | Notes |
|---|---|---|
| id | uuid, PK | `uuid_generate_v4()` |
| name | varchar(255) | |
| email | varchar(255) | unique index |
| passwordHash | varchar(255) | never returned in any response DTO |
| phone | varchar(20) | |
| avatarUrl | varchar(500) | nullable |
| role | enum('renter','host','both') | |
| rating | numeric(2,1) | default 0, derived |
| reviewCount | int | default 0, derived |
| createdAt | timestamptz | |
| updatedAt | timestamptz | |

### `parking_spots`
| Field | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| hostId | uuid, FK → users.id | indexed |
| title | varchar(255) | |
| description | text | |
| address | varchar(500) | |
| location | geography(Point,4326) | GiST index for `ST_DWithin` |
| pricePerHour | numeric(10,2) | nullable |
| pricePerDay | numeric(10,2) | nullable |
| pricePerMonth | numeric(10,2) | nullable |
| images | jsonb | array of URLs |
| amenities | jsonb | array of strings |
| vehicleTypes | jsonb | array of strings (sedan/suv/motorcycle) |
| status | enum('active','inactive') | |
| rating | numeric(2,1) | default 0, derived |
| reviewCount | int | default 0, derived |
| createdAt / updatedAt | timestamptz | |

### `bookings`
| Field | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| spotId | uuid, FK → parking_spots.id | composite index with startTime/endTime |
| renterId | uuid, FK → users.id | |
| hostId | uuid, FK → users.id | denormalized for query convenience |
| rentalType | enum('hourly','daily','monthly') | |
| startTime | timestamptz | |
| endTime | timestamptz | |
| totalPrice | numeric(10,2) | |
| status | enum('pending_payment','confirmed','ongoing','completed','cancelled') | |
| paymentId | uuid, FK → payments.id | nullable |
| createdAt / updatedAt | timestamptz | |

### `payments`
| Field | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| bookingId | uuid, FK → bookings.id | unique |
| method | enum('promptpay') | |
| amount | numeric(10,2) | |
| slipImageUrl | varchar(500) | nullable |
| verificationStatus | enum('awaiting_slip','pending_review','verified','rejected') | |
| verifiedAt | timestamptz | nullable |
| verifiedBy | uuid, FK → users.id | nullable, the host who verified |
| createdAt / updatedAt | timestamptz | |

### `reviews`
| Field | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| bookingId | uuid, FK → bookings.id | |
| fromUserId | uuid, FK → users.id | |
| toUserId | uuid, FK → users.id | |
| spotId | uuid, FK → parking_spots.id | nullable (null when reviewing a user, not a spot) |
| rating | smallint | 1–5, check constraint |
| comment | text | |
| createdAt | timestamptz | |

### `notifications`
| Field | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| userId | uuid, FK → users.id | recipient, indexed |
| type | enum('slip_submitted','booking_approved','booking_cancelled','payment_rejected') | |
| payload | jsonb | e.g. `{ bookingId, spotTitle }` |
| isRead | boolean | default false |
| createdAt | timestamptz | |

---

## Key DTOs

```ts
// auth/dto/register.dto.ts
class RegisterDto {
  name: string;
  email: string;
  password: string;
  phone: string;
  role: 'renter' | 'host' | 'both';
}

// spots/dto/nearby-query.dto.ts
class NearbyQueryDto {
  lat: number;
  lng: number;
  radiusKm?: number = 5;
  vehicleType?: string;
  minPrice?: number;
  maxPrice?: number;
  amenities?: string[];
}

// bookings/dto/create-booking.dto.ts
class CreateBookingDto {
  spotId: string;
  rentalType: 'hourly' | 'daily' | 'monthly';
  startTime: string; // ISO
  endTime: string;   // ISO
}

// payments/dto/verify-payment.dto.ts
class VerifyPaymentDto {
  decision: 'verified' | 'rejected';
  reason?: string; // required if rejected
}

// reviews/dto/create-review.dto.ts
class CreateReviewDto {
  bookingId: string;
  toUserId: string;
  spotId?: string;
  rating: number; // 1-5
  comment?: string;
}
```

Response DTOs (`*ResponseDto`) should strip `passwordHash` and any internal-only fields before
leaving the service layer — use `class-transformer`'s `@Exclude()` on the entity or a dedicated
mapper, not manual `delete` calls scattered across controllers.
