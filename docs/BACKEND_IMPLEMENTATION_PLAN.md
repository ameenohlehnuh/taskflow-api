# SpotOn — Backend Implementation Plan (NestJS + PostgreSQL)

Companion to `IMPLEMENTATION_PLAN.md` (Flutter frontend). This plan covers the backend that the
mock `MockRepository` will eventually be replaced with.

> **Contract note:** The Booking & Payment flow is specified in
> [`booking_module_api_contract.md`](booking_module_api_contract.md), which supersedes
> the older Stage-2 route sketches below wherever they differ. The frontend integration
> view of the same contract lives in
> [`booking_frontend_integration_guide.md`](booking_frontend_integration_guide.md).

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
> **Superseded by `booking_module_api_contract.md`** — that document is the source of
> truth for routes, payloads, and the error envelope. Summary below.

- `GET /spots/:spotId/availability` — public; returns availability + server-computed
  price quote with `expiresAt` (short-lived, advisory)
- `POST /bookings` — JWT; requires `Idempotency-Key` header (UUID v4). Server-side
  pricing (`unitRate`, `subtotal`, `serviceFee`, `totalPrice`), `quoteId` re-validation,
  and a **transactional overlap check** against bookings with status in
  `(CONFIRMED, ONGOING, PENDING_PAYMENT, PAYMENT_SUBMITTED)` before insert
- `GET /bookings` (renter, filters + pagination), `GET /bookings/:id` (renter or owning
  host only), `GET /hosts/me/bookings` (host)
- `POST /bookings/:id/cancel` — server-side cancellation policy snapshot; refund
  eligibility computed server-side
- `POST /bookings/:id/refund-requests` — creates a `PENDING` refund request
- **State machine** (uppercase enums): `PENDING_PAYMENT → PAYMENT_SUBMITTED →
  CONFIRMED → ONGOING → COMPLETED`, with `CANCELLED_BY_USER`, `CANCELLED_BY_HOST`,
  `REJECTED_BY_HOST`, `EXPIRED`, `REFUNDED` branches. Illegal transitions → `409
  INVALID_STATUS_TRANSITION`; every transition writes an immutable
  `booking_status_history` row (actor id, actor type, old/new status, reason)
- Write a focused unit test for the overlap-check logic here rather than waiting for
  stage 4 — it's the one piece of business logic that will silently break the product
  if it regresses

### 2.5 Payments module (S3 presigned slip flow)
> Supersedes the old `POST /payments/:bookingId/slip` / `PATCH /payments/:id/verify`
> design. Slips are uploaded **directly to S3/MinIO** with presigned URLs; the API
> never streams image bytes.

- `POST /bookings/:id/payment-slip/upload-url` — renter requests a presigned PUT URL
  (5-min expiry, ≤10 MB, `image/jpeg|png|application/pdf`); backend stores an object
  key, never a client URL
- `POST /bookings/:id/payment` — renter submits `amount` (must equal booking total →
  `422 PAYMENT_AMOUNT_MISMATCH`), `currency`, `slipObjectKey`; creates the payment
  (`PENDING_REVIEW`) and transitions the booking to `PAYMENT_SUBMITTED`; rejects
  duplicate submissions unless resubmission is allowed
- `GET /hosts/me/bookings/:id/payment-slip` — host-only; authorizes against spot
  ownership and returns a short-lived presigned GET URL
- `POST /hosts/me/bookings/:id/confirm` — atomic: payment → `VERIFIED`, booking →
  `CONFIRMED`, status history row
- `POST /hosts/me/bookings/:id/reject` — payment → `REJECTED` with `reasonCode` +
  `allowResubmission` flag; booking → `REJECTED_BY_HOST`
