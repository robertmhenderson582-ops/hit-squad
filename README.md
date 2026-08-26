# Hit Squad Project Controls

Private invite-only industrial outage / T&M estimating desk. Field trial — not a release. Confidential.

This is a from-scratch rebuild. Email + password is the only sign-in path. Sessions live in a first-party `HttpOnly` `SameSite=Lax` cookie on this app's own origin. The client confirms `/api/auth/session` returns a user before the desk renders, and the auth gate waits while the session is loading so a pending check cannot remount the Sign in screen.

Owner desk is seeded for **Robert Henderson** (`robertmhenderson582@gmail.com`). Users never see another user's jobs.

## Run locally

Needs Node 20+.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://127.0.0.1:3000/login](http://127.0.0.1:3000/login).

Local owner password is the value in `.env.example` / `.env.local` (`OWNER_PASSWORD`). Do not commit a real password.

## Environment

| Variable | Purpose |
| --- | --- |
| `OWNER_EMAIL` | Seeded owner email |
| `OWNER_NAME` | Seeded owner display name |
| `OWNER_PASSWORD` | Local / field-trial password. Keep it out of git. |
| `AUTH_SECRET` | Signs the session cookie. Use a long random string. |
| `AUTH_COOKIE_SECURE` | `false` on local HTTP. `true` on HTTPS deploys. |
| `TICKET_STORE_PATH` | Optional. Server JSON file for Suggestion Box tickets. Not committed. Local default `data/tickets.json`. On Vercel `/tmp/hit-squad-tickets.json`. |
| `INBOX_STORE_PATH` | Optional. Server JSON file for owner↔tester Inbox. Not committed. Local default `data/inbox.json`. On Vercel `/tmp/hit-squad-inbox.json`. |
| `SEAT_PASSWORD_PATH` | Optional. Extra tester seats plus password hashes. Not committed. Local default `data/seat-passwords.json`. On Vercel `/tmp/hit-squad-seats.json`. |
| `TICKET_SMTP_URL` / `GMAIL_APP_PASSWORD` | Optional. Emails each ticket to owner Gmail (`robertmhenderson582@gmail.com`) — that is the Novus copy — plus a short assessing ack on that same thread. Tester invites go to that tester only. Never madisonltd.com / p66.com. Drive API is not in this repo. No paid database. |

The session cookie is named `hs_session`. It is `HttpOnly`, `Path=/`, `SameSite=Lax`, and `Secure` when `AUTH_COOKIE_SECURE=true` (or when `NODE_ENV=production` unless you force it off).

## Auth contract

1. `POST /api/auth/login` with JSON `{ email, password, acknowledged: true }` — fetch only, no native form POST / 303.
2. Server sets the first-party session cookie and returns `{ user }`.
3. Client then calls `GET /api/auth/session` and waits for `{ user }` before opening the desk.
4. Wrong password stays on `/login` with a visible error. No session cookie is set.
5. A hard refresh re-reads the cookie via `get-session` and stays on the desk.
6. While session status is `loading`, the gate holds. It does not treat `null` as logged out.

## Checks

```bash
npm run build
npm run auth:check
```

`auth:check` starts the production server, proves bad password → error, good password → cookie + session user, and a second session read still authenticated.

## Deploy

One Next.js app (`hitsquad-desk` only). Set the env vars on the host, use HTTPS, and set `AUTH_COOKIE_SECURE=true`. There is no Google sign-in yet.

Seats, Inbox, and Suggestion Box persist as JSON files — the same pattern, not a paid database. Locally they live under `data/` (gitignored). On Vercel they live under `/tmp` so every signed-in seat on the same live instance sees the same threads and tickets. A cold instance / new deploy can empty `/tmp`; the next submit writes the file again. Do not put P66 / Madison books or a Drive vault on the live desk.

Login uses the night-refinery brand hero with HIT SQUAD over PROJECT CONTROLS. After sign-in the desk home is four tiles — Jobs, Estimates, Cost, HSE — plus the estimate/change-order/rate rails. All records stay owner-scoped.

## Rebuild list (do not regress)

- Home (`/`) stays **four tiles**: Jobs / Estimates / Cost / HSE, plus the night-refinery HIT SQUAD / PROJECT CONTROLS hero (New Phillips 66 estimate / Other client / Simple shop job) and Madison plant tiles. Do not replace home with an Estimates-only blotter.
- Header may add Sites, Change orders, Rates (Illinois builder), Quality / ITP, Cost / PPR, New estimate.
- Brand: HIT SQUAD over PROJECT CONTROLS, steel `#0f5f6d`, amber FIELD TRIAL — NOT A RELEASE, Madison confidentiality checkbox, original night-refinery hero.
- Do not touch auth files (`/api/auth/*`, session cookie, AuthGate). No Google/X, no public Create account, no GET-submit login, no `sessionStorage` fake sessions.
- B-1 ingest is parked. Do not invent Submit/ticket permission UI this turn; do not block adding it later.
