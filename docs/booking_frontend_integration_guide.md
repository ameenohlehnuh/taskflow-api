# Booking & Payment Module — Frontend Integration Guide

> **Audience:** Frontend AI Agent / Flutter Team
> **Base URL:** `http://<host>:3000/api/v1` (local dev; container port 7070 is mapped to host 3000)
> **Status:** Phase 1 infrastructure complete; endpoints land in Phase 2. This guide describes the agreed contract — build against it, and flag any response that deviates.
> **Companion docs:** [booking_module_api_contract.md](booking_module_api_contract.md) (full backend contract) · [auth_module_summary.md](auth_module_summary.md) (auth integration)

---

## 1. Overview & Core Principles

### Base URL

All booking/payment endpoints live under `/api/v1`:

```
http://localhost:3000/api/v1          # local development
https://api.example.com/api/v1        # production (TBD)
```

### Authentication

All booking endpoints except availability require a Bearer token:

```http
Authorization: Bearer <accessToken>
```

The token comes from `POST /auth/login` or `POST /auth/register` (see the auth summary doc).
A `401` with code `UNAUTHORIZED` means the access token is missing/expired — run the
refresh flow, and if refresh also fails, clear storage and return to Login.

### Idempotency-Key (mandatory for booking creation)

Every `POST /bookings` call **must** include a UUID v4 header:

```http
Idempotency-Key: 2f2d4c3d-2de3-4d7d-a3dc-3f50ecf3a0ef
```

- Generate **one key per user intent** (per "Confirm booking" tap), not per retry.
- If the network fails and you retry, **reuse the same key** — the backend returns the
  original booking instead of creating a duplicate.
- Reusing a key with a *different* body returns `409 IDEMPOTENCY_CONFLICT`.
- Generate with `uuid.v4()` (Dart: `uuid` package) or the platform's UUID generator.

### Dates & Money

| Concern | Rule |
|---|---|
| Timestamps | ISO 8601 UTC strings with explicit offset or `Z` — e.g. `2026-09-22T09:00:00Z`. Send UTC; convert to local time only for display. |
| Money | **Decimal strings**, never floats — `"200.00"`, not `200.00`. Currency is `THB`. |
| IDs | UUID strings. |

```dart
// ❌ Never
final total = 200.00;              // float — precision loss
// ✅ Always
final total = '200.00';            // string — exact
```

---

## 2. Renter Workflow — Step by Step

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Availability + Quote   GET  /spots/:spotId/availability      │
│ 2. Create Booking         POST /bookings          (Idempotency-Key) │
│ 3. Upload Slip            POST /bookings/:id/payment-slip/upload-url │
│                           PUT  → S3/MinIO (direct, presigned)      │
│ 4. Submit Payment         POST /bookings/:id/payment               │
│ 5. Track / Cancel / Refund                                       │
└─────────────────────────────────────────────────────────────────┘
```

### Step 1 — Availability & Price Quote

```http
GET /api/v1/spots/{spotId}/availability?startTime=2026-09-22T09:00:00Z&endTime=2026-09-22T13:00:00Z&rentalType=hourly
```

Response `200` (available):

```json
{
  "spotId": "spot-uuid",
  "available": true,
  "requestedWindow": { "startTime": "...", "endTime": "...", "timezone": "Asia/Bangkok" },
  "quote": {
    "currency": "THB", "rentalType": "hourly", "units": 4,
    "unitRate": "50.00", "subtotal": "200.00", "discount": "0.00",
    "serviceFee": "0.00", "total": "200.00", "expiresAt": "2026-09-22T08:10:00Z"
  },
  "conflicts": []
}
```

**Frontend rules:**

- `available: false` is still `200 OK` — check the flag, don't rely on HTTP status.
  Show the `conflicts` array (each has `startTime`/`endTime` of the blocking booking).
- **`quote.expiresAt` is a hard deadline.** Store the quote and disable the confirm
  button when it passes; re-fetch availability instead of submitting a stale quote.
- You may show a locally-computed price preview while the user edits dates, but the
  **server quote is the only number allowed at submission time**.
- `rentalType` must match a rate the spot actually offers (a spot with only
  `pricePerHour` set will reject `rentalType=monthly` with `400 RATE_NOT_AVAILABLE`).

### Step 2 — Create Booking

```http
POST /api/v1/bookings
Authorization: Bearer <accessToken>
Idempotency-Key: 2f2d4c3d-2de3-4d7d-a3dc-3f50ecf3a0ef
Content-Type: application/json
```

```json
{
  "spotId": "spot-uuid",
  "startTime": "2026-09-22T09:00:00Z",
  "endTime": "2026-09-22T13:00:00Z",
  "rentalType": "hourly",
  "vehicleDetails": { "type": "sedan", "plateNumber": "กข-1234", "color": "white" },
  "notes": "Please leave the access card at the entrance.",
  "quoteId": "quote-uuid"
}
```

**Frontend rules:**

- `renterId`, `totalPrice`, `status`, `hostId` are **server-generated** — never send them.
- `quoteId` binds the booking to the quote from Step 1. If the quote expired between
  fetching and submitting, the backend returns `409 QUOTE_EXPIRED` — re-run Step 1 and retry.
- Success is `201 Created` with the full booking object; `status` starts at
  `PENDING_PAYMENT`. Persist the booking `id` — every later step uses it.
- The backend re-checks availability transactionally, so a race can still yield
  `409 BOOKING_OVERLAP` even after a successful availability check. Treat that as
  "someone booked first" and send the user back to Step 1.

### Step 3 — Payment Slip Upload (presigned S3/MinIO)

This is a **two-part flow**: get a short-lived upload URL from the API, then PUT the
file bytes directly to object storage. The image never passes through the API server.

**3a. Request the upload URL**

```http
POST /api/v1/bookings/{bookingId}/payment-slip/upload-url
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{ "fileName": "promptpay-slip.jpg", "contentType": "image/jpeg", "sizeBytes": 842341 }
```

Response `201`:

```json
{
  "uploadUrl": "https://s3.example.com/presigned-put-url",
  "objectKey": "payment-slips/booking-uuid/upload-uuid.jpg",
  "expiresAt": "2026-09-22T08:15:00Z",
  "requiredHeaders": { "Content-Type": "image/jpeg" }
}
```

**3b. Upload the file directly (HTTP PUT)**

```http
PUT {uploadUrl}
Content-Type: image/jpeg

