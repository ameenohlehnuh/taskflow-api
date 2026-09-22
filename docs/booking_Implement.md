# Booking Module API Contract

**Base path:** `/api/v1`

**Audience:** NestJS backend and Flutter client teams

**Status:** Proposed contract for implementation

## 1. Design Decisions

- All timestamps are ISO 8601 strings with an explicit offset or `Z`. The backend stores and compares instants in UTC. The API may return a `timezone` field for display purposes.
- The backend is the source of truth for availability, duration, pricing, conflicts, payment state, and status transitions. The client may show estimates, but must not finalize totals locally.
- Booking creation must be idempotent. Clients send an `Idempotency-Key` UUID on every create request. Repeating the same key returns the original result rather than creating a second booking.
- Availability is advisory. The backend must re-check availability transactionally during booking creation to prevent race conditions between the availability request and `POST /bookings`.
- Money is returned as decimal strings to avoid floating-point loss. The currency is currently `THB`.
- IDs are UUID strings.
- Protected endpoints require `Authorization: Bearer <accessToken>`.

## 2. Endpoint List

| Method | Path | Auth | Summary |
|---|---|---:|---|
| `GET` | `/api/v1/spots/:spotId/availability` | Public | Check a spot's availability and calculate the current price quote. |
| `POST` | `/api/v1/bookings` | JWT | Create a pending booking after an atomic availability and price re-check. |
| `GET` | `/api/v1/bookings` | JWT | List the authenticated renter's bookings with filters and pagination. |
| `GET` | `/api/v1/bookings/:id` | JWT | Get booking detail; renter or owning host only. |
| `POST` | `/api/v1/bookings/:id/cancel` | JWT | Cancel a cancellable booking. |
| `POST` | `/api/v1/bookings/:id/refund-requests` | JWT | Request a refund for an eligible booking. |
| `POST` | `/api/v1/bookings/:id/payment-slip/upload-url` | JWT | Request an S3 presigned upload URL. |
| `POST` | `/api/v1/bookings/:id/payment` | JWT | Submit payment and the uploaded slip key. |
| `GET` | `/api/v1/hosts/me/bookings` | JWT host | List booking requests for the authenticated host. |
| `GET` | `/api/v1/hosts/me/bookings/:id/payment-slip` | JWT host | Get a short-lived slip download URL and payment details. |
| `POST` | `/api/v1/hosts/me/bookings/:id/confirm` | JWT host | Approve a submitted payment and confirm the booking. |
| `POST` | `/api/v1/hosts/me/bookings/:id/reject` | JWT host | Reject a payment or booking request with a reason. |

## 3. Availability and Price Quote

### `GET /api/v1/spots/:spotId/availability`

Query parameters:

| Parameter | Type | Required | Notes |
|---|---|---:|---|
| `startTime` | ISO 8601 string | Yes | Must be before `endTime`. |
| `endTime` | ISO 8601 string | Yes | Must be after `startTime`. |
| `rentalType` | `hourly\|daily\|monthly` | Yes | Must match an available spot rate. |
| `vehicleType` | string | No | Used when the spot restricts vehicle types. |

Example:

```http
GET /api/v1/spots/spot-uuid/availability?startTime=2026-09-22T09:00:00Z&endTime=2026-09-22T13:00:00Z&rentalType=hourly
```

Response `200 OK`:

```json
{
  "spotId": "spot-uuid",
  "available": true,
  "requestedWindow": {
    "startTime": "2026-09-22T09:00:00Z",
    "endTime": "2026-09-22T13:00:00Z",
    "timezone": "Asia/Bangkok"
  },
  "quote": {
    "currency": "THB",
    "rentalType": "hourly",
    "units": 4,
    "unitRate": "50.00",
    "subtotal": "200.00",
    "discount": "0.00",
    "serviceFee": "0.00",
    "total": "200.00",
    "expiresAt": "2026-09-22T08:10:00Z"
  },
  "conflicts": []
}
```