- Local dev uses MinIO (`quay.io/minio/*`, bucket `payment-slips`) via the `S3Module`
  provider; `AWS_S3_FORCE_PATH_STYLE=true`

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
    entities/booking-status-history.entity.ts
    entities/refund-request.entity.ts
    bookings.module.ts
    bookings.service.ts        # overlap-check + idempotency + state machine
    bookings.controller.ts
    dto/booking.dto.ts         # availability, create, payment, cancel, refund, reject
  payments/
    entities/payment.entity.ts
    payments.module.ts
    payments.service.ts        # presigned URLs, amount validation, host confirm/reject
    payments.controller.ts
  common/
    filters/global-exception.filter.ts   # contract §9 error envelope
    s3/s3.module.ts                      # S3Client provider (MinIO/AWS)
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
| currency | varchar(3) | default 'THB' |
| unitRate | numeric(10,2) | nullable, server-computed |
| subtotal | numeric(10,2) | nullable, server-computed |
| serviceFee | numeric(10,2) | default 0 |
| totalPrice | numeric(10,2) | server-computed |
| status | enum — UPPERCASE: `PENDING_PAYMENT`, `PAYMENT_SUBMITTED`, `CONFIRMED`, `ONGOING`, `COMPLETED`, `CANCELLED_BY_USER`, `CANCELLED_BY_HOST`, `REJECTED_BY_HOST`, `EXPIRED`, `REFUNDED` | see contract §8 state machine |
| vehicleDetails | jsonb | `{ type, plateNumber, color? }` |
| notes | text | nullable |
| idempotencyKey | uuid | unique index; from `Idempotency-Key` header |
| paymentId | uuid, FK → payments.id | nullable |
| createdAt / updatedAt | timestamptz | |

Additional tables (migration `1700000000008`):
- `booking_status_history` — `id`, `bookingId` (FK, cascade), `status`, `previousStatus`, `actorId`, `actorType` (`RENTER|HOST|SYSTEM`), `reason`, `createdAt`
- `refund_requests` — `id`, `bookingId` (FK, cascade), `requestedAmount`, `currency`, `reason`, `status` (`PENDING|APPROVED|REJECTED|PROCESSED`), `createdAt`, `updatedAt`

### `payments`
| Field | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| bookingId | uuid, FK → bookings.id | unique |
| method | enum('promptpay') | |
| amount | numeric(10,2) | |
| slipImageUrl | varchar(500) | nullable — **legacy column**, superseded by `slipObjectKey` |
| slipObjectKey | varchar(500) | nullable — S3/MinIO object key (contract-canonical reference) |
| verificationStatus | enum('awaiting_slip','pending_review','verified','rejected') | |
| rejectionReason | text | nullable — set on host reject |
| allowResubmission | boolean | default false — set on host reject |
| verifiedAt | timestamptz | nullable |
| verifiedBy | uuid, FK → users.id | nullable, the host who verified |
| createdAt / updatedAt | timestamptz | |

> **Pending migration:** `slipObjectKey`, `rejectionReason`, and `allowResubmission`
> are contract-required but not yet in the schema — add them in the Phase 2 migration.

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

// bookings/dto/booking.dto.ts (Phase 1 delivered)
class AvailabilityQueryDto {
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  rentalType: 'hourly' | 'daily' | 'monthly';
  vehicleType?: string;
}

class CreateBookingDto {
  spotId: string;          // uuid
  startTime: string;       // ISO
  endTime: string;         // ISO
  rentalType: 'hourly' | 'daily' | 'monthly';
  vehicleDetails?: { type: string; plateNumber: string; color?: string };
  notes?: string;
  quoteId?: string;        // binds to a recent server quote
}

class PaymentSubmissionDto {
  method: 'PROMPTPAY';
  amount: string;          // decimal string, must equal booking total
  currency: 'THB';
  slipObjectKey: string;   // from the presigned upload flow
  clientReference?: string;
}

class UploadUrlDto {
  fileName: string;
  contentType: 'image/jpeg' | 'image/png' | 'application/pdf';
  sizeBytes: number;       // ≤ 10 MB
}

class HostRejectDto {
  reasonCode: 'AMOUNT_MISMATCH' | 'SLIP_UNREADABLE' | 'SPOT_UNAVAILABLE' | 'OTHER';
  reason: string;
  allowResubmission?: boolean;
}

// payments/dto/verify-payment.dto.ts — REMOVED, superseded by HostRejectDto +
// the confirm endpoint (no body beyond an optional note)

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