<raw image bytes>
```

```dart
// Flutter example
final req = http.Request('PUT', Uri.parse(uploadUrl))
  ..headers.addAll(requiredHeaders)   // exact headers from the response
  ..bodyBytes = fileBytes;
final res = await req.send();          // expect HTTP 200
```

**Critical rules for 3b:**

- Use **PUT** with the **exact** `requiredHeaders` from 3a — a mismatched
  `Content-Type` makes the presigned signature invalid and the upload fails with `403`.
- File must be **≤ 10 MB**; allowed types are `image/jpeg`, `image/png`,
  `application/pdf`. Validate client-side first (the API also enforces it with
  `413 FILE_TOO_LARGE` / `415 UNSUPPORTED_MEDIA_TYPE`).
- The URL expires in **5 minutes** — upload immediately after 3a. If it expires,
  request a fresh URL (3a is safe to repeat).
- Do **not** log or persist `uploadUrl`; it's short-lived and worthless afterwards.
- **Persist `objectKey`** — it's the canonical file reference you send in Step 4.

### Step 4 — Submit Payment

```http
POST /api/v1/bookings/{bookingId}/payment
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "method": "PROMPTPAY",
  "amount": "200.00",
  "currency": "THB",
  "slipObjectKey": "payment-slips/booking-uuid/upload-uuid.jpg"
}
```

Response `201`:

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

**Frontend rules:**

- `amount` must equal the booking's `totalPrice` **exactly** (string compare after
  normalizing to 2 decimals). A mismatch returns `422 PAYMENT_AMOUNT_MISMATCH`.
- Submitting moves the booking to `PAYMENT_SUBMITTED`. A second submission returns
  `409 PAYMENT_ALREADY_SUBMITTED` unless the host rejected with `allowResubmission: true`.
- After this step the renter waits — poll or push-update the booking status (Step 5).

### Step 5 — Status Tracking, Cancellation & Refunds

**List my bookings:**

```http
GET /api/v1/bookings?status=CONFIRMED,ONGOING&page=1&limit=20&sort=created_desc
```

Paginated envelope: `{ items, total, page, limit, hasNextPage }`.

**Booking detail** (`GET /api/v1/bookings/{id}`) includes `statusHistory`,
`cancellationPolicy` (with `canCancel` and `refundAmount`), payment info, and — only
after confirmation — `checkIn` with a short-lived `qrToken`.

**Cancel** (only when `cancellationPolicy.canCancel` is true):

```http
POST /api/v1/bookings/{id}/cancel
{ "reason": "Plans changed" }
```

→ `200` with `{ status: "CANCELLED_BY_USER", refund: { eligible, amount, ... } }`.

**Refund request** (for completed bookings with problems):

```http
POST /api/v1/bookings/{id}/refund-requests
{ "reason": "Host could not provide access to the spot.", "requestedAmount": "200.00" }
```

→ `201` with a `PENDING` refund request. Never compute refund amounts client-side —
always display the server's `refundAmount`.

---

## 3. Host Workflow

```
┌────────────────────────────────────────────────────────────────────┐
│ 1. List requests    GET  /hosts/me/bookings?status=PAYMENT_SUBMITTED │
│ 2. View slip        GET  /hosts/me/bookings/:id/payment-slip         │
│ 3a. Confirm         POST /hosts/me/bookings/:id/confirm              │
│ 3b. Reject          POST /hosts/me/bookings/:id/reject               │
└────────────────────────────────────────────────────────────────────┘
```

**1. List booking requests** — same paginated envelope as renter list, plus a
`renter` summary per item. Filter by `status`, `spotId`, `from`/`to`.

**2. View the slip** — the response contains a **short-lived** `downloadUrl`:

```json
{
  "bookingId": "...", "paymentId": "...",
  "amount": "200.00", "currency": "THB",
  "verificationStatus": "PENDING_REVIEW",
  "downloadUrl": "https://s3.example.com/short-lived-get-url",
  "downloadUrlExpiresAt": "2026-09-22T08:30:00Z"
}
```

Open `downloadUrl` directly (browser/`url_launcher`) — it expires quickly, so fetch it
fresh each time the host taps "view slip" rather than caching it.

**3a. Confirm** — booking → `CONFIRMED`, payment → `VERIFIED`:

```http
POST /api/v1/hosts/me/bookings/{id}/confirm
{ "note": "Payment verified against bank statement." }
```

**3b. Reject** — booking → `REJECTED_BY_HOST`:

```http
POST /api/v1/hosts/me/bookings/{id}/reject
{
  "reasonCode": "AMOUNT_MISMATCH",
  "reason": "The transferred amount does not match the booking total.",
  "allowResubmission": true
}
```

If `allowResubmission: true`, the renter may re-upload and resubmit (back to Step 3).
Show the `reason` to the renter — it's included in their booking detail.

---

## 4. Data Enums Reference

### Booking Status (10 values — UPPERCASE, exact strings)

| Status | Meaning | Set by |
|---|---|---|
| `PENDING_PAYMENT` | Booking created, awaiting slip | Backend on create |
| `PAYMENT_SUBMITTED` | Slip uploaded & submitted | Renter payment submission |
| `CONFIRMED` | Host approved payment | Host confirm |
| `ONGOING` | Rental in progress | System/host (start time reached) |
| `COMPLETED` | Rental finished | System/host (end time passed) |
| `CANCELLED_BY_USER` | Renter cancelled | Renter cancel |
| `CANCELLED_BY_HOST` | Host cancelled | Host action |
| `REJECTED_BY_HOST` | Host rejected payment/booking | Host reject |
| `EXPIRED` | Payment window elapsed | System |
| `REFUNDED` | Refund processed | Refund workflow |

**Legal transitions** (anything else → `409 INVALID_STATUS_TRANSITION`):

```text
PENDING_PAYMENT    → PAYMENT_SUBMITTED | CANCELLED_BY_USER | EXPIRED
PAYMENT_SUBMITTED  → CONFIRMED | REJECTED_BY_HOST | CANCELLED_BY_USER | CANCELLED_BY_HOST
REJECTED_BY_HOST   → PAYMENT_SUBMITTED (only if allowResubmission) | CANCELLED_BY_USER | EXPIRED
CONFIRMED          → ONGOING | CANCELLED_BY_USER (policy) | CANCELLED_BY_HOST | COMPLETED
ONGOING            → COMPLETED | CANCELLED_BY_HOST (manual)
COMPLETED          → REFUND_REQUESTED (separate workflow)
```

### Payment Enums

| Enum | Values |
|---|---|
| `method` | `PROMPTPAY` |
| `verificationStatus` | `PENDING_REVIEW`, `VERIFIED`, `REJECTED` |
| Refund request `status` | `PENDING`, `APPROVED`, `REJECTED`, `PROCESSED` |

> Note: the current payments table also has an `AWAITING_SLIP` value used internally
> before a slip exists — the renter-facing flow starts at `PENDING_REVIEW`.

---

## 5. Error Handling & Exception Envelope

Every error response uses one envelope:

```json
{
  "statusCode": 400,
  "code": "ERROR_CODE",
  "message": "Human readable message",
  "details": {},
  "timestamp": "2026-09-22T08:10:00Z",
  "path": "/api/v1/..."
}
```

**Parse `code`, not `message`** — messages may change; codes are stable.

### Actionable codes for the frontend

| Code | HTTP | What to do in the UI |
|---|---:|---|
| `VALIDATION_ERROR` | 400 | Show per-field errors from `details.fields[]` next to inputs |
| `INVALID_TIME_RANGE` | 400 | Highlight the date/time pickers; `startTime` must be before `endTime` |
| `RATE_NOT_AVAILABLE` | 400 | The spot has no price for that `rentalType` — disable the option |
| `UNAUTHORIZED` | 401 | Run token refresh; on failure clear storage → Login screen |
| `FORBIDDEN` | 403 | User isn't allowed to act on this booking — hide the action |
| `SPOT_NOT_FOUND` / `BOOKING_NOT_FOUND` | 404 | Show "not found" state; refresh the list |
| `BOOKING_OVERLAP` | 409 | Window was taken during submission — back to availability, suggest new times |
| `INVALID_STATUS_TRANSITION` | 409 | Refresh the booking; the action is no longer legal |
| `IDEMPOTENCY_CONFLICT` | 409 | Same key sent with different body — generate a fresh key |
| `PAYMENT_ALREADY_SUBMITTED` | 409 | Show "payment already submitted"; refresh status |
| `QUOTE_EXPIRED` | 409 | Re-fetch availability (Step 1) and let the user re-confirm |
| `PAYMENT_AMOUNT_MISMATCH` | 422 | Show the server's expected total; don't let the user edit it |
| `FILE_TOO_LARGE` | 413 | Enforce 10 MB client-side before upload |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Restrict the file picker to jpeg/png/pdf |
| `RATE_LIMITED` | 429 | Back off; retry after a delay |
| `INTERNAL_ERROR` | 500 | Generic error toast; offer retry |
| `PAYMENT_PROVIDER_UNAVAILABLE` | 503 | "Upload service temporarily unavailable"; retry later |

### Flutter error handling pattern

```dart
try {
  final res = await api.createBooking(body, idempotencyKey: key);
  // handle 201
} on ApiException catch (e) {
  switch (e.code) {
    case 'QUOTE_EXPIRED':
    case 'BOOKING_OVERLAP':
      context.go('/availability', extra: e.details); // restart flow
    case 'PAYMENT_ALREADY_SUBMITTED':
      context.go('/booking/${e.details?['bookingId']}'); // just refresh
    case 'UNAUTHORIZED':
      await session.refreshOrLogout();
    default:
      showSnackbar(e.message);
  }
}
```

---

## 6. Quick cURL Smoke Tests

```bash
BASE=http://localhost:3000/api/v1

