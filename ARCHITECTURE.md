# my-first-app: Technical Architecture Document

Version 2, 2026-09-11. Supersedes the v1 sign-off of 2026-09-10.
Every change against v1 is listed as change set CS-2 in `my-first-app.md` and needs JAM's approval before Phase 1 task 2 starts.

## 0. Invariants

Every decision below exists to protect these five. A change that breaks one is rejected, whatever else it improves.

| ID | Invariant | Protects against |
|---|---|---|
| I1 | A tap is committed to local SQLite (row + outbox op, one transaction) before the UI reflects it. | Lost logs on crash or force-quit |
| I2 | Logging and viewing never wait on the network. | Friction, Render cold starts |
| I3 | Every server write is idempotent: replaying any op any number of times yields the same state. | Duplicates from retries |
| I4 | Auth expiry pauses sync. It never blocks logging and never deletes local data. | Re-auth friction, data loss |
| I5 | The server takes user identity only from the verified JWT `sub`, and checks ownership of every client-sent ID. | Cross-user writes (IDOR) |

---

## 1. Core architecture

### 1.1 Blueprint

```text
+--------------------------- Expo app (iOS / Android) ---------------------------+
|  Screens (expo-router)                                                          |
|     | read (live queries)             | write (1 transaction: row + outbox op)  |
|     v                                 v                                         |
|  Local store: expo-sqlite, one DB file per Clerk userId (full history, outbox) |
|     ^                                 |                                         |
|     | apply pulled rows               | pending ops, FIFO                       |
|  Sync engine (single-flight, backoff)-+       @clerk/expo + SecureStore cache  |
|     | getToken() before every request                                           |
+-----|---------------------------------------------------------------------------+
      | HTTPS, JSON, Authorization: Bearer <Clerk session JWT>
      v
+-------------- Fastify API (Node 24, Render) ---------------+      +---------+
| modules: health | auth | me | sync                         |      |  Clerk  |
| auth: @clerk/backend verifyToken, networkless (JWT key)    |<-----|  keys   |
| data: Drizzle -> pg Pool -> Neon pooled endpoint           |      +---------+
+------------------------------------------------------------+
      |
      v
  Neon Postgres (branch main = production, branch dev = local development)
```

Modular monolith: each module owns its routes, schemas and queries. Modules call each other through exported functions, never through each other's tables.

### 1.2 State boundaries

| State | Owner | Where it lives | Notes |
|---|---|---|---|
| Identity, sessions | Clerk | Clerk; token cached in SecureStore | API never stores credentials |
| Canonical habits and logs | API | Neon | Source of truth |
| Replica of the user's habits and logs | Client | Per-user SQLite, full history | Streaks longer than 7 days and offline reads need it |
| Pending writes | Client | `outbox` table | Deleted only after the server acknowledges |
| Sync cursor, last userId | Client | `meta` table, SecureStore | Cursor = last `server_version` applied |
| Screen state | React | Component state | No global state library in v1 |

v1 said "cached 7-day window". Changed to full history because a streak longer than 7 days cannot be computed from 7 days, and a year of one habit is about 365 tiny rows.

### 1.3 Data model

Server (Postgres):

```text
users       id text PK (Clerk sub) | created_at timestamptz
habits      id uuid PK (client-generated UUIDv7) | user_id text FK | name text (1..60 chars)
            | archived_at timestamptz null | client_updated_at timestamptz
            | server_version bigint | created_at timestamptz
habit_logs  PK (habit_id uuid FK, day_key date) | user_id text FK | done boolean
            | client_updated_at timestamptz | received_at timestamptz | server_version bigint
indexes     habits(user_id, server_version), habit_logs(user_id, server_version)
sequence    sync_seq: every insert or update sets server_version = nextval('sync_seq')
```

Client (SQLite) mirrors `habits` and `habit_logs`, plus
`outbox(op_id, type, entity_key, payload json, created_at, attempts, state pending|failed, last_error)` and `meta(key, value)`.
Local schema is versioned with `PRAGMA user_version`.

