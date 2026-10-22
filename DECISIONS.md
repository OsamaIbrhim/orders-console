# Decisions

## 1. Stopping duplicate orders with an idempotency key (R2)

**Decision.** The form creates a UUID when it opens and sends it with the order. The server stores it in `orders.u_number`, which is `UNIQUE`, and inserts with `ON CONFLICT DO NOTHING` inside a transaction. If the key already exists, the server returns the first order and creates nothing. The guarantee is in the database, so it holds for double clicks, mobile retries and browser resends.

**Alternative I considered.** Only disable the button, or detect duplicates by content (same customer, same items, within a minute).

**Why I rejected it.** A disabled button does nothing when the network retries the request, because the retry does not go through the UI. Content matching would block real repeat orders (a customer can order the same things twice), and it needs a time window that is always a guess.

**Limits.** A refreshed page gets a new key, so filling the form again makes a second order. The same key with a different body returns the first order without saying the body was different. The key comes from the client, so this protects against mistakes, not against someone who wants to cheat.

## 2. Cursor pagination instead of page numbers

**Decision.** The list API returns 50 rows and a `nextCursor`. The cursor holds the last row's sort value and `id`, and the next query is `WHERE (sort_column, id) < (?, ?)` with the same `ORDER BY`. The matching index makes every page about as fast as the first one.

**Alternative I considered.** `LIMIT 50 OFFSET n`, which is simpler and gives page numbers.

**Why I rejected it.** With offset the database still reads and skips all the earlier rows, so deep pages get slower. It also breaks when orders are added while someone is paging: rows move, so you see repeats or miss some. The cursor does not have this problem.

**Cost.** No "jump to page 37" and no total count. For a team that searches and filters to find an order, I think that is fine.

## 3. SQLite through the built-in `node:sqlite`

**Decision.** One SQLite file, accessed with the `node:sqlite` module that comes with Node. There is nothing to install or start, which fits "runs from the README in under five minutes".

**Alternative I considered.** PostgreSQL, or SQLite with the `better-sqlite3` package.

**Why I rejected it.** `better-sqlite3` is what I tried first. It failed to install on my Windows machine with Node 24, because there was no prebuilt binary and it needs the Visual Studio C++ build tools. That would break the five-minute setup for the reviewers too. PostgreSQL would need an install or Docker, and 50,000 rows is easy for SQLite with the right indexes.

**Limits.** `node:sqlite` is marked experimental and prints a warning. SQLite has one writer at a time, so with several app servers or heavy writes I would move to PostgreSQL. The SQL is plain, so that move is not large.

## How I used AI

I used Claude (Anthropic) for most of this project, so here is exactly what it did and what I did.

- **Claude wrote:** the seed script and schema, the project setup, the first version of the orders list route, the indexes, the auth code and the fixes for the contractor's middleware, the create-order endpoint, the tests, the React app, and the first drafts of the README and this file.
- **I did:** I chose the stack and the data model (SQLite, the tables from my own sketch), and I set the requirements for each part. I changed the orders route myself to check that I understand it: search now matches the start of the name instead of any part, and I added the `minTotal` filter with its validation (Claude corrected a bug in my validation). I also ran the app and checked the query plans.
- **How I worked:** Claude explained the code file by file, and I practised changing it. I read the README and this file before sending, and I can explain and change the code in the live interview.
