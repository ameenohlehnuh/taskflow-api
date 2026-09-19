# Spots Module — Technical Documentation

> **Audience:** Developers & project maintainers
> **Base Path:** `/api/v1`
> **Status:** Implemented and verified end-to-end against the running Docker stack.
> **Companion doc:** [auth_module_summary.md](auth_module_summary.md) (JWT/Redis authentication)

---

## 1. Overview & Architecture

| Component | Technology |
|---|---|
| Framework | NestJS (TypeScript) |
| ORM | TypeORM (`QueryBuilder` for spatial/raw SQL) |
| Database | PostgreSQL 16 + PostGIS 3.4 (`postgis/postgis:16-3.4-alpine`) |
| Coordinate System | **SRID 4326** (WGS 84) |

### Spatial Design

The `location` column is declared as `geography(Point, 4326)` rather than `geometry`.
This is deliberate:

- Distance/area calculations on `geography` return **meters** (spheroidal math), which
  matches the `radiusKm` parameter of the nearby-search endpoint directly.
- Casting `geometry → geography` at query time (`ST_MakePoint(...)::geography`) lets
  coordinates enter as plain lon/lat pairs and participate in meter-based `ST_DWithin` /
  `ST_Distance` without any client-side conversion.
- PostGIS silently promotes `geography` operands in these functions — the GiST index on
  the column still serves the bounding-box prefilter for `ST_DWithin`.

### Module Wiring

```
SpotsModule
 ├─ TypeOrmModule.forFeature([ParkingSpot, Review, User])
 ├─ SpotsController   (public + JwtAuthGuard-protected routes)
 └─ SpotsService      (QueryBuilder queries, ownership checks, PostGIS writes)
```

---

## 2. Database Schema & Entity Specifications

### `parking_spots` Table

| Column | PostgreSQL Type | Entity Field | Nullable | Default | Notes |
|---|---|---|---|---|---|
| `id` | `uuid` (PK) | `id` | NO | `uuid_generate_v4()` | |
| `host_id` | `uuid` → `users.id` | `hostId` | NO | — | `ON DELETE CASCADE` |
| `title` | `varchar(255)` | `title` | NO | — | |
| `description` | `text` | `description` | NO | — | |
| `address` | `varchar(500)` | `address` | NO | — | |
| `location` | `geography(Point,4326)` | `location` | NO | — | GiST indexed; serialized as GeoJSON in responses |
| `price_per_hour` | `numeric(10,2)` | `pricePerHour` | **YES** | — | Hourly rate |
| `price_per_day` | `numeric(10,2)` | `pricePerDay` | **YES** | — | Daily rate |
| `price_per_month` | `numeric(10,2)` | `pricePerMonth` | **YES** | — | Monthly rate |
| `images` | `jsonb` | `images` | NO | `'[]'` | Array of image URLs |
| `amenities` | **`text[]`** | `amenities` | NO | `'{}'` | e.g. `["CCTV","Covered"]` |
| `vehicle_types` | **`text[]`** | `vehicleTypes` | NO | `'{}'` | e.g. `["sedan","suv"]` |
| `status` | enum `parking_spots_status_enum` | `status` | NO | `'active'` | `active` \| `inactive` |
| `rating` | `numeric(2,1)` | `rating` | NO | `'0'` | Derived (recomputed on review create) |
| `review_count` | `integer` | `reviewCount` | NO | `0` | Derived |
| `created_at` | `timestamp` | `createdAt` | NO | `now()` | |
| `updated_at` | `timestamp` | `updatedAt` | NO | `now()` | |

> **Type note:** `amenities` and `vehicle_types` were migrated from `jsonb` → `text[]`
> in migration `1700000000007-AlterParkingSpotArrays` to match the frontend contract.
> The conversion required **dropping the jsonb defaults first** (PostgreSQL cannot cast a
> `'[]'::jsonb` default to `text[]` automatically — see §4.3).

### GiST Spatial Index

```sql
CREATE INDEX "IDX_parking_spots_location"
  ON "parking_spots"
  USING GIST ("location");
```

- Declared in the entity as `@Index({ spatial: true })` on `location`.
- Serves `ST_DWithin` bounding-box prefiltering so radius queries don't scan the table.
- Confirmed present in the live database via `pg_indexes`.

---

## 3. API Contracts & Endpoints