Unavailable response is still `200 OK` because the request was valid:

```json
{
  "spotId": "spot-uuid",
  "available": false,
  "requestedWindow": {
    "startTime": "2026-09-22T09:00:00Z",
    "endTime": "2026-09-22T13:00:00Z",
    "timezone": "Asia/Bangkok"
  },
  "quote": null,
  "conflicts": [
    {
      "bookingId": "booking-uuid",
      "startTime": "2026-09-22T11:00:00Z",
      "endTime": "2026-09-22T14:00:00Z",
      "status": "CONFIRMED"
    }
  ]
}
```

The quote must be calculated by the backend. The client may display a local preview while editing, but it must use the server quote before enabling final submission.

## 4. Create Booking

### `POST /api/v1/bookings`

Headers:

```http
Authorization: Bearer <accessToken>
Idempotency-Key: 2f2d4c3d-2de3-4d7d-a3dc-3f50ecf3a0ef
Content-Type: application/json
```

Request body:

```json
{
  "spotId": "spot-uuid",
  "startTime": "2026-09-22T09:00:00Z",
  "endTime": "2026-09-22T13:00:00Z",
  "rentalType": "hourly",
  "vehicleDetails": {
    "type": "sedan",
    "plateNumber": "กข-1234",
    "color": "white"
  },
  "notes": "Please leave the access card at the entrance.",
  "quoteId": "quote-uuid"
}
```

Rules:

- `renterId` comes from the JWT and must not be accepted from the body.
- `totalPrice`, `unitRate`, `duration`, `hostId`, and `status` are server-generated.
- `quoteId` binds creation to a recent server quote; the backend must recalculate and reject an expired or mismatched quote.
- The backend performs a transactional overlap check before inserting.

Response `201 Created`:

```json
{
  "id": "booking-uuid",
  "spotId": "spot-uuid",
  "renterId": "user-uuid",
  "hostId": "host-uuid",
  "status": "PENDING_PAYMENT",
  "startTime": "2026-09-22T09:00:00Z",
  "endTime": "2026-09-22T13:00:00Z",
  "rentalType": "hourly",
  "duration": 4,
  "currency": "THB",
  "unitRate": "50.00",
  "subtotal": "200.00",
  "serviceFee": "0.00",
  "totalPrice": "200.00",
  "vehicleDetails": {
    "type": "sedan",
    "plateNumber": "กข-1234",
    "color": "white"
  },
  "notes": "Please leave the access card at the entrance.",
  "payment": null,
  "spot": {
    "id": "spot-uuid",
    "title": "Central Plaza Lot",
    "address": "123 Main Road",
    "images": ["https://cdn.example.com/spots/spot-uuid/main.jpg"]
  },
  "host": {
    "id": "host-uuid",
    "name": "Host Name",
    "phone": "+66800000000",
    "avatarUrl": null
  },
  "createdAt": "2026-09-22T08:01:00Z",
  "updatedAt": "2026-09-22T08:01:00Z"
}
```

## 5. Payment and Slip Upload

### Recommendation: Option B, S3 presigned upload

Use a presigned URL rather than streaming the image through NestJS:

- Reduces API server memory and bandwidth pressure.
- Gives Flutter upload progress and retry control.
- Keeps S3 credentials out of the app.
- Lets NestJS validate file type, size, ownership, and upload expiry before issuing the URL.
- The backend stores an object key, not an arbitrary client-supplied URL.

Allowed types should be `image/jpeg`, `image/png`, and optionally `application/pdf`; recommend a 10 MB limit for images. The presigned URL should expire in 5 minutes, and the final payment submission should verify that the key belongs to the booking and was uploaded to the expected bucket/prefix.

### `POST /api/v1/bookings/:id/payment-slip/upload-url`

Request:

```json
{
  "fileName": "promptpay-slip.jpg",
  "contentType": "image/jpeg",
  "sizeBytes": 842341
}
```

Response `201 Created`:

