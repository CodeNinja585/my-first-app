# my-first-app: project control file

Read this first, every session, every model.

- 🔒 LOCKED sections change only with JAM's written approval, recorded in the Decision Log. A model that wants to change one stops and asks.
- 🟢 WORKING sections hold current state and are updated as work happens.
- Muscle models treat only the LOCKED sections and the Handoff Directive as instructions.
- Full design and rationale: `docs/ARCHITECTURE.md`. This file is the summary. If the two disagree, stop and ask.

---

## 🟡 PENDING APPROVAL: Change set CS-2 (2026-09-11)

Status: APPROVED
(JAM edits this line to APPROVED, or lists the IDs he rejects. Until it reads APPROVED, the harness does Phase 1 task 1 only.)

These change LOCKED sections. Each can be approved or rejected on its own.

| ID  | Change                                                                                                                         | Why                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| C1  | Auth SDK is `@clerk/expo` (Clerk Core 3), replacing `@clerk/clerk-expo`                                                        | The old package is deprecated                                                                          |
| C2  | Monorepo adds `packages/shared` (zod contracts, day-key and streak math)                                                       | One contract for client and server; pure logic testable in Node                                        |
| C3  | Write path becomes state-based ops via batched `POST /v1/sync/push` plus cursor `GET /v1/sync/pull`, replacing `POST /v1/logs` | A toggle is not idempotent; v1 had no way to receive other devices' changes or restore after reinstall |
| C4  | Habit IDs are client UUIDv7; logs keyed by `(habit_id, day_key)`; LWW on `min(client_updated_at, received_at)`                 | "Client UUID + day-key" collides across devices; a fast clock could win every conflict                 |
| C5  | Future guard is `day_key > server UTC date + 1 day`                                                                            | "Reject future" measured in UTC rejects real logs from users ahead of UTC (Nigeria, 00:00 to 01:00)    |
| C6  | Client keeps full history in a per-user SQLite file, not a 7-day window                                                        | Streaks longer than 7 days need it                                                                     |
| C7  | New invariant: auth expiry pauses sync but never blocks logging                                                                | Clerk's free production plan caps sessions at 7 days (D1)                                              |
| C8  | No custom native code in v1; iOS verified in Expo Go until D2 is decided                                                       | Linux-only development; installing iOS builds needs a paid Apple account                               |
| C9  | CI applies migrations, then triggers Render via deploy hook; Render auto-deploy off                                            | Code never runs against an unmigrated schema                                                           |
| C10 | Test databases are PGlite (API) and better-sqlite3 (client SQL); auth tested with a local keypair instead of a mocked JWKS     | Real SQL and real token verification, no network                                                       |
| C11 | Definition of done and non-negotiable rules tightened (below)                                                                  | Guard rails for cheap-model work                                                                       |

---

## 🔒 LOCKED: Project Identity

Project name: my-first-app

One sentence purpose:
A mobile app (iOS and Android via Expo) that helps people build consistency: sign in with Google, tick daily habits, and see a 7-day history and current streak instantly.

Who uses it and what they must never experience:
Students and individuals building routines without bloated productivity tools. They must never experience friction or data loss: a logged habit that disappears (bad sync, reinstall, sign-out, new phone), a tap that waits on the network, or being forced to sign in again and again.

Definition of done for v1:

- Functional: Google sign-in; create and archive habits; tick today and any of the last 7 days; 7-day history and current streak; everything works offline.
- Quality: invariants I1 to I5 hold; the required test cases (ARCHITECTURE 4.3) and CI gates (4.4) are green; no red screens and clean Metro logs during device checks; Claude has reviewed every phase diff.
- Verification: all Phase 1 to 5 criteria met on Android and iOS (iOS path per D2).
- Release: API live on Render with dashboard env vars; Android internal build via EAS; iOS via TestFlight if D2 is "Apple account", otherwise Expo Go verification only. Public store listing is post-v1.

---

## 🔒 LOCKED: Architecture and Stack

Summary only. Data model, contract and rationale: `docs/ARCHITECTURE.md`.

Invariants:

- I1 A tap is committed to local SQLite (row + outbox op, one transaction) before the UI reflects it.
- I2 Logging and viewing never wait on the network.
- I3 Every server write is idempotent; replays change nothing.
- I4 Auth expiry pauses sync; it never blocks logging or deletes local data.
- I5 Identity comes only from the verified JWT `sub`; every client-sent ID is ownership-checked.