Rules:
- Habit IDs are generated on the device, so a habit created offline can be logged immediately.
- Deleting a habit sets `archived_at` (a tombstone that syncs). No hard deletes in v1.
- A log is state, not an event: `done` is true or false. Unticking writes `done = false`; it never deletes a row, so it syncs and replays safely.
- The `users` row is upserted on the user's first push. No Clerk webhooks in v1.

### 1.4 Write and sync path

1. Tap: one SQLite transaction upserts the local row with `client_updated_at = now()` and inserts an outbox op. The UI updates from its live query. (I1, I2)
2. Triggers: a local write (debounced 2 s), app to foreground, network regained, pull-to-refresh. Only one sync runs at a time.
3. Push: up to 100 pending ops in FIFO order to `POST /v1/sync/push`. FIFO guarantees a habit reaches the server before its logs.
4. The server applies each op with the rules in 1.5 and returns a result per op.
5. Client handling:
   - `applied`: delete the op.
   - `stale`: delete the op and write the canonical `row` returned with it into the local store.
   - `rejected`: move the op to `failed` and show it; ops behind it continue.
   - Network error, timeout, 5xx, 429: leave ops pending; exponential backoff with jitter (2 s base, 5 min cap).
6. Pull, always after push: `GET /v1/sync/pull?cursor=N` until `hasMore` is false. Pulled rows overwrite local rows, except rows with a pending op for the same entity (local intent wins until acknowledged; if it later comes back `stale`, step 5 corrects it).
7. 401: call `getToken({ skipCache: true })` once and retry. If still 401, pause sync and show a non-blocking "Sign in to sync" banner. Logging continues. (I4)
8. Launch: open the local DB of the last signed-in userId (kept in SecureStore) without waiting for Clerk or the network. The sign-in screen appears only when no local user exists.
9. Sign-out: flush the outbox. If ops remain, require an explicit "Discard N unsynced changes" confirmation. Then delete that user's DB file (pull restores it on next sign-in).

Timeouts: 75 s for the first request after launch (covers a Render cold start), 20 s afterwards.

### 1.5 Conflict and day-key rules

- Day-key: `YYYY-MM-DD` from the device's local calendar at the moment of the tap, stored inside the op. Never recomputed at sync time, so travel and late syncs cannot move a log to another day.
- Effective timestamp: `ts = min(client_updated_at, received_at)`. A device with a fast clock cannot win future conflicts.
- Last-write-wins per `(habit_id, day_key)` for logs and per `id` for habits: the incoming op wins only if its `ts` is strictly greater than the stored one, otherwise the result is `stale`. A replay compares equal, so it is a no-op. (I3)
- Future guard: reject `day_key > server UTC date + 1 day`. The extra day admits zones up to UTC+14. v1's "reject future day-keys" did not say future relative to which clock; measured against UTC it rejects real logs from every user ahead of UTC, including Nigeria between midnight and 01:00.
- No server lower bound beyond a valid date. Backfilling your own history harms nobody; the UI limits edits to the visible 7 days.
- Ownership: an op that targets another user's habit, or a habit that does not exist, is `rejected` with code `not_found`. The response never reveals whether the ID exists. (I5)

### 1.6 Domain semantics (v1)

- Habits are daily. No weekly or custom schedules in v1.
- History = the 7 day-keys ending today (local).
- Current streak = consecutive `done` day-keys ending today. If today is not ticked yet, counting ends at yesterday: an unticked today never breaks a streak before the day is over.
- Streak and day-key math are pure functions in `packages/shared`, run on the client against the local store.

### 1.7 API contract

REST, JSON, versioned under `/v1`. Request and response schemas are zod schemas in `packages/shared`: the API validates with them, the client is typed by them. Errors use `application/problem+json` (RFC 9457).

