# Spots Module — Implementation Plan

## Goal

Implement the complete Spots Module (public search + host management) aligned with the
Flutter frontend contract and the `parking_spots` schema (PostGIS `geography(Point,4326)`,
`text[]` arrays for `amenities` / `vehicle_types`).

## Files

```
src/spots/
  spots.module.ts
  spots.controller.ts
  spots.service.ts
  dto/
    filter-spots.dto.ts
    nearby-spots-query.dto.ts
    create-spot.dto.ts
    update-spot.dto.ts        (extends CreateSpotDto with PartialType)
    update-spot-status.dto.ts
```

## Endpoints

| Route | Method | Guard | Notes |
|---|---|---|---|
| `/api/v1/spots` | GET | Public | Filter + sort + paginate; `sort=nearby` uses `ST_Distance` |
| `/api/v1/spots/nearby` | GET | Public | `ST_DWithin` radius search (GiST index) |
| `/api/v1/spots/:id` | GET | Public | Includes `hostInfo` summary |
| `/api/v1/spots/:spotId/reviews` | GET | Public | Reviews via `Review` repo |
| `/api/v1/hosts/me/spots` | GET | JwtAuthGuard | Spots owned by `req.user.sub` |
| `/api/v1/spots` | POST | JwtAuthGuard | Create; builds PostGIS point from `lat`/`lng` |
| `/api/v1/spots/:id` | PATCH | JwtAuthGuard | Owner-only; recomputes location if lat/lng change |
| `/api/v1/spots/:id/status` | PATCH | JwtAuthGuard | Owner-only; toggle active/inactive |

## Query Design

- **Filtering:** `QueryBuilder` on `parking_spots`, always `status = 'active'` for public routes.
- **Amenities:** `amenities && :...` (PostgreSQL array overlap `&&`).
- **Vehicle type:** `:vehicleType = ANY(vehicle_types)`.
- **Nearby sort:** `ORDER BY ST_Distance(location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography) ASC`.
- **Radius search:** `ST_DWithin(location, point::geography, :radiusMeters)` — uses the existing GiST index.
- **Rental type → price column mapping:** `hourly → price_per_hour`, `daily → price_per_day`, `monthly → price_per_month`; filter requires that column to be `NOT NULL`.
- **Pagination:** `skip/take` + `getManyAndCount()` → `{ items, total, page, limit }`.
- **Search (`q`):** case-insensitive match on `title` / `description` / `address` via `ILIKE`.

## Ownership & Errors

- `PATCH` routes load the spot, compare `hostId` with the JWT `sub`, and throw
  `ForbiddenException` (403) when it doesn't match, `NotFoundException` (404) when missing.
- `GET /spots/:id` throws `NotFoundException` when missing.

## Location Handling

- `CreateSpotDto` / `UpdateSpotDto` accept `lat` + `lng` (validated ranges).
- Service converts to `geography` via raw SQL:
  `ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography`.
- On update, location is only recomputed when either coordinate is present.

## Response Mapping

`toResponseDto` strips the `host` relation into a `hostInfo` summary
(`id`, `name`, `avatarUrl`, `rating`, `reviewCount`) and never exposes internal fields.

## Validation Steps

1. `docker compose up -d --build backend1`
2. `docker compose exec backend1 npm run migration:run` (idempotent — 1700000000007 already applied)
3. Seed: `docker compose run --rm backend1 npm run seed`
4. In-container curl checks (see README section in PR / final report):
   - `GET /api/v1/spots?sort=rating`
   - `GET /api/v1/spots?lat=13.74&lng=100.53&sort=nearby`
   - `GET /api/v1/spots/nearby?lat=13.7466&lng=100.5349&radiusKm=5`
   - `GET /api/v1/spots/:id` (hostInfo present)
   - `POST /api/v1/spots` with Bearer token → 201
   - `PATCH /api/v1/spots/:id` as non-owner → 403
   - `PATCH /api/v1/spots/:id/status` → 200