# 1. Availability (public)
curl "$BASE/spots/{spotId}/availability?startTime=2026-09-22T09:00:00Z&endTime=2026-09-22T13:00:00Z&rentalType=hourly"

# 2. Create booking (JWT + idempotency key)
curl -X POST "$BASE/bookings" \
  -H "Authorization: Bearer $AT" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"spotId":"...","startTime":"2026-09-22T09:00:00Z","endTime":"2026-09-22T13:00:00Z","rentalType":"hourly"}'

# 3a. Presigned upload URL
curl -X POST "$BASE/bookings/{id}/payment-slip/upload-url" \
  -H "Authorization: Bearer $AT" -H "Content-Type: application/json" \
  -d '{"fileName":"slip.jpg","contentType":"image/jpeg","sizeBytes":842341}'

# 3b. Upload directly to MinIO/S3
curl -X PUT "$UPLOAD_URL" -H "Content-Type: image/jpeg" --data-binary @slip.jpg

# 4. Submit payment
curl -X POST "$BASE/bookings/{id}/payment" \
  -H "Authorization: Bearer $AT" -H "Content-Type: application/json" \
  -d '{"method":"PROMPTPAY","amount":"200.00","currency":"THB","slipObjectKey":"payment-slips/.../x.jpg"}'

# Host side
curl "$BASE/hosts/me/bookings?status=PAYMENT_SUBMITTED" -H "Authorization: Bearer $HOST_AT"
curl "$BASE/hosts/me/bookings/{id}/payment-slip" -H "Authorization: Bearer $HOST_AT"
curl -X POST "$BASE/hosts/me/bookings/{id}/confirm" -H "Authorization: Bearer $HOST_AT" -d '{"note":"ok"}'
```

---

## 7. Implementation Status Notes

- **Phase 1 (done):** schema migration (uppercase enums, pricing columns, status
  history, refund requests), entities, DTOs, error envelope filter, MinIO + S3 client.
- **Phase 2 (pending):** services & controllers — the endpoints in this guide do not
  respond yet. Build the Flutter models/interceptors against this contract now; wire
  live calls once Phase 2 ships.
- **MinIO console** for local slip inspection: `http://localhost:9001`
  (`minioadmin` / `minioadmin`), bucket `payment-slips`.