| Method and path | Auth | Request | 200 response | Other statuses |
|---|---|---|---|---|
| `GET /v1/health` | none | none | `{ status: "ok", version }`, no DB call | none |
| `GET /v1/me` | Bearer | none | `{ userId }` | 401 |
| `POST /v1/sync/push` | Bearer | `{ ops: Op[] }`, 1 to 100 ops | `{ results: Result[] }`, one per op, same order | 400 schema, 401, 413 over 100 ops, 429 |
| `GET /v1/sync/pull` | Bearer | `?cursor=<int>&limit=<1..500>` | `{ habits, logs, cursor, hasMore }` | 400, 401, 429 |

```ts
type Op =
  | { opId: string; type: "habit.upsert";
      habit: { id: string; name: string; archivedAt: string | null; clientUpdatedAt: string } }
  | { opId: string; type: "log.upsert";
      log: { habitId: string; dayKey: string; done: boolean; clientUpdatedAt: string } };

type Result =
  | { opId: string; status: "applied" }
  | { opId: string; status: "stale"; row: HabitRow | LogRow }   // canonical server state
  | { opId: string; status: "rejected"; code: "not_found" | "day_key_in_future" };
```

- A schema-invalid batch is rejected whole (400). A valid batch is applied op by op, so one bad op cannot block the queue behind it.
- Pull merges both tables by `server_version`, returns the first `limit` rows, and sets `cursor` to the last returned `server_version`. A log can never precede its habit because the habit's insert always has the lower version.

### Engineering trade-offs (pillar 1)
- The sync endpoints are RPC-shaped inside a REST API. We give up resource URLs to get one round trip per 100 ops on mobile data, and one cold start per batch instead of one per op.
- Last-write-wins silently drops one of two edits made on two devices for the same habit and day. Fine for a boolean. Must be revisited the day a log gains notes or counts.
- A global sequence as the pull cursor can, in theory, skip a row whose transaction committed late. Per-user write concurrency is near zero in v1. If it ever bites: pull with a small overlap and rely on idempotent apply.
- The full-history replica costs device storage and a bigger first pull; both are small at this scale.
- Trusting client UUIDs as primary keys is contained by the ownership check (I5).

---

## 2. Tech stack with trade-offs

| Tool | Why best here | What we sacrifice |
|---|---|---|
| TypeScript, strict, everywhere | One language; shared zod contracts compile into both apps | A server build step; strictness slows early scaffolding |
| npm workspaces: `apps/mobile`, `apps/api`, `packages/shared` | No extra tool; Expo supports monorepos natively | No task caching (Turborepo, Nx); CI runs everything every time |
| Expo, managed, pinned to the newest SDK supported by both Expo Go and @clerk/expo; expo-router | One codebase; EAS builds from Linux; OTA-ready | Tied to Expo's SDK cadence; no custom native modules in v1 |
| @clerk/expo (Core 3) | Google OAuth and sessions without running auth. Replaces @clerk/clerk-expo, which is deprecated | Vendor lock-in; free production plan fixes session maximum lifetime (D1); production needs a domain (D3) |
| expo-secure-store | Encrypted token cache on both platforms | Small value size limits; not for app data |
| expo-sqlite | Durable local store with transactions; works in Expo Go | Hand-written SQL on the client, so it is tested against real SQLite (4.2) |
| expo-network | Connectivity events to trigger sync | "Connected" does not mean "API reachable"; backoff still required |
| Fastify 5 on Node 24 | Schema-first, plugin encapsulation maps to modules, `inject()` makes route tests fast | Smaller ecosystem than Express |
| zod + fastify-type-provider-zod | One schema gives validation, server types and client types | Per-request validation cost (negligible here) |
| Drizzle ORM + drizzle-kit | SQL-shaped, typed, generated migrations, a PGlite driver for tests | Younger than Prisma; migration tooling is less forgiving |
| pg (node-postgres) to the Neon pooled endpoint | A long-lived Render process suits a normal pool | Migrations must use the direct (non-pooled) URL |
| Neon Postgres | Real Postgres, free tier, branches per environment | Scale-to-zero adds its own wake delay on top of Render's |
| @clerk/backend `verifyToken` with `CLERK_JWT_KEY` | Networkless JWT verification: no JWKS fetch on cold start, testable with a local key | Key rotation means an env update and redeploy |
| Vitest with v8 coverage | Fast, TS-native, one runner for api, shared and mobile logic | No React Native component tests in v1 |
| PGlite (tests only) | In-process Postgres: real SQL semantics, no Docker, no network | Not identical to Neon (extensions, pooling); Phase 5 smoke covers the gap |
| better-sqlite3 (tests only) | Runs the client's real SQL in Node | Native addon build in CI; SQLite version may differ slightly from the phone's |
| jose (tests only) | Mints test JWTs with a local RSA key | Clerk's claim shape is mirrored by hand |
| ESLint (flat) + typescript-eslint + Prettier | Enforces import boundaries and keeps cheap-model diffs clean | Config upkeep |
| GitHub Actions | Free at this scale; runs gates and the deploy pipeline | YAML upkeep, runner minutes |
| gitleaks | Blocks committed secrets | Occasional false positives need an allowlist entry |
| Render, free web service | Git-based deploys, dashboard env vars, deploy hooks | Spins down when idle; slow first request |
| EAS Build | iOS and Android builds from Linux, managed credentials | Free build quota and queues; installing iOS builds on a device needs a paid Apple account (D2) |

