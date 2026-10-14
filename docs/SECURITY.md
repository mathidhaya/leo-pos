# Leo POS: security notes

## What protects what

| Area | Control |
|---|---|
| Passwords | bcrypt (12 rounds), 8+ characters with a letter and a number, never returned by any endpoint |
| Sessions | 15-minute access token (HS256 only) in memory, 7-day refresh token in an httpOnly SameSite=Lax cookie, stored hashed, rotated on every use, with reuse detection |
| Accounts | The account is re-read from the database on every request, so disabling a person or changing a role works at once |
| Access control | Every route is listed in `backend/tests/security.http.test.ts` with its allowed roles. The test fails if a route is added without a decision. |
| Cafe separation | Every query is filtered by the cafe of the logged-in person. `npm run db:tenant-check` proves it with two temporary cafes. |
| OTP (4 digits, as specified) | Stored as a keyed hash, 5-minute expiry, 5 tries per code, **5 codes per hour and 20 wrong tries per day per phone or email**, resend wait of 30 seconds |
| Login | Per-IP limit, plus 10 failed logins per account in 15 minutes |
| API | 600 requests per minute per address, exact CORS allow-list, strict CSP, `Cache-Control: no-store` |
| Input | Every body and query is checked with zod and unknown fields are dropped. Raw SQL is limited to three reviewed files and always uses bound values. |
| Output | React escapes all text. No raw HTML anywhere. CSV exports neutralise formulas. Errors never show database messages. |
| Uploads | JPG/PNG/WebP only, type checked from the file's contents, random names, 2 MB limit, SVG refused |
| Money | Whole paise in code, NUMERIC in the database, totals re-checked by the server, CHECK rules in the database |
| Audit | Logins, logouts, product/order/payment/inventory/staff/settings changes. No passwords or secrets are ever recorded. |

## Known limits (accepted for now)

- A 4-digit OTP can be guessed with about a 0.2% chance per account per day at the caps above. Use 6 digits if the spec allows it.
- Someone who knows an owner's email can lock that account's login for 15 minutes (on purpose, to stop guessing).
- Rate-limit counters live in the server's memory: they reset on restart and are not shared between several servers.
- Uploaded images are public to anyone who has the (random, unguessable) address.
- After a password change or a logout, an already-issued access token keeps working until it expires (at most 15 minutes). Disabling an account is immediate.
- Failed logins are not written to the audit log (an attacker could flood it).

## Before going live (Phase 17)

1. Serve everything over HTTPS. Set `NODE_ENV=production`, a real `CORS_ORIGIN` (https, exact), and `TRUST_PROXY` to the number of proxies in front.
2. Put the website and the API on the **same site** (for example `app.example.com` and `api.example.com`, or one domain with `/api` proxied). The cookie is SameSite=Lax.
3. After your cafe is registered, set `ALLOW_REGISTRATION=false`.
4. Remove `SEED_OWNER_*` from the production environment. Never run the seed or sample-order scripts there.
5. Connect an SMS/email service for OTPs. Without one, production refuses to send codes.
6. Give the app its own database user with only the rights it needs (not `postgres`).
7. Store secrets in the host's secret manager. Generate new JWT secrets for production.
8. Send these headers from the website host: `Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` (adjust `connect-src` if the API is on another address), plus HSTS.
9. Back up the database daily and test a restore.
10. Run `npm audit --omit=dev` in both folders regularly.
