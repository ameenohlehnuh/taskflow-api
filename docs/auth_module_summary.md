# Backend Auth Module Documentation & Handoff Specification

> **Audience:** Frontend AI Agent (Flutter client integration)
> **Base URL:** `http://<host>:3000/api/v1/auth`
> **Status:** Implemented and verified end-to-end against the Docker stack.

---

## 1. System Architecture Overview

- **Access Token:** Short-lived (**15 minutes**), stateless verification using NestJS `JwtStrategy` (Passport). No Redis lookup occurs on normal API requests — verification is purely signature + expiry.
- **Refresh Token:** Long-lived (**30 days**), stateful management using Redis (`ioredis`).
- **Redis Key Structure:** `auth:refresh:{userId}` storing the refresh token string, with a 30-day TTL (`2592000` seconds).
- **Security Features:**
  - **Single-use Refresh Token Rotation:** every refresh invalidates the old token immediately; reusing an old token returns `401` and effectively revokes the session.
  - **bcrypt password hashing** (10 salt rounds). `passwordHash` is never exposed in any API response.
  - **Strict DTO mapping:** user objects are built by an explicit mapper (`toUserDto`) — only safe fields are returned.
  - **Input validation:** all request bodies validated via `class-validator` through a global `ValidationPipe({ whitelist: true, transform: true })`. Unknown properties are stripped.

---

## 2. API Endpoint Specifications

| Endpoint | Method | Guard | Description | Request Body | Response Success | Error Responses |
|---|---|---|---|---|---|---|
| `/api/v1/auth/register` | `POST` | None | User Registration with Auto-Login | `{ email, password, name, phone }` | `201 { accessToken, refreshToken, user }` | `409 Conflict` (Email exists), `400 Bad Request` |
| `/api/v1/auth/login` | `POST` | None | User Authentication | `{ email, password }` | `200 { accessToken, refreshToken, user }` | `401 Unauthorized` |
| `/api/v1/auth/refresh` | `POST` | None | Token Rotation | `{ refreshToken }` | `200 { accessToken, refreshToken }` | `401 Unauthorized` (Invalid signature, missing key, or token reuse) |
| `/api/v1/auth/logout` | `POST` | `JwtAuthGuard` | Invalidates Redis Refresh Token Session | None | `200 { message: "Logged out successfully" }` | `401 Unauthorized` |
| `/api/v1/auth/me` | `GET` | `JwtAuthGuard` | Fetches fresh user profile directly from PostgreSQL | None | `200 { user }` | `401 Unauthorized` |
| `/api/v1/auth/account` | `DELETE` | `JwtAuthGuard` | Deletes user account (App Store Compliance) | `{ password }` | `200 { message: "Account successfully deleted" }` | `401 Unauthorized` |

### Field Details

**`user` object shape** (returned by `register`, `login`, `me`):

```json
{
  "id": "uuid",
  "email": "string",
  "name": "string",
  "phone": "string",
  "avatarUrl": "string | null",
  "role": "renter | host | both",
  "rating": "string (numeric)",
  "reviewCount": "number",
  "createdAt": "ISO 8601 timestamp"
}
```

**Validation rules:**

| Field | Rule |
|---|---|
| `email` | Valid email format (`@IsEmail`) |
| `password` | Min length 8; registration additionally requires at least one letter and one digit |
| `name`, `phone` | Non-empty strings |
| `refreshToken` | Must be a valid JWT structure (`@IsJWT`) |

---

## 3. Verified Edge-case Behavior & System Enforcements

The following behaviors were verified with live integration tests against the running Docker stack:

- **Duplicate Registration:** Throws `HTTP 409 Conflict` with message `"Email already exists"`.
- **Token Rotation:** Each refresh request invalidates the old `refreshToken` immediately and issues a new pair. Reusing a rotated (old) refresh token returns `401` — treat this as a session revocation signal.
- **Session Revocation:** Logout removes `auth:refresh:{userId}` from Redis (key TTL becomes `-2`), blocking subsequent refresh attempts with `401`.
- **Account Deletion:** Requires password re-confirmation (`401 "Invalid password"` on mismatch). On success the user row is hard-deleted (cascading to bookings, spots, reviews, notifications) and the Redis refresh key is deleted — all sessions die instantly.
- **Profile Queries (`/me`):** Bypasses cache and reads directly from PostgreSQL to ensure fresh state. No user profile data is cached in Redis.
- **Invalid Credentials:** Login returns `401` for both unknown email and wrong password (identical message — no user enumeration).

---

## 4. Notes & Action Items for Frontend Integration (Flutter)

- **Token Storage:** Store both `accessToken` and `refreshToken` in `flutter_secure_storage`. Do NOT use `shared_preferences`.
- **Header Structure:** Attach `Authorization: Bearer <accessToken>` to all protected calls.
- **Single-Flight Interceptor:** Implement a mutex/queue in the Dio Interceptor during token refresh to avoid parallel calls consuming an already-rotated refresh token. Only ONE refresh request may be in flight; all other 401-retried requests must await its result.
- **Handling 401 on Refresh Failure:** Clear secure storage completely and navigate to the Login screen. A `401` from `/auth/refresh` means the session is unrecoverable (expired, revoked, or token reuse detected).
- **Logout flow:** Call `POST /auth/logout` with the Bearer token, then clear secure storage regardless of the response status.
- **Account deletion flow:** Per store guidelines, present a confirmation dialog, then call `DELETE /auth/account` with `{ "password": "<current password>" }`. On `200`, clear secure storage and navigate to Login. On `401`, show "Incorrect password" and remain on the screen.
- **Proactive refresh (recommended):** Decode the access token's `exp` claim client-side and refresh ~60 seconds before expiry, rather than waiting for a 401.