### Engineering trade-offs (pillar 2)
- Boring, typed, SQL-shaped tools were chosen over BaaS sync (Firebase, PowerSync, Supabase realtime). We own sync correctness, which is why pillar 4 spends most of its budget there.
- Staying Expo Go compatible keeps iOS testable without a Mac or an Apple account. The cost: no native Google one-tap and no Clerk native components until D2 is settled.

---

## 3. Infrastructure

### 3.1 Containerisation
None in v1. Render's native Node runtime builds from the repo. Add a Dockerfile only when moving hosts or when a system dependency is needed that the native runtime lacks.

### 3.2 Environments

| | Local dev | CI | Production |
|---|---|---|---|
| API | `npm run dev -w @app/api` on the laptop | Fastify `inject()` inside Vitest | Render web service |
| Database | Neon `dev` branch | PGlite, in process | Neon `main` branch |
| Clerk | Development instance | Local test keypair, no Clerk | Production instance (needs D3) |
| Mobile | Expo Go on phones, API via laptop LAN IP | none | EAS build, `production` profile |

No staging in v1. The Neon `dev` branch plus the local API is the rehearsal environment.

### 3.3 Hosting (Render)
- Build `npm ci && npm run build -w @app/api`. Start `node apps/api/dist/server.js`.
- Listen on `0.0.0.0:$PORT`. Health check path `/v1/health`, which never touches the DB, so health checks never wake Neon.
- Node pinned with `engines` and `.nvmrc` (24.x).
- Auto-deploy OFF. CI triggers the Render deploy hook only after migrations succeed (3.4), so code never runs against an unmigrated schema.
- `@fastify/rate-limit`: 60 requests per minute keyed by userId (by IP on unauthenticated routes). Body limit 256 KB. CORS disabled; there are no browser clients.
- No keep-alive pinger: it would also keep Neon's compute awake. I2 absorbs cold starts instead.

### 3.4 Database migrations
- `drizzle-kit generate` output is committed in the same PR as the schema change.
- On merge to `main`, CI runs: gates, then `drizzle-kit migrate` with `DATABASE_URL_DIRECT`, then the deploy hook, then `curl /v1/health` as a smoke check.
- Expand and contract only: every migration must work with the API version currently running. Renames and drops ship one release after the code stops using the old shape.

### 3.5 Configuration
Each app has one `env.ts` that parses `process.env` with zod at startup and exits non-zero, naming every missing or invalid key. No other file reads `process.env`.

