# Orders Console

A small full-stack app for an operations team: find an order fast in a list of 50,000+, and create new orders without ever making a duplicate.

Stack: React 19 + Vite (TypeScript), Express 5 (TypeScript), SQLite through Node's built-in `node:sqlite`.

## Run it

You need Node 22.13 or newer (I used 24). No other services.

```bash
npm install
cp .env.example .env        # on Windows: copy .env.example .env
npm run seed                # creates the database with 50,000 orders (a few seconds)
npm run dev                 # API on :3000, app on http://localhost:5173
```

Seeded logins (plain on purpose, as the brief allows):

| Role  | Email             | Password   |
|-------|-------------------|------------|
| admin | admin@sarh.test   | Admin123!  |
| agent | agent@sarh.test   | Agent123!  |

Other commands:

```bash
npm test             # server tests (38): auth, list, create, duplicate proof
npm run prove        # needs "npm run dev" running. Fires one create request 10 times in parallel
npm run explain      # prints the SQLite query plans for the main list queries
npm run typecheck
npm run build
```

`npm run seed` can be run again at any time. It wipes and recreates the data, and keeps the indexes.

## R1: the list

- Server-side cursor pagination, 50 rows per page. The browser never gets the full table.
- Search matches the **start** of the customer name or email. Filter by status. Sort by date or amount, both directions.
- There is also a `minTotal` filter on the API (cents), not used in the UI.

**Indexes** (all in `server/db/schema.sql`):

| Index | Used for |
|---|---|
| `(created_at, id)` | newest / oldest first, and the cursor "next page" |
| `(total_cents, id)` | sort by amount |
| `(status, created_at, id)` | status filter + date sort |
| `(status, total_cents, id)` | status filter + amount sort |
| `(customer_name COLLATE NOCASE)` and the same on `customer_email` | search by prefix |

The `id` at the end of each index is the tie-breaker, so two orders with the same date or amount still have a fixed order. Query plans before and after (50,000 orders, from `EXPLAIN QUERY PLAN`):

```
before   SCAN orders | USE TEMP B-TREE FOR ORDER BY                        ~4.5 ms
after    SCAN orders USING COVERING INDEX idx_orders_created_at           ~0.02 ms
         SEARCH orders USING COVERING INDEX idx_orders_status_created_at (status=?)
         MULTI-INDEX OR | SEARCH orders USING INDEX idx_orders_name_nocase ...   (search)
```

Search is "starts with" and not "contains" because `LIKE '%text%'` cannot use an index. SQLite only uses the index for `LIKE` when the column is `COLLATE NOCASE` and the pattern has no leading `%`.

**The rapid-filter test.** Every list request gets an `AbortController`. When the filters change, React's effect cleanup aborts the previous request, and the response handler checks `signal.aborted` before it touches state. So a slow old response can never overwrite a newer one. The search box is also debounced by 300 ms so typing does not send a request per letter. I checked this in a browser by delaying the responses (status `pending` 2.5 s, `paid` 1.5 s, `cancelled` 0.1 s), changing the filter three times quickly, and confirming only `cancelled` rows were left. Screenshot: `docs/screenshots/rapid-filter.png`.

## R2: create order, no duplicates

The form makes one random key (a UUID) when it opens. It is sent with the order and stored in the `orders.u_number` column, which is `UNIQUE`. The server inserts the order and its items in one transaction with `ON CONFLICT(u_number) DO NOTHING`. If the key already exists, the server returns the first order (status 200, `duplicate: true`) and creates nothing. Double click, a retry after a timeout, or a browser resend all carry the same key, so they all end up as one order. The total is calculated on the server from the items, never taken from the client.

Proof: `npm test` has tests with 2 and 20 parallel identical requests, and one that checks the database refuses a duplicate key from a second connection. `npm run prove` does it against the running server:

```
Sending the SAME create request 10 times in parallel...
status codes: 201 200 200 200 200 200 200 200 200 200
orders in the database for proof-...@example.com: 1
PASS: exactly one order exists.
```

The reasoning and the limits are in `DECISIONS.md`.

## Code review of the contractor's auth

Problems I found, and what I changed:

1. **Secret hard-coded in the source** (`"sarh-secret-2026"`). Anyone with the repo can sign tokens. Now it comes from `JWT_SECRET` in `.env`, and the server refuses to start without it. `.env.example` is committed, `.env` is not.
2. **`jwt.decode` instead of `jwt.verify`.** `decode` only reads the token and never checks the signature, so anyone could send `{"role":"admin"}` and be believed. Now `jwt.verify` is used and only `HS256` is allowed (this also blocks `alg: none` tokens). Tested with a forged token and an unsigned token.
3. **Token accepted from the query string** (`?token=`). URLs end up in logs, browser history and referrer headers. Now the token is only read from the cookie.
4. **Admin check only in the React `AdminOnly` component.** The API itself let any logged-in user delete any order. Now `requireRole('admin')` runs on the server for `DELETE /api/orders/:id`. Agents get 403 (tested). The React delete button is hidden for agents, but that is only for looks.
5. **Passwords compared in plain text** in the database query (`findFirst({ email, password })`). Passwords are now stored as salted `scrypt` hashes and compared with `timingSafeEqual`. Wrong password and unknown email return the same error, and an unknown email still does a dummy hash so the response time does not reveal which emails exist.
6. **Tokens never expire** (`jwt.sign` without `expiresIn`). A stolen token worked forever. Now they last 1 hour (tested with an expired token).
7. **No limit on login attempts.** Now 5 failed tries per IP+email in 15 minutes returns 429. This is in memory, see "what I skipped".
8. **Delete route trusted `req.params.id`** and did no checks. Now the id is validated, the order and its items are deleted in one transaction, and a missing order returns 404.
9. **Smaller design points:** the header was parsed with `split(" ")[1]` (fragile), `req.user = payload` was untyped, and there was no JSON error handler. These are cleaned up (`AuthUser` type, error handler that returns JSON).

The role is read from the signed token, so if an admin is downgraded the change only applies when the old token expires (at most 1 hour). I accepted that for this size of app.

**Where the token lives on the client.** It is in an `httpOnly`, `SameSite=Strict` cookie, so the React code never sees it. That protects against an attacker's script stealing the token (XSS can't read an `httpOnly` cookie) and against other websites sending requests with it (CSRF, because of `SameSite=Strict`). It does not protect against XSS that runs inside the page, which can still make requests as the user while the page is open, and the `Secure` flag is only on in production, so on plain `http://localhost` the cookie is not encrypted in transit.

## Product question: "Delete all cancelled orders"

Before building it, I would ask her:
1. What problem is it fixing: a cluttered list, slow reports, something else? (The status filter may already solve it.)
2. Does anyone need cancelled orders later, for refunds, accounting or a customer dispute?
3. Who may press it, and what happens if she presses it by mistake?

If she cannot answer, I would delete nothing: hide cancelled orders by default and add an undoable "archive" flag; a real delete comes later, admin only, with a count preview and a confirmation.

## What I skipped, and why

- **Optional tasks O1 and O2.** I wanted to finish the mandatory parts properly first.
- **Virtualised rendering.** Pages are 50 rows, so the page is light. But if someone clicks "Load more" for hours, the table keeps growing. A virtual list would fix that.
- **"Contains" search.** Only "starts with", for the index reason above. A search by the middle of a name would need full-text search (SQLite FTS5).
- **Search together with a status filter** is about 8 ms, not 0.02 ms. Fine for now, I did not tune it.
- **Duplicates the key cannot catch.** If an agent refreshes the page and fills the form again, that is a new key, so a second order is created. Same key with a different body quietly returns the first order. Details in `DECISIONS.md`.
- **Login rate limit is in memory.** It resets when the server restarts and does not work across several servers.
- **No refresh tokens, password reset or user management.** Only the two seeded staff accounts.
- **No separate CSRF token.** I rely on `SameSite=Strict`.
- **No automated React tests.** The rapid-filter and double-click checks were done with a throwaway browser script (Playwright) that I did not commit. The server has the tests.
- **Deleting an order is a hard delete.** Fine for an admin tool here, but see the product question above for why I would think twice.
- **`node:sqlite` prints an "experimental" warning.** It is harmless.
- Money is shown as USD only for display. The currency is not stored.

## Screenshots

| | |
|---|---|
| `docs/screenshots/list.png` | the list after login |
| `docs/screenshots/rapid-filter.png` | the rapid-filter test result |
| `docs/screenshots/create-order.png` | the order created once, found by its email |
| `docs/proof-output.txt` | output of `npm run prove` |

## Project layout

```
server/
  db/schema.sql            tables and indexes
  scripts/                 seed, explain, prove-no-duplicates
  src/app.ts               express app
  src/auth.ts              requireAuth, requireRole
  src/routes/auth.ts       login, logout, me
  src/routes/orders.ts     list endpoint (cursor pagination)
  src/routes/orderWrite.ts create and delete
  test/                    vitest + supertest
client/src/                React app (api, hooks, list page, create form)
```