| # | Endpoint | Method | Guard | Description |
|---|---|---|---|---|
| 1 | `/api/v1/spots` | `GET` | Public | Paginated search: text search (`q`), price range, vehicle type, array-overlap amenities, rental-type presence, and spatial sorting |
| 2 | `/api/v1/spots/nearby` | `GET` | Public | Radius search via `ST_DWithin` |
| 3 | `/api/v1/spots/:id` | `GET` | Public | Detail view with embedded `hostInfo` |
| 4 | `/api/v1/spots/:spotId/reviews` | `GET` | Public | All reviews for a spot |
| 5 | `/api/v1/hosts/me/spots` | `GET` | `JwtAuthGuard` | Spots owned by the authenticated host |
| 6 | `/api/v1/spots` | `POST` | `JwtAuthGuard` | Create spot (PostGIS point built from `lat`/`lng`) |
| 7 | `/api/v1/spots/:id` | `PATCH` | `JwtAuthGuard` | Owner-only update; recomputes location if coords change |
| 8 | `/api/v1/spots/:id/status` | `PATCH` | `JwtAuthGuard` | Owner-only status toggle (`active`/`inactive`) |

### 3.1 `GET /api/v1/spots` — Query Parameters

| Param | Type | Default | Notes |
|---|---|---|---|
| `q` | string | — | Case-insensitive `ILIKE` on `title`, `description`, `address` |
| `vehicleType` | string | — | `:v = ANY(vehicle_types)` |
| `rentalType` | `hourly\|daily\|monthly` | — | Requires the mapped price column to be `NOT NULL` |
| `minPrice` / `maxPrice` | number | — | Range across all three price columns (`OR`) |
| `amenities` | comma-separated string | — | Parsed to array; `amenities && :array` (overlap) |
| `sort` | `nearby\|price_asc\|price_desc\|rating` | — | `nearby` requires `lat`+`lng`; falls back to `created_at DESC` |
| `lat`, `lng` | number | — | Used only when `sort=nearby` |
| `page` / `limit` | number | `1` / `20` | `limit` capped at 100 |

**Response shape:**

```json
{ "items": [ ... ], "total": 2, "page": 1, "limit": 20 }
```

**Price sort semantics:** ordering uses
`COALESCE(price_per_hour, price_per_day, price_per_month)` — the first non-null price
in hourly → daily → monthly priority.

### 3.2 `GET /api/v1/spots/nearby`

| Param | Type | Default | Constraint |
|---|---|---|---|
| `lat` | number | required | `-90..90` |
| `lng` | number | required | `-180..180` |
| `radiusKm` | number | `5` | max 500 |
| `limit` | number | `20` | max 100 |

```sql
ST_DWithin(location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :radiusMeters)
ORDER BY ST_Distance(location, ...) ASC
```

### 3.3 Spot Response Shape (all read endpoints)

```json
{
  "id": "uuid", "hostId": "uuid",
  "title": "...", "description": "...", "address": "...",
  "location": { "type": "Point", "coordinates": [lng, lat] },
  "pricePerHour": "50.00", "pricePerDay": "350.00", "pricePerMonth": "4500.00",
  "images": ["url"], "amenities": ["CCTV"], "vehicleTypes": ["sedan"],
  "status": "active", "rating": "4.9", "reviewCount": 15,
  "createdAt": "ISO-8601",
  "hostInfo": { "id": "uuid", "name": "...", "avatarUrl": "...", "rating": "4.8", "reviewCount": 12 }
}
```

`hostInfo` is only populated on endpoints that join the host relation (`nearby`,
`detail`, `create`, `update`); list endpoints may omit it for the authenticated owner.

### 3.4 `POST /api/v1/spots` — Body

```json
{
  "title": "string (3-255)",
  "description": "string (10-2000)",
  "address": "string (5-500)",
  "lat": 13.73, "lng": 100.56,
  "pricePerHour": 45.5,      // optional
  "pricePerDay": 280,        // optional
  "pricePerMonth": 3800,     // optional
  "amenities": ["cctv"],     // required, max 20
  "vehicleTypes": ["sedan"], // required, max 10
  "images": ["https://..."]  // optional, valid URLs, max 10
}
```

New spots are created with `status = 'active'`, `rating = 0`, `reviewCount = 0`.

### 3.5 `PATCH /api/v1/spots/:id/status` — Body

```json
{ "status": "active" | "inactive" }
```

### 3.6 Error Semantics

| Code | Condition |
|---|---|
| `400` | Validation failure (DTO constraints, bad UUID params) |
| `401` | Missing/invalid Bearer token on guarded routes |
| `403` | Authenticated user is not the spot's owner (`PATCH` routes) |
| `404` | Spot not found |

---

## 4. Technical Innovations & Bug Fixes

### 4.1 TypeORM Raw SQL Alias Handling

**Problem.** Passing raw SQL expressions directly to `.orderBy()` crashes TypeORM:

```
TypeORMError: "ST_Distance(spot" alias was not found. Maybe you forgot to join it?
```