```json
{
  "uploadUrl": "https://s3.example.com/presigned-put-url",
  "objectKey": "payment-slips/booking-uuid/upload-uuid.jpg",
  "expiresAt": "2026-09-22T08:15:00Z",
  "requiredHeaders": {
    "Content-Type": "image/jpeg"
  }
}
```

The client uploads the bytes directly to `uploadUrl` using the required headers. It then submits the `objectKey` to the payment endpoint.

### `POST /api/v1/bookings/:id/payment`

Request:

```json
{
  "method": "PROMPTPAY",
  "amount": "200.00",
  "currency": "THB",
  "slipObjectKey": "payment-slips/booking-uuid/upload-uuid.jpg",
  "clientReference": "optional-client-reference"
}
```

Response `201 Created`:

```json
{
  "id": "payment-uuid",
  "bookingId": "booking-uuid",
  "method": "PROMPTPAY",
  "amount": "200.00",
  "currency": "THB",
  "slipObjectKey": "payment-slips/booking-uuid/upload-uuid.jpg",
  "verificationStatus": "PENDING_REVIEW",
  "submittedAt": "2026-09-22T08:12:00Z"
}
```

Submitting payment changes the booking from `PENDING_PAYMENT` to `PAYMENT_SUBMITTED`. The server must reject an amount that differs from the booking total and must prevent duplicate payment submissions for the same booking unless explicitly allowed by a resubmission policy.

## 6. Renter Booking Management

### `GET /api/v1/bookings`

Query parameters:

| Parameter | Type | Default | Notes |
|---|---|---:|---|
| `status` | enum or comma-separated enums | — | `ACTIVE`, `PENDING_PAYMENT`, `PAYMENT_SUBMITTED`, `CONFIRMED`, `ONGOING`, `COMPLETED`, `CANCELLED_BY_USER`, `CANCELLED_BY_HOST`, `REJECTED_BY_HOST`, `REFUNDED`. |
| `from` / `to` | ISO 8601 | — | Filter by start time. |
| `page` | integer | `1` | Minimum 1. |
| `limit` | integer | `20` | Maximum 100. |
| `sort` | `created_desc\|start_asc\|start_desc` | `created_desc` | Stable ordering required. |

Response `200 OK`:

```json
{
  "items": [
    { "id": "booking-uuid", "status": "CONFIRMED", "spot": { "id": "spot-uuid", "title": "Central Plaza Lot" }, "startTime": "2026-09-22T09:00:00Z", "endTime": "2026-09-22T13:00:00Z", "totalPrice": "200.00", "currency": "THB", "paymentStatus": "VERIFIED" }
  ],
  "total": 1,
  "page": 1,
  "limit": 20,
  "hasNextPage": false
}
```

### `GET /api/v1/bookings/:id`

The detail response should include:

- Booking times, duration, pricing breakdown, currency, and status history.
- Spot title, address, coordinates, images, and vehicle restrictions.
- Host display name, masked/direct contact according to policy, and avatar.
- Payment method, amount, slip verification status, and rejection reason if any.
- Cancellation policy and calculated refund eligibility.
- QR/check-in information only after confirmation, preferably as a short-lived signed token or QR payload.

Example additional fields:

```json
{
  "statusHistory": [
    { "status": "PENDING_PAYMENT", "at": "2026-09-22T08:01:00Z", "actorType": "RENTER" },
    { "status": "CONFIRMED", "at": "2026-09-22T08:20:00Z", "actorType": "HOST" }
  ],
  "cancellationPolicy": {
    "summary": "Full refund before 24 hours before start",
    "canCancel": true,
    "refundAmount": "200.00",
    "currency": "THB"
  },
  "checkIn": {
    "available": true,
    "qrToken": "short-lived-signed-token",
    "validFrom": "2026-09-22T08:45:00Z",
    "validUntil": "2026-09-22T13:15:00Z"
  }
}
```

### `POST /api/v1/bookings/:id/cancel`

