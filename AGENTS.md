# AGENTS.md — studio-space-server

Express 5 API for StudioSpace (studio listings + bookings). Sibling Next.js app lives at `../studio-space-client`; this repo is only the server.

## Commands

- `npm run dev` — start with `node --watch index.js` (port `PORT` or 5000)
- `npm start` — start once
- `npm run seed` — insert demo studios; **skips if the `studios` collection already has data**
- `npm run seed:reset` — wipe `studios` first, then seed (only `studios`; `bookings` is never seeded)
- `npm test` — **always fails by design** (`exit 1`, no test framework exists). There is no lint, typecheck, or formatter config. Verify changes by running `npm run dev` and hitting endpoints manually.

## Environment

`.env` (gitignored) must define `MONGO_URI` and `JWT_SECRET`; optional `PORT`. Loaded via `import "dotenv/config"` at the top of `index.js`, `db.js`, and `seed.js`. The database name comes from `MONGO_URI` (no hardcoded db name — `client.db()`).

## Architecture

- `index.js` — wiring only: CORS, JSON body, mounts `/studios` and `/bookings`, 404 handler, then a 4-arg error handler. Async route errors propagate to it (Express 5 behavior — don't wrap handlers in try/catch unless you need custom status codes).
- `db.js` — exports `client`, collection accessors `studios()` / `bookings()` (call them, they're functions), and `toObjectId(id)` which returns `null` for non-24-hex ids. Routes always do `const doc = _id && (await find...)` — preserve that guard pattern.
- `routes/` — all request handling, validation, and serialization live here. Responses expose `id` (string), never `_id`.
- `middleware/auth.js` — `requireUser` guards every mutation.

## Conventions that are easy to break

- **Route order matters.** Static paths (`GET /studios/mine`, `GET /bookings/mine`, `GET /bookings/requests`) are registered *before* `/:id` routes so they aren't swallowed as ids. Keep new static routes above param routes.
- **Auth is shared with the client.** The Next.js app mints the JWT (`../studio-space-client/src/lib/jwt.ts`, `jose`, HS256, issuer `studiospace`, `sub` = user email) and sends it as `Authorization: Bearer`. This server verifies it independently with the same `JWT_SECRET`. Changing issuer, algorithm, or secret requires coordinating with the client.
- **Ownership is by `ownerEmail` string compare** against `req.user.email`, and `ownerEmail`/`ownerName`/`ownerImage` are taken from the verified token, never from the request body.
- **Booking conflicts:** overlap is checked only against `status: "Confirmed"` bookings using strict `$lt`/`$gt` on `startMin`/`endMin`, so back-to-back bookings are allowed. `PATCH /:id/confirm` re-checks overlap after the write and rolls itself back (larger id loses) to break ties between concurrent confirms — keep that logic if you touch it.
- **Validation** is hand-rolled in `parseStudio` (`routes/studios.js`), returning `{ errors, data }` where `errors` keys map to form fields the client highlights. Error responses use `{ message, errors }`; other errors use `{ message }`. Image URLs must be `https:`.
- Categories are the fixed slug list `photo-studios`, `sound-stages`, `podcast-rooms`, `music-suites`, `art-workshops` → see `CATEGORIES` in `routes/studios.js` and `BY_CATEGORY` in `seed.js`; add to both if you add one.