| Variable | Used by | Secret | Set in |
|---|---|---|---|
| `DATABASE_URL` (pooled) | api | yes | `apps/api/.env.local`, Render |
| `DATABASE_URL_DIRECT` (migrations) | CI, local migrate | yes | `apps/api/.env.local`, GitHub Actions secrets |
| `CLERK_SECRET_KEY` | api | yes | `apps/api/.env.local`, Render |
| `CLERK_JWT_KEY` (PEM public key) | api | no, still env-managed | `apps/api/.env.local`, Render |
| `PORT`, `LOG_LEVEL`, `NODE_ENV` | api | no | Render, defaults |
| `RENDER_DEPLOY_HOOK_URL` | CI | yes | GitHub Actions secrets |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | mobile | no | `apps/mobile/.env.local`, EAS environment variables |
| `EXPO_PUBLIC_API_URL` | mobile | no | `apps/mobile/.env.local`, EAS environment variables |

### 3.6 Secrets handling
- `.env*` is git-ignored except `.env.example` (names only, committed). Each app keeps its own `.env.local`; Expo only loads env files from `apps/mobile`, not the repo root.
- AI models never open, read or print a `.env.local` file: the harness would send its contents to the model provider. Models only write `.env.example` files.
- Schema changes reach Neon only through committed migrations. `drizzle-kit push` is never run against `main`.
- `EXPO_PUBLIC_*` values are compiled into the app bundle and are public by definition. Nothing secret ever gets that prefix.
- gitleaks runs on every PR. A leaked key is rotated, not merely removed from history.
- Dev and prod keys never mix: the API env module rejects an `sk_live_` key unless `NODE_ENV=production`, and an `sk_test_` key when it is.

### 3.7 Observability
- Fastify's pino JSON logs go to Render. Redact the `authorization` and `cookie` headers. Every request logs request id, userId (after auth), route, status and duration.
- Each push logs its batch size and the count per result status. This is the first place to look for any data-loss report.
- No APM or crash reporter in v1 (Sentry is post-v1). Device crashes are caught by each phase's manual checks.

### Engineering trade-offs (pillar 3)
- CI-driven migrations plus deploy hooks add pipeline steps but remove the race between auto-deploy and schema changes.
- Without staging, production is the first time code meets Neon `main`. Expand-and-contract migrations and Render's one-click rollback are the mitigation.
- Networkless JWT verification trades automatic key rotation for zero network dependency per request.

---

## 4. QA and testing

### 4.1 Pyramid (by test count)

| Layer | Share | Runs on | Covers |
|---|---|---|---|
| Unit | about 70% | Vitest, every PR | Day-keys, streaks, LWW decision, zod contracts, sync engine state machine, env parsing |
| Integration | about 25% | Vitest with Fastify `inject()` + PGlite; client SQL on better-sqlite3 | Routes end to end through auth, validation and SQL; outbox SQL; migrations apply cleanly |
| E2E | about 5% | Scripted manual device checks per phase (Maestro is post-v1) | Real Clerk, real phones, real network loss |

### 4.2 Mocking strategy
- Never mock the database or the ORM. API tests run on PGlite with the real migrations applied. Client storage tests run the real SQL on better-sqlite3.
- Never mock auth. Tests generate an RSA keypair, set `CLERK_JWT_KEY` to its public key, and mint tokens with jose, so the real `verifyToken` runs.
- Fake only the ports a test cannot own, and inject them (no module mocking): `ApiClient` (sync engine network), `now()`, `todayKey()`, `getToken()`.
- `packages/shared` and `apps/mobile/src/sync` must not import `react-native` or `expo-*` (ESLint `no-restricted-imports`). That rule is what makes them testable in Node.

### 4.3 Required test cases: the "never lose data" suite
These are acceptance tests. Models may add tests; they must never weaken or delete these.