TypeORM's `orderBy` parser splits the expression at the **first comma** and treats
everything before it as a relation alias. `ST_Distance(spot.location, ST_MakePoint(...))`
was therefore read as alias `"ST_Distance(spot"`. The same failure occurred for
`COALESCE(price_per_hour, ...)`.

**Fix.** Compute the expression in the SELECT list under a simple alias, then order by
that alias:

```ts
qb.addSelect(
  'ST_Distance(spot.location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography)',
  'distance',
).setParameters({ lng, lat });

// nearby sort:
qb.orderBy('distance', 'ASC');

// price sort:
qb.addSelect(
  'COALESCE(spot.price_per_hour, spot.price_per_day, spot.price_per_month)',
  'effective_price',
).orderBy('effective_price', 'ASC');
```

### 4.2 PostGIS Point Insertion Strategy

**Problem.** `location` is `NOT NULL` with no default. A standard
`repository.save(entity)` omitted the column from the INSERT entirely, producing:

```
QueryFailedError: null value in column "location" of relation "parking_spots"
violates not-null constraint
```

**Fix.** Insert through the QueryBuilder so the PostGIS expression can be inlined
into the INSERT statement as a raw function call:

```ts
const saved = await this.spotsRepository
  .createQueryBuilder()
  .insert()
  .into(ParkingSpot)
  .values({
    hostId,
    title: dto.title,
    // ...other fields
    location: () =>
      `ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)::geography`,
  })
  .returning('*')
  .execute();

return this.findOne(saved.generatedMaps[0].id as string);
```

> **Security note:** `lat`/`lng` are interpolated rather than parameter-bound because
> TypeORM's raw-expression values don't bind in this position. This is safe here because
> both values must pass `@IsLatitude()` / `@IsLongitude()` validation before reaching the
> service. If those validators are ever relaxed, switch to parameter binding.

`PATCH` updates reuse the same expression through a follow-up `UPDATE` when either
coordinate changes.

### 4.3 `jsonb` → `text[]` Migration Default Handling

Altering a column type while a `jsonb` default exists fails in PostgreSQL:

```
default for column "amenities" cannot be cast automatically to type text[]
```

The migration therefore runs `DROP DEFAULT` → `ALTER TYPE ... USING` → `SET DEFAULT '{}'`
for both columns, and `down()` restores `jsonb` via `to_jsonb(...)`.
(Applied as `1700000000007-AlterParkingSpotArrays`.)

---

## 5. Verification & Testing Results

All cases executed live against the Docker stack (`docker compose exec backend1`):

| # | Test Case | Expected | Result |
|---|---|---|---|
| 1 | `GET /spots` (default sort) | 200, paginated `{items,total,page,limit}` | ✅ Pass |
| 2 | `GET /spots?lat&lng&sort=nearby` | 200, ordered by distance | ✅ Pass |
| 3 | `GET /spots?vehicleType=suv&amenities=CCTV` | 200, array filters applied | ✅ Pass |
| 4 | `GET /spots?rentalType=hourly&minPrice=45&sort=price_asc` | 200, price ordering | ✅ Pass |
| 5 | `GET /spots?q=Asoke` | 200, text search matched | ✅ Pass |
| 6 | `GET /spots/nearby?radiusKm=3` | 200, `ST_DWithin` results | ✅ Pass |
| 7 | `GET /spots/nearby?radiusKm=0.1` | Empty array (out of range) | ✅ Pass |
| 8 | `GET /spots/:id` | 200 with `hostInfo` | ✅ Pass |
| 9 | `GET /spots/:id` (unknown UUID) | 404 `Spot not found` | ✅ Pass |
| 10 | `GET /spots/:spotId/reviews` | 200 (empty for seed w/o spot reviews) | ✅ Pass |
| 11 | `POST /spots` (Bearer) | 201, `POINT(100.56 13.73)` stored | ✅ Pass |
| 12 | `GET /hosts/me/spots` | 200, owner-filtered list | ✅ Pass |
| 13 | `PATCH /spots/:id` (owner) | 200, title updated | ✅ Pass |
| 14 | `PATCH /spots/:id` (non-owner) | 403 Forbidden | ✅ Pass |
| 15 | `PATCH /spots/:id/status` (owner) | 200, status toggled | ✅ Pass |
| 16 | Inactive spot excluded from public list | Absent from `GET /spots` | ✅ Pass |
| 17 | PostGIS storage integrity | `ST_AsText` = `POINT(100.56 13.73)` | ✅ Pass |

**Database state after tests:** migration `1700000000007` recorded in `migrations`;
both array columns confirmed as `ARRAY/_text` with `'{}'::text[]` defaults.
