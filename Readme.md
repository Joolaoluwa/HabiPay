# HabiPay Server

Backend API for the HabiPay rent-financing platform (tenants, landlords and admins).

**Stack:** Node.js, Express, TypeScript, PostgreSQL (Neon), Drizzle ORM, JWT authentication, AES-256-GCM field encryption.

This guide takes you from cloning the repo to confirming every route works locally with Postman.

---

## 1. Prerequisites

Install these first:

| Tool | Version | Check with |
|---|---|---|
| Node.js | 18 or newer (20 LTS recommended) | `node -v` |
| npm | comes with Node | `npm -v` |
| Git | any recent version | `git --version` |
| Postman | desktop app | n/a |

You also need:

- A **PostgreSQL database.** The project is set up for [Neon](https://neon.tech) (free tier). Create a project and copy the **pooled connection string** from the dashboard.
- A **Gmail account with an App Password**, used to send OTP emails. Create it at <https://myaccount.google.com/apppasswords> (2-Step Verification must be on). Your normal Gmail password will not work.

<!-- VERIFY: confirm the Node version your project needs -->

---

## 2. Clone and install

```bash
git clone https://github.com/<your-github-username>/HabiPay.git
cd HabiPay
npm install
```

<!-- VERIFY: if the server lives in a sub-folder (apps/server), add `cd apps/server` before the install step, or confirm npm workspaces handle it from the root -->

---

## 3. Configure environment variables

Create a file named `.env` in the server folder (same level as `package.json`). Never commit this file.

```env
# Server
PORT=3000
NODE_ENV=development

# Database (Neon pooled connection string)
DATABASE_URL=postgresql://user:password@ep-xxxx-pooler.region.aws.neon.tech/dbname?sslmode=require

# JWT
JWT_SECRET=replace-with-a-long-random-string
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# Encryption key for BVN / NIN / bank account numbers (must be exactly 64 hex characters)
ENCRYPTION_KEY=replace-with-64-hex-characters

# Email (Gmail App Password, no spaces)
GMAIL_USER=youraddress@gmail.com
GMAIL_PASS=abcdefghijklmnop
```

<!-- VERIFY: make sure these variable names match src/config/env.ts exactly (especially the email ones and DATABASE_URL) -->

**Generate the secrets** with Node:

```bash
# JWT_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# ENCRYPTION_KEY (32 bytes = 64 hex characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> **Important:** do not change `ENCRYPTION_KEY` once real data has been saved. Existing encrypted values (BVN, NIN, account numbers) can no longer be read with a different key.

---

## 4. Set up the database

Apply the migrations to create the tables:

```bash
npx drizzle-kit migrate
```

To browse the data visually:

```bash
npx drizzle-kit studio
```

---

## 5. Run the server

```bash
npm run dev
```

The API runs at `http://localhost:5000` (or the `PORT` you set). Leave this terminal open while testing.

---

## 6. Project structure

```
src/
├── modules/
│   ├── auth/         # signup, OTP verification, login, token refresh, logout, password reset
│   ├── users/        # get / list / update users, KYC details (BVN, NIN)
│   └── landlords/    # landlord profile and bank details
├── middleware/       # authenticate, authorize (role check), selfOrAdmin (ownership check), validate
├── utils/            # encryption helpers, AppError / response helpers
├── config/           # environment loading and database connection
└── db/
    ├── schema/       # Drizzle table definitions
    └── migrations/   # generated SQL migrations
```

---

## 7. How authentication works

1. **Sign up** creates the account with status `pending` and emails a 6-digit OTP.
2. **Verify OTP** activates the account.
3. **Login** returns an `accessToken` (valid about 15 minutes) and a `refreshToken` (valid about 7 days).
4. Protected routes need the header `Authorization: Bearer <accessToken>`.
5. When the access token expires, call **`POST /auth/refresh`** with the refresh token to get a new pair. Refresh tokens rotate, so **always save the new `refreshToken`** from each response. Reusing an old one revokes the whole session.
6. **Logout** revokes the session's refresh tokens.

**Roles:** `tenant`, `landlord`, `admin`.

---

## 8. Route reference

<!-- VERIFY: confirm the mount prefixes (/auth, /users, /landlord) match app.ts -->

### Auth (`/auth`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/signup` | Public | Create an account and send an OTP |
| POST | `/auth/verify-otp` | Public | Verify the emailed OTP |
| POST | `/auth/resend-otp` | Public | Send a new OTP |
| POST | `/auth/login` | Public | Returns access and refresh tokens |
| POST | `/auth/refresh` | Public (needs refresh token) | Exchange a refresh token for a new pair |
| POST | `/auth/logout` | Public (needs refresh token) | Revoke the session |
| POST | `/auth/forgot-password` | Public | Email a password-reset OTP |
| POST | `/auth/reset-password` | Public | Set a new password using the OTP |

### Users (`/users`)

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/users` | Admin only | List users (paginated: `?page=1&limit=20`) |
| GET | `/users/:id` | The user themselves, or an admin | Get one user |
| PATCH | `/users/:id` | The user themselves, or an admin | Update profile fields |
| PATCH | `/users/:id/kyc` | The user themselves, or an admin | Save BVN and NIN (stored encrypted) |

### Landlords (`/landlord`)

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/landlord` | Landlord | Create the landlord profile with bank details |
| GET | `/landlord/:id` | Landlord | Get a landlord profile (account number is masked) |
| PUT | `/landlord/:id` | Landlord | Update bank details |

---

## 9. Testing with Postman

### 9.1 One-time setup

1. Open Postman and create a **Collection** called `HabiPay`.
2. Create an **Environment** called `HabiPay Local` with these variables:

| Variable | Initial value |
|---|---|
| `baseUrl` | `http://localhost:3000` |
| `accessToken` | (leave empty) |
| `refreshToken` | (leave empty) |
| `userId` | (leave empty) |
| `landlordId` | (leave empty) |

3. Select **HabiPay Local** in the environment dropdown (top right).
4. For every JSON request: **Body > raw > JSON**.
5. For every protected route: **Authorization tab > Bearer Token > `{{accessToken}}`**.

Use `{{baseUrl}}/auth/login` style URLs in every request.

### 9.2 Save tokens automatically after login

In the **Login** request, open the **Scripts** tab (called **Tests** in older Postman versions) and paste:

```js
const res = pm.response.json();
if (res.accessToken) {
  pm.environment.set("accessToken", res.accessToken);
  pm.environment.set("refreshToken", res.refreshToken);
  pm.environment.set("userId", res.user.id);
}
```

Do the same in the **Refresh** request (it returns `accessToken` and `refreshToken`, so drop the `userId` line).

### 9.3 Suggested test order

Run these in order. Each one depends on the one before it.

<!-- VERIFY: check every request body below against the zod schemas in each module (signupSchema, verifyOtpSchema, updateSchema, detailsSchema, createLandlordSchema, etc.) -->

**Step 1: Sign up** `POST {{baseUrl}}/auth/signup`

```json
{
  "full_name": "Test Tenant",
  "email": "your-real-email@gmail.com",
  "phone_number": "08012345678",
  "password": "StrongPass123!",
  "role": "tenant"
}
```

Expect **201**. Use a real inbox, because the OTP is emailed.

**Step 2: Verify OTP** `POST {{baseUrl}}/auth/verify-otp`

```json
{
  "email": "your-real-email@gmail.com",
  "otp": "123456"
}
```

Expect **200**. Logging in before this step returns 403 ("Please verify your email").

**Step 3: Login** `POST {{baseUrl}}/auth/login`

```json
{
  "email": "your-real-email@gmail.com",
  "password": "StrongPass123!"
}
```

Expect **200** with `accessToken`, `refreshToken` and `user`. The script from 9.2 stores them.

**Step 4: Get your own user** `GET {{baseUrl}}/users/{{userId}}`
Expect **200**. The response never contains the password hash.

**Step 5: Update your profile** `PATCH {{baseUrl}}/users/{{userId}}`

```json
{
  "full_name": "Updated Name"
}
```

Expect **200**. Sending `email` or other unlisted fields returns **400**.

**Step 6: Save KYC details** `PATCH {{baseUrl}}/users/{{userId}}/kyc`

```json
{
  "bvn": "12345678901",
  "nin": "12345678901"
}
```

Expect **200**. Both values must be exactly 11 digits. They are stored encrypted, so check the database and confirm you see ciphertext (`v1:...`), not the raw numbers.

**Step 7: Refresh the token** `POST {{baseUrl}}/auth/refresh`

```json
{
  "refreshToken": "{{refreshToken}}"
}
```

Expect **200** with a new pair. Send the **same old token again** (paste the previous value manually) and expect **401, "Refresh token reuse detected"**. That is the security check working, and it also revokes the newer token, so log in again afterwards.

**Step 8: Landlord flow.** Repeat steps 1 to 3 with `"role": "landlord"` and a different email, then:

`POST {{baseUrl}}/landlord`

```json
{
  "bank_name": "GTBank",
  "bank_account_number": "0123456789",
  "account_name": "Test Landlord"
}
```

Expect **201**. Save the returned landlord `id` into the `landlordId` environment variable.

`GET {{baseUrl}}/landlord/{{landlordId}}` returns **200**, and `bank_account_number` is masked (`******6789`).

`PUT {{baseUrl}}/landlord/{{landlordId}}`

```json
{
  "account_name": "New Account Name"
}
```

Expect **200**, with `verification_status` reset to `unverified`.

**Step 9: Admin routes.** There is no public way to create an admin. Sign up a normal account, then promote it in the database (Neon SQL editor or `npx drizzle-kit studio`):

```sql
UPDATE users SET role = 'admin' WHERE email = 'admin-test@example.com';
```

Log in as that user, then `GET {{baseUrl}}/users?page=1&limit=20`. Expect **200** with a `meta` block (page, limit, total, totalPages).

**Step 10: Logout** `POST {{baseUrl}}/auth/logout`

```json
{
  "refreshToken": "{{refreshToken}}"
}
```

Expect **200**. Calling `/auth/refresh` with that token afterwards should now fail.

**Password reset (optional):**
`POST /auth/forgot-password` with `{ "email": "..." }`, read the OTP from the email, then `POST /auth/reset-password` with `{ "email": "...", "otp": "...", "newPassword": "..." }`.

### 9.4 Expected error behaviour (quick checks)

| Test | Expected |
|---|---|
| Protected route with no token | 401 |
| `GET /users` as a tenant | 403 |
| `GET /users/<someone else's id>` as a tenant | 403 or 404 |
| `GET /landlord/...` as a tenant | 403 |
| Invalid UUID in `:id` | 400 |
| Wrong password on login | 401 |
| Access token older than its expiry | 401, then use `/auth/refresh` |

---

## 10. Troubleshooting

| Problem | Likely cause and fix |
|---|---|
| `getaddrinfo ENOTFOUND ...neon.tech` | DNS problem on your network. Switch your DNS to `8.8.8.8` / `1.1.1.1`, or try another network. Confirm the Neon project is active and the `DATABASE_URL` is current. |
| `535 Username and Password not accepted` | `GMAIL_PASS` must be a 16-character **App Password** with no spaces, generated from the same account as `GMAIL_USER`. Restart the server after editing `.env`. |
| `Invalid key length` on startup | `ENCRYPTION_KEY` must be exactly 64 hex characters. |
| `Unsupported encrypted payload` | A row holds plaintext or was encrypted with a different key. Re-create the record. |
| Request hangs with no response | A middleware that needs to be called (`authorize("role")`, `selfOrAdmin()`) was passed without parentheses in a route file. |
| Changes to `.env` have no effect | Restart `npm run dev`. |

---

## 11. Security notes

- Never commit `.env`. Confirm it is listed in `.gitignore`.
- Passwords are hashed with bcrypt. Refresh tokens are stored only as SHA-256 hashes.
- BVN, NIN and bank account numbers are encrypted at rest with AES-256-GCM and are never returned in plaintext by the API.