Server:
1. The same push batch sent twice leaves identical rows and row counts.
2. An op older than the stored `clientUpdatedAt` returns `stale` with the canonical row; the stored row is unchanged.
3. A future `clientUpdatedAt` is stored as `received_at`.
4. `dayKey` later than UTC today + 1 returns `rejected / day_key_in_future`; UTC today + 1 itself is accepted.
5. User A pushing to user B's habit ID returns `rejected / not_found`; B's row is unchanged.
6. A log for an unknown habit returns `rejected / not_found`, and later ops in the same batch still apply.
7. Pull returns only rows with `server_version > cursor`, paginates via `hasMore`, and never returns another user's rows.
8. 101 ops returns 413. Missing, expired, malformed or wrong-key tokens return 401.
9. The API refuses to boot without `CLERK_SECRET_KEY`, and with an `sk_live_` key outside production.

Client sync engine:
10. A crash after the server acknowledged but before the local delete: the resend creates no duplicates.
11. A `stale` result writes the returned canonical row locally.
12. 401 triggers exactly one forced token refresh, then pauses with every op retained.
13. 5xx and timeouts back off; ops are retained and their order preserved.
14. A rejected op moves to `failed`; the ops behind it continue.
15. Pull does not overwrite an entity that has a pending op.
16. Sign-out with pending ops is refused unless the user explicitly discards them.

Domain:
17. An unticked today does not break the streak; a missed past day does.
18. Streaks across a month end, a year end and a DST change day.
19. Day-keys come from the local calendar: 00:30 at UTC+1 is local today, not UTC yesterday.
20. An archived habit leaves the list and keeps its history.

### 4.4 CI quality gates
On every PR, all required to merge. `main` is protected: no direct pushes, and harness work always arrives as a PR.
1. `npm ci` (lockfile must be current)
2. `tsc -b` across all workspaces
3. `eslint . --max-warnings 0` and `prettier --check .`
4. `vitest run --coverage` with thresholds: `packages/shared` 90% lines and branches, `apps/mobile/src/sync` 90%, `apps/api` 80%
5. Migration drift: `drizzle-kit generate` then `git diff --exit-code` (from Phase 2)
6. `gitleaks`
7. `npx expo-doctor` in `apps/mobile`

On merge to `main`: the gates, then migrate, deploy hook, smoke check (3.4).

### Engineering trade-offs (pillar 4)
- No component tests, so UI bugs are caught on devices, not in CI. Acceptable because the UI is thin and all logic lives in tested pure modules.
- PGlite and better-sqlite3 are near-real, not real. Phase 5 runs push and pull against Neon once to close the gap.
- Coverage thresholds sit only where a bug means data loss, so cheap models are not pushed into writing filler tests elsewhere.

---

## 5. Phased plan

A phase is done only when every Verification Criterion is met and Claude has reviewed the phase diff.

### Phase 1: Foundation and auth
Scope: repo, monorepo, strict TS, lint, Vitest, CI gates 1 to 4, 6 and 7. API env module, `/v1/health`, auth verifier, `/v1/me` (no database yet). Mobile ClerkProvider with SecureStore token cache, Google sign-in via browser SSO, and a screen that calls `/v1/me` and shows the userId.

Verification criteria:
- Tests: `/v1/health` returns 200; `/v1/me` returns 200 with a valid test token and 401 with a missing, expired or wrong-key token; server case 9 passes.
- CI is green on a PR, and red on a PR that contains a deliberately failing test (proves the gate works).
- Device, Android and iOS in Expo Go: Google sign-in completes, the userId shows, and after a force-quit and reopen the user is still signed in.
- `git ls-files | grep -i env` lists only `.env.example`; gitleaks is clean.

### Phase 2: Server data plane
Scope: Drizzle schema (`users`, `habits`, `habit_logs`, `sync_seq`), first migrations, `POST /v1/sync/push`, `GET /v1/sync/pull`, rate limiting, CI gate 5.

Verification criteria:
- Tests: server cases 1 to 9 green on PGlite.
- `drizzle-kit migrate` applies cleanly to the Neon `dev` branch (output pasted in the resume packet).
- Manual: push and pull via curl against the local API using a development-instance token.