Architecture style: modular monolith Fastify API plus offline-first Expo client. No microservices, no event bus, no BaaS sync in v1.

State boundaries: Clerk owns identity and sessions. API plus Neon own canonical habits and logs. The client owns a full per-user SQLite replica, the outbox and the sync cursor.

Write path: tap -> one SQLite transaction (row + outbox op) -> UI updates -> sync engine pushes FIFO batches of up to 100 ops to `POST /v1/sync/push` -> per-op result (`applied`, `stale` with the canonical row, or `rejected`) -> `GET /v1/sync/pull?cursor=` by `server_version`.

Conflicts: ops carry state (`done` true or false; archive is a tombstone; nothing is hard-deleted). Last-write-wins per `(habit_id, day_key)` and per habit ID on `min(client_updated_at, received_at)`. Replays are no-ops.

Day-keys: taken from the local calendar at tap time and never recomputed. The server rejects `day_key > server UTC date + 1`.

Domain: daily yes/no habits only. History is the 7 local day-keys ending today. The streak ends today, or yesterday if today is not ticked yet.

API contract: REST, JSON, `/v1`, `Authorization: Bearer <Clerk session JWT>`, zod schemas in `packages/shared`, problem+json errors. Endpoints: `GET /v1/health`, `GET /v1/me`, `POST /v1/sync/push`, `GET /v1/sync/pull`.

Language and framework: TypeScript strict everywhere.

- Client: Expo (managed, SDK pinned, Expo Go compatible, `ios/` and `android/` generated and never committed), expo-router, `@clerk/expo`, expo-secure-store, expo-sqlite, expo-network.
- Server: Fastify 5 on Node 24, zod, Drizzle, pg, `@clerk/backend` (networkless `verifyToken`).
- Monorepo: npm workspaces with `apps/mobile`, `apps/api`, `packages/shared`.

Database: Neon Postgres (branches `main` and `dev`) via Drizzle; relational data, free tier. Device: expo-sqlite, one file per user.

Auth: Clerk via `@clerk/expo`, Google OAuth through browser SSO, token cache in SecureStore, `getToken()` right before every request. Reason on record for possibly differing later: the 7-day session cap (D1).

Testing: Vitest. PGlite and better-sqlite3 as test databases. Auth tested with a local RSA keypair. No mocks of the DB, the ORM or auth.

Hosting: API on Render free web service, auto-deploy off, deployed by CI through a deploy hook after migrations. Mobile via EAS. No containers in v1.

Trade-offs accepted:

- Render and Neon cold starts (the first request can take about a minute); absorbed by I2 and a 75 s first-request timeout.
- LWW can drop one of two edits made on two devices for the same habit and day; fine for a boolean.
- Client clocks can be wrong; mitigated by capping the effective timestamp at `received_at` and the UTC+1 day guard.
- We own sync logic and ops instead of using a BaaS.
- No staging; expand-and-contract migrations and Render rollback instead.
- No component tests and no automated E2E in v1; scripted device checks per phase.

Out of v1 (do not build): reminders and push notifications (n8n candidate), Maestro E2E, native Google one-tap and Clerk native components, Sentry, counts or notes on logs, weekly or custom schedules, social features, web app, Dockerfile, staging. Required before any public store listing: in-app account deletion, and Sign in with Apple on iOS.

---

## 🔒 LOCKED: Non-Negotiable Rules

1. Done means typecheck, lint and the full test suite pass locally and in CI. No exception for "small" changes.
2. One atomic change per commit. Multi-file changes only inside an approved task.
3. No placeholder code: no TODOs, stubs or commented-out code in shipped paths.
4. Any change to a LOCKED section: stop, request JAM's approval, record it in the Decision Log.
5. Never weaken, skip or delete a test to get green. The required cases in ARCHITECTURE 4.3 are untouchable.
6. No new dependency unless it appears in the ARCHITECTURE pillar 2 table. Otherwise stop and ask. Record each added dependency's version in the resume packet.
7. Contract first: an API change starts in `packages/shared` schemas and their tests, then the implementation.
8. Schema changes only through committed Drizzle migrations that work with the API version currently running. Never `drizzle-kit push` against `main`.
9. Models never open, read or print any `.env.local` file (the harness would send it to the model provider). Models only write `.env.example` files.
10. Never commit secrets. Never `git add .` or `git add -A`; stage explicit paths. Only non-secret `EXPO_PUBLIC_*` values may reach the app bundle.
11. `packages/shared` and `apps/mobile/src/sync` never import `react-native` or `expo-*`.
12. Manual (device) checks are never marked passed by a model. They are recorded as NEEDS JAM.
13. Cost rule: bulk work runs on the cheap model, not on Kimi K3 or Claude.