Request:

```json
{
  "reason": "Plans changed"
}
```

Response `200 OK`:

```json
{
  "bookingId": "booking-uuid",
  "status": "CANCELLED_BY_USER",
  "refund": {
    "eligible": true,
    "amount": "200.00",
    "currency": "THB",
    "status": "PENDING"
  },
  "cancelledAt": "2026-09-22T09:00:00Z"
}
```

### `POST /api/v1/bookings/:id/refund-requests`

Request:

```json
{
  "reason": "Host could not provide access to the spot.",
  "requestedAmount": "200.00"
}
```

Response `201 Created`:

```json
{
  "id": "refund-request-uuid",
  "bookingId": "booking-uuid",
  "status": "PENDING",
  "requestedAmount": "200.00",
  "currency": "THB",
  "reason": "Host could not provide access to the spot.",
  "createdAt": "2026-09-22T09:05:00Z"
}
```

## 7. Host Booking Management

### `GET /api/v1/hosts/me/bookings`

Query parameters:

- `status`: `PAYMENT_SUBMITTED`, `CONFIRMED`, `ONGOING`, `COMPLETED`, `CANCELLED_BY_USER`, `REJECTED_BY_HOST`.
- `spotId`: optional UUID filter.
- `from`, `to`: optional ISO 8601 date range.
- `page`, `limit`: pagination; default `1`, `20`, maximum `100`.
- `sort`: `created_desc`, `start_asc`, or `start_desc`.

Response uses the same paginated envelope as renter bookings and includes renter summary:

```json
{
  "items": [
    {
      "id": "booking-uuid",
      "status": "PAYMENT_SUBMITTED",
      "spot": { "id": "spot-uuid", "title": "Central Plaza Lot" },
      "renter": { "id": "renter-uuid", "name": "Renter Name", "phone": "+66800000000", "avatarUrl": null },
      "startTime": "2026-09-22T09:00:00Z",
      "endTime": "2026-09-22T13:00:00Z",
      "totalPrice": "200.00",
      "paymentStatus": "PENDING_REVIEW"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20,
  "hasNextPage": false
}
```

### `GET /api/v1/hosts/me/bookings/:id/payment-slip`

Response `200 OK`:

```json
{
  "bookingId": "booking-uuid",
  "paymentId": "payment-uuid",
  "amount": "200.00",
  "currency": "THB",
  "verificationStatus": "PENDING_REVIEW",
  "downloadUrl": "https://s3.example.com/short-lived-get-url",
  "downloadUrlExpiresAt": "2026-09-22T08:30:00Z"
}
```

The backend must authorize the host against the booking's spot ownership and issue a short-lived download URL rather than exposing the bucket publicly.

### `POST /api/v1/hosts/me/bookings/:id/confirm`

Request:

```json
{
  "note": "Payment verified against bank statement."
}
```

Response `200 OK` returns the booking with `status: "CONFIRMED"` and payment `verificationStatus: "VERIFIED"`.

### `POST /api/v1/hosts/me/bookings/:id/reject`

Request:

```json
{
  "reasonCode": "AMOUNT_MISMATCH",
  "reason": "The transferred amount does not match the booking total.",
  "allowResubmission": true
}
```

Response `200 OK`:

```json
{
  "bookingId": "booking-uuid",
  "status": "REJECTED_BY_HOST",
  "payment": {
    "verificationStatus": "REJECTED",
    "rejectionReason": "The transferred amount does not match the booking total.",
    "allowResubmission": true
  }
}
```

## 8. Booking State Machine

Recommended states:

```text
PENDING_PAYMENT
  -> PAYMENT_SUBMITTED
  -> CANCELLED_BY_USER
  -> EXPIRED

PAYMENT_SUBMITTED
  -> CONFIRMED
  -> REJECTED_BY_HOST
  -> CANCELLED_BY_USER
  -> CANCELLED_BY_HOST

REJECTED_BY_HOST
  -> PAYMENT_SUBMITTED       (only if allowResubmission = true)
  -> CANCELLED_BY_USER
  -> EXPIRED

CONFIRMED
  -> ONGOING
  -> CANCELLED_BY_USER       (only when policy permits)
  -> CANCELLED_BY_HOST
  -> COMPLETED

ONGOING
  -> COMPLETED
  -> CANCELLED_BY_HOST       (exception/manual intervention)

COMPLETED
  -> REFUND_REQUESTED        (separate refund workflow; booking status remains auditable)

CANCELLED_BY_USER / CANCELLED_BY_HOST / REJECTED_BY_HOST / EXPIRED
  -> terminal unless a refund process updates the refund record
```

The backend must reject illegal transitions with `409 Conflict`, record every transition in an immutable status history, and expose the current transition reason where relevant.

## 9. Error Contract

Use a consistent error envelope across all endpoints:

```json
{
  "statusCode": 409,
  "code": "BOOKING_OVERLAP",
  "message": "The selected time window is no longer available.",
  "details": {
    "spotId": "spot-uuid",
    "conflictingBookingId": "booking-uuid"
  },
  "timestamp": "2026-09-22T08:10:00Z",
  "path": "/api/v1/bookings"
}
```

| HTTP | Code | Scenario |
|---:|---|---|
| `400` | `VALIDATION_ERROR` | Missing fields, malformed UUID, invalid enum, invalid vehicle details, malformed ISO timestamp. |
| `400` | `INVALID_TIME_RANGE` | `startTime >= endTime`, duration exceeds allowed maximum, or starts too far in the past. |
| `400` | `RATE_NOT_AVAILABLE` | Requested rental type has no configured price for the spot. |
| `401` | `UNAUTHORIZED` | Missing, expired, or invalid access token. |
| `403` | `FORBIDDEN` | User is not the renter/host allowed to access or mutate the booking. |
| `404` | `SPOT_NOT_FOUND` | Spot does not exist. |
| `404` | `BOOKING_NOT_FOUND` | Booking does not exist or is not visible to the caller. |
| `409` | `BOOKING_OVERLAP` | Spot became unavailable during create. |
| `409` | `INVALID_STATUS_TRANSITION` | Requested cancel/confirm/reject action is not legal in the current state. |
| `409` | `IDEMPOTENCY_CONFLICT` | Same idempotency key reused with a different request body. |
| `409` | `PAYMENT_ALREADY_SUBMITTED` | A payment already exists and resubmission is not allowed. |
| `409` | `QUOTE_EXPIRED` | Availability quote expired before booking creation. |
| `413` | `FILE_TOO_LARGE` | Slip exceeds the configured upload limit. |
| `415` | `UNSUPPORTED_MEDIA_TYPE` | Slip content type is not allowed. |
| `422` | `PAYMENT_AMOUNT_MISMATCH` | Submitted amount differs from the server booking total. |
| `429` | `RATE_LIMITED` | Too many availability, upload, or action requests. |
| `500` | `INTERNAL_ERROR` | Unexpected backend failure. |
| `503` | `PAYMENT_PROVIDER_UNAVAILABLE` | Storage/payment dependency is temporarily unavailable. |

## 10. Backend Workflow Requirements

1. Availability and price quote are read-only and short-lived.
2. Booking creation locks/checks the spot's overlapping bookings inside a transaction.
3. Payment submission validates booking ownership, exact amount, upload key ownership, and current status.
4. Host confirmation must atomically verify the payment state and booking state.
5. Cancellation and refund decisions use a server-side policy snapshot, not client-calculated dates.
6. Every mutation emits an audit/status-history record with actor ID, actor role, timestamp, old status, new status, and reason.
7. List endpoints must not leak bookings belonging to another renter or host.
8. Signed S3 URLs must be short-lived and never persisted as the canonical file reference.
9. Notifications should be emitted for payment submission, confirmation, rejection, cancellation, and refund-status changes.