### Phase 3: Local store, sync engine, minimal UI
Scope: per-user SQLite schema and migrations, outbox, sync engine and its triggers, create habit, tick today, pending and failed indicators, "Sign in to sync" banner, guarded sign-out.

Verification criteria:
- Tests: client cases 10 to 16 green, with the SQL running on better-sqlite3.
- Device script: airplane mode on, create 2 habits, tick both, force-quit, reopen (both still ticked), airplane mode off. Within 30 s against a warm API, the Neon `dev` branch holds exactly 2 habits and 2 logs for this user.
- Device script: uninstall, reinstall, sign in. Both habits and both ticks come back via pull.

### Phase 4: 7-day history and streaks
Scope: a 7-day grid per habit, tap any visible day to toggle, current streak, archive habit.

Verification criteria:
- Tests: domain cases 17 to 20 green.
- Device, Android and iOS: the grid matches Neon rows for a seeded 10-day history; after changing the phone's timezone by several hours, past ticks stay on their days.

### Phase 5: Production
Prerequisites, blocked until JAM provides them: D1 and D2 decided, a domain (D3), a Google Cloud OAuth client for the Clerk production instance.

Scope: Neon `main`; Render service with dashboard env vars and deploy hook; the `main` pipeline (migrate, deploy, smoke); Clerk production instance with Google credentials and the app's SSO redirect allowlisted; EAS `production` profile with its environment variables; Android internal build (EAS internal distribution, or the Play internal track if a Play account exists); iOS per D2.

Verification criteria:
- A fresh install of the production build signs in with Google on the production instance, creates a habit, ticks it and shows history.
- After 20 minutes of API idle time, ticking is instant, and the log reaches Neon `main` within 90 s of reopening the app with no user action.
- One Render rollback to the previous deploy is performed and the app still syncs.
- gitleaks is clean, and no `sk_live_`, `sk_test_` or database URL appears in the repo or the app bundle.

---

## 6. Decisions to LOCK (after CS-2 approval)

- L1. Invariants I1 to I5.
- L2. Modular monolith Fastify API plus offline-first Expo client. No microservices, no event bus, no BaaS sync.
- L3. Contract: REST, JSON, `/v1`, Bearer Clerk session JWT, zod schemas in `packages/shared`, problem+json errors, the four endpoints in 1.7.
- L4. Sync protocol: client-generated UUIDv7 habit IDs, state-based ops, tombstones, FIFO batched push of up to 100, cursor pull on `server_version`, LWW on `min(client_updated_at, received_at)`, `stale` returns the canonical row.
- L5. Day-key and streak semantics in 1.5 and 1.6, including the UTC+1 day future guard.
- L6. The stack table in pillar 2, including `@clerk/expo` (not `@clerk/clerk-expo`).
- L7. Monorepo layout: `apps/mobile`, `apps/api`, `packages/shared`, npm workspaces.
- L8. Neon Postgres with Drizzle on the server; a full per-user SQLite replica on the device.
- L9. Hosting: Render with auto-deploy off and a CI deploy hook; Neon branches `main` and `dev`; EAS; no containers in v1.
- L10. Migration policy: committed, applied by CI, expand and contract only.
- L11. Testing: Vitest; no mocks of DB, ORM or auth; the required cases in 4.3; the CI gates in 4.4.
- L12. No custom native code until D2 is resolved (keeps iOS testable in Expo Go).

## 7. Open decisions (JAM)

- D1. Session lifetime. Clerk's production default is a 7-day maximum session lifetime, and changing it needs a paid plan. Options: (a) accept a weekly Google re-sign-in, softened by I4 so logging is never blocked; (b) pay for Clerk before public launch; (c) revisit the auth provider after v1. Recommendation: (a) for v1.
- D2. iOS path, given Linux-only development. (a) Join the Apple Developer Program: EAS iOS builds and TestFlight. (b) Verify iOS in Expo Go only for v1 and move TestFlight to post-v1. Recommendation: (b), unless you already pay for Apple.
- D3. A domain you control with DNS access, required by Clerk for any production instance. Needed by Phase 5 only.