---

## 🟢 WORKING: Open Decisions (JAM)

| ID  | Decision                                 | Options                                                                                                    | Recommendation                        | Needed by |
| --- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------- |
| D1  | Session lifetime                         | (a) accept weekly Google re-sign-in, softened by I4; (b) paid Clerk plan; (c) change auth provider post-v1 | (a) for v1                            | Phase 5   |
| D2  | iOS path without a Mac                   | (a) Apple Developer Program, EAS iOS builds, TestFlight; (b) Expo Go only for v1                           | (b), unless you already pay for Apple | Phase 5   |
| D3  | Domain for the Clerk production instance | Any domain with DNS access                                                                                 | Buy or reuse one before Phase 5       | Phase 5   |

---

## 🟢 WORKING: Human-Only Steps (models cannot do these)

- Now: top up OpenRouter credits (blocking Phase 1). Approve or amend CS-2.
- After task 2: move the Clerk keys out of `/home/don/The-final-beginning/Personal-projects/my-first-app/.env.local`: publishable key to `apps/mobile/.env.local`, secret key and JWT public key to `apps/api/.env.local`.
- Before task 5: create the GitHub repo, push, and protect `main` (require PR and green CI).
- Before task 7: in the Clerk dashboard, enable Google as a social connection.
- Phase 2: create the Neon project and `dev` branch; set `DATABASE_URL` and `DATABASE_URL_DIRECT` in `apps/api/.env.local`.
- Every phase: run the device checks marked NEEDS JAM and paste the results into the resume packet.
- Before Phase 5: decide D1 and D2; get the domain (D3); create a Google Cloud OAuth client for Clerk production; Play Console account if using the Play internal track.

---

## 🟢 WORKING: Model Routing For This Project

| Role                                                           | Model                         |
| -------------------------------------------------------------- | ----------------------------- |
| Planner and reviewer (reviews every phase diff)                | Claude                        |
| Default muscle                                                 | Qwen3-Coder-Next (OpenRouter) |
| Backup muscle                                                  | DeepSeek V4 Flash             |
| Escalation (hard, well-defined bugs, only when Claude says so) | Kimi K3                       |
| Local muscle                                                   | None (no GPU)                 |
| Harness                                                        | DeepSeek Harness (dsh)        |

---

## 🟢 WORKING: Phase Tracker

Full scope and criteria: ARCHITECTURE section 5.

| Phase | Goal                                                                      | Verification criteria (summary)                                                                                                | Status                                           |
| ----- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| 1     | Foundation and auth: monorepo, CI, `/v1/health`, `/v1/me`, Google sign-in | Auth tests green; CI green, and red on a failing-test PR; sign-in survives force-quit on Android and iOS                     | open (M-FIX directive)                           |
| 2     | Server data plane: schema, migrations, push and pull                      | Server cases 1 to 9 green on PGlite; migration applies to Neon `dev`                                                           | not started                                      |
| 3     | Local store, sync engine, minimal UI                                      | Client cases 10 to 16 green; airplane-mode script gives exactly 2 habits and 2 logs; reinstall restores data                   | not started                                      |
| 4     | 7-day history and streaks                                                 | Domain cases 17 to 20 green; grid matches Neon; timezone change keeps ticks on their days                                      | not started                                      |
| 5     | Production                                                                | Prod build signs in, logs, shows history; logs sync after a cold start; rollback drill; no secrets anywhere                    | not started (needs D1, D2, D3)                   |

---

## 🟢 WORKING: Decision Log

| Date       | Decision                                     | Status          |
| ---------- | -------------------------------------------- | --------------- |
| 2026-09-10 | Architecture v1 signed off and LOCKED        | approved        |
| 2026-09-11 | Architecture v2: change set CS-2 (C1 to C11) | approved by JAM |

---

## 🟢 WORKING: Improvement Pipeline (post-v1)

Process: idea -> Claude writes a one-paragraph plan stating which LOCKED items it touches -> JAM approves -> it becomes a numbered phase (6, 7, ...) with verification criteria. One improvement in flight at a time; never start one while a v1 phase is open.

Ideas: (brainstorm session pending)

---

## Skills for this project (the Addy Osmani atomic pattern)

Keep a `skills/` folder in the repo and reference these in the harness:

- workspace_inspection: read-only map of the relevant files before any edit.
- atomic_modification: one function or module per change.
- contract_first: change `packages/shared` schemas and their tests before any code that uses them.
- verification_loop: run typecheck, lint and tests immediately after every edit.
- state_rollback: on failure, `git restore .` and `git clean -fd` back to the last commit. Never force-push, never rewrite history.

---

## Pre-Flight Engineering Briefing

Run on 2026-09-11 (version 2). Output: `docs/ARCHITECTURE.md`. Re-run only for a major redesign; its results change LOCKED sections and need approval.

---

## ⭐ HANDOFF DIRECTIVE

The instruction set the harness and cheap models follow while Claude is not available. Claude rewrites it at the end of every working session. Most important block in this file.

```text
==================== HANDOFF DIRECTIVE ====================
Written by: Claude
Date / session: 2026-09-11, architecture v2 session
Current phase: Phase 1 of 5

READ FIRST: my-first-app.md (this file), then docs/ARCHITECTURE.md.

DO NOT START UNTIL: OpenRouter credits are topped up.
GATE: if the CS-2 status line is not APPROVED, do task 1 only, then stop
and produce a resume packet.

WHAT IS DONE AND VERIFIED:
- Architecture v2 written (docs/ARCHITECTURE.md). CS-2 awaiting JAM.
- Clerk development instance exists; keys are in /home/don/The-final-beginning/Personal-projects/my-first-app/.env.local
  (uncommitted). Never open this file.
- No code exists yet. Nothing is test-verified yet.

LOCKED CONSTRAINTS YOU MUST NOT CHANGE:
- Everything under the LOCKED headings in this file, and invariants I1 to I5.
- The dependency list in ARCHITECTURE pillar 2. Anything else: stop and ask.
- Package is @clerk/expo. Never install @clerk/clerk-expo.
- Only src/config/env.ts in each app reads process.env.
- All Non-Negotiable Rules. If a task seems to need a LOCKED change, STOP.

NEXT TASKS, IN ORDER (one at a time, one commit each):
1. Repo init. In /home/don/The-final-beginning/Personal-projects/my-first-app, create .gitignore FIRST with: .env*,
   !.env.example, node_modules/, .expo/, dist/, coverage/, *.log, *.db,
   apps/mobile/ios/, apps/mobile/android/. Then git init. Add
   docs/ARCHITECTURE.md (given). Stage my-first-app.md, .gitignore, docs/, skills/
   by explicit path and commit.
   Verify: `git check-ignore -v .env.local` prints a match;
   `git status --short` is empty.
2. Root workspace. package.json (private, workspaces ["apps/*","packages/*"],
   engines node 24.x, scripts typecheck/lint/format:check/test), .nvmrc (24),
   tsconfig.base.json (strict, noUncheckedIndexedAccess), eslint.config.js
   (flat, typescript-eslint, no-restricted-imports of react-native and expo-*
   for packages/shared/** and apps/mobile/src/sync/**), .prettierrc,
   vitest.config.ts (one project per workspace). packages/shared exporting
   isValidDayKey(s: string): boolean with tests (valid date; 2026-02-30
   invalid; wrong format invalid).
   Verify: npm run typecheck && npm run lint && npm test all pass.
   Then tell JAM to move the Clerk keys (human-only step).
3. API skeleton. apps/api: Fastify 5, TS compiled to dist. .env.example
   with the api names from ARCHITECTURE 3.5, no values. src/config/env.ts
   (zod; exits non-zero naming missing keys; rejects sk_live_ unless
   NODE_ENV=production and sk_test_ when it is). buildApp() factory separate
   from server.ts, which listens on 0.0.0.0:$PORT. GET /v1/health returns
   { status: "ok", version } without touching any database.
   Tests (inject): health 200; env fails without CLERK_SECRET_KEY; sk_live_
   rejected outside production.
   Verify: tests green; `curl localhost:3000/v1/health` returns 200.
4. Auth. verifyAccessToken(token) wrapping @clerk/backend verifyToken with
   jwtKey from env (networkless). Fastify preHandler for protected routes.
   GET /v1/me returns { userId } from the token sub. Tests: generate an RSA
   keypair, mint tokens with jose (sub, sid, iat, nbf, exp); 200 valid; 401
   for missing, expired, malformed and wrong-key tokens. Do not mock
   verifyToken.
   Verify: tests green.
5. CI (needs the GitHub remote; if missing, do task 6 first and note it).
   .github/workflows/ci.yml on pull_request: npm ci, tsc -b,
   eslint --max-warnings 0, prettier --check, vitest run --coverage, gitleaks.
   Verify: a PR is green; a second PR with a deliberately failing test is
   red, then closed unmerged.
6. Mobile scaffold. apps/mobile from the Expo default TypeScript template
   (expo-router), pinned to the newest SDK supported by BOTH Expo Go and
   @clerk/expo. Delete its own lockfile; install from the root.
   .env.example with the mobile names from ARCHITECTURE 3.5.
   src/config/env.ts for EXPO_PUBLIC_* vars. Add `npx expo-doctor`
   (in apps/mobile) to CI.
   Verify: expo-doctor passes; `npx expo start` boots with no red screen.
7. Sign-in. ClerkProvider (publishableKey from env) with the @clerk/expo
   SecureStore token cache. Set `scheme` in the app config. Sign-in screen
   with a Google button using browser SSO (useSSO); no native sign-in hooks
   or native components. Signed-in screen calls GET /v1/me with getToken()
   called right before the request and shows the userId.
   EXPO_PUBLIC_API_URL = the laptop's LAN IP, not localhost.
   Verify: typecheck passes; Metro shows no errors. Then STOP. Device check
   is NEEDS JAM: Android and iOS in Expo Go, sign in, userId shown,
   force-quit and reopen, still signed in.

FOR EACH TASK, THE LOOP IS:
- Inspect the relevant files first (read only).
- Make one atomic change.
- Run typecheck, lint and the full test suite.
- Pass: commit with explicit paths and a message naming the task number.
- Fail: roll back and record the error for the resume packet.

STOP AND WAIT FOR CLAUDE IF:
- A task would change a LOCKED item or add an unlisted dependency.
- Requirements are ambiguous or a decision is needed.
- A task needs a secret value or a human-only step.
- Official Clerk, Expo or Fastify docs contradict this directive.
- The same task fails twice in a row.
- You are tempted to make an architectural or cross-cutting change.
- Requests fail with HTTP 402 (credits exhausted). Stop, do not retry.
Escalate a hard, well-defined bug to Kimi K3 ONCE before stopping. Bulk or
boilerplate work never escalates; it stays on the cheap model.

WHEN YOU STOP, fill in the Resume Packet template below.
=========================================================
```

---

## 🟢 WORKING: Resume Packet (latest)

---

Date: 2026-09-14 / qwen/qwen3-coder-next / harness web
Tasks attempted: M-FIX directive (fix/mobile-entry branch)
passed: M1, M2, M3, M4 | failed: none
Final output of typecheck, lint, format:check, vitest:
- typecheck: ✅ passed (tsc -b --noEmit)
- lint: ✅ passed (eslint . --max-warnings 0)
- format:check: ✅ passed (prettier --check .)
- vitest: ✅ passed (31 tests across 4 test files)
FAILED detail (task: error, what was tried, rolled back? y/n): none
NEEDS JAM (manual checks, with exact steps):
- Device check on fix/mobile-entry branch: Android and iOS in Expo Go, Google sign-in completes, userId shows, sign out works
Versions pinned:
- Expo SDK: ^54.0.0 (apps/mobile/package.json)
- @clerk/expo: ^4.6.6 (apps/mobile/package.json)
- Fastify: ^5.2.0 (apps/api/package.json)
- zod: ^3.23.8 (apps/api/package.json)
- Vitest: ^1.6.1 (package.json, apps/api/package.json)
- @clerk/backend: ^3.17.2 (apps/api/package.json - production verification)
Commits (hash: message):
- 8ff7cd7: "fix(mobile): enable new architecture for SDK 57"
- ad2c490: "fix(mobile): ClerkProvider with SecureStore cache, SSO sign-in, me screen"
- 16da16d: "fix(mobile): wire expo-router entry, mount placeholder screen"
PR: https://github.com/CodeNinja585/my-first-app/pull/3
Blocked on (one specific question each): none
Human-only steps now needed:
- Perform device check on fix/mobile-entry branch per M-FIX directive

(End of file - total 366 lines)
