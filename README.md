# Leo Cafe: Billing and POS

A cafe billing and point-of-sale system. Staff take orders, calculate GST and discounts automatically, accept payment, print invoices, and the owner sees sales, profit and stock.

## 1. Project overview

Leo Cafe is a web app for a cafe with an owner, managers and cashiers. It runs in a browser on a counter computer, tablet or phone. One server can hold several cafes, and each cafe only ever sees its own data.

## 2. Features

- **Login and accounts:** register a cafe with an OTP, log in with a mobile number or email, forgot and reset password, sessions that log out on every device when a password changes.
- **Roles:** Owner (everything), Manager (menu, stock, customers, reports, refunds), Cashier (orders, payments, invoices).
- **New Order (POS):** categories, search by name or code, product cards with stock, quantity controls, Dine In / Take Away / Delivery, discount (percent or rupees), GST per product, live bill. The server re-checks every price before saving.
- **Payments and invoices:** cash with change, UPI, card, other; invoice numbers like LC-000001; receipt for 80 mm thermal printers; PDF download; reprint; refunds by an owner or manager.
- **Orders:** statuses from Pending to Completed, cancel with stock returned, filters and search.
- **Menu:** categories and products with images, profit calculated, enable and disable.
- **Inventory:** stock in, stock out, counts, history, low-stock alerts.
- **Customers:** created from orders or by hand, with total orders, spending and history.
- **Reports:** sales, profit, products, categories and payments, by day, week, month or year, with CSV and PDF export.
- **Staff and settings:** add staff with one-time passwords, disable or delete, cafe profile and logo, GST number, invoice prefix, receipt text, change your own password.
- **Safety:** audit log, rate limits, role checks on every route, money in whole paise with database rules, double-click and double-payment protection.

## 3. Technology stack

| Part | Technology |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS, React Hook Form, Zod, TanStack Query, Recharts, Lucide |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL, Prisma |
| Login | JWT access tokens, refresh cookies, bcrypt |
| Tests | Vitest, Supertest |
| Production | Docker Compose, Caddy (automatic HTTPS) |

## 4. Folder structure

    leo-pos/
      backend/
        prisma/            schema.prisma, migrations/, seed and sample-data scripts
        src/
          config/          settings, database connection
          controllers/     HTTP only
          routes/          addresses and who may use them
          services/        the real work
          middleware/      login check, roles, limits, errors
          validators/      input rules (Zod)
          utils/           billing maths, dates, passwords, PDFs
          cli/             commands for the server (create owner, reset password, test email)
        tests/             unit tests; tests/integration/ runs against a test database
      frontend/
        src/
          api/ components/ context/ hooks/ layouts/ pages/ types/ utils/
      deploy/              docker-compose.yml, Caddyfile, backup and restore scripts
      docs/                DEPLOYMENT.md, GO-LIVE.md, SECURITY.md, TESTING.md, UI-CHECKLIST.md

## 5. Installation (on your own computer)

You need Node.js 22 (or 20.19+), PostgreSQL 15 or newer, and Git. On Windows, use Git Bash.

    cd backend
    npm install
    npx prisma generate
    cd ../frontend
    npm install

## 6. Environment variables

Copy `backend/.env.example` to `backend/.env`. Never commit `.env`.

| Variable | Meaning |
|---|---|
| `NODE_ENV` | `development`, `test` or `production` |
| `PORT` | API port (5000) |
| `CORS_ORIGIN` | The exact address of the website, for example `http://localhost:5173` (in production `https://...`) |
| `DATABASE_URL` | PostgreSQL address, for example `postgresql://postgres:PASSWORD@localhost:5432/leo_pos` |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Two different random strings of 32+ characters |
| `TRUST_PROXY` | Number of proxies in front of the API (0 locally, 1 with Caddy) |
| `ALLOW_REGISTRATION` | `false` stops strangers creating cafes |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Send OTP codes by email (leave blank in development) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Send OTP codes by SMS (leave blank unless you use it) |
| `SEED_OWNER_EMAIL`, `SEED_OWNER_PHONE`, `SEED_OWNER_PASSWORD` | Used only by the development seed script |
| `TEST_DATABASE_URL` | The test database. Its name must end in `_test`. |

Make a random secret with: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

In production the server settings live in `deploy/.env` (see `docs/DEPLOYMENT.md`).

## 7. Database setup

    psql -U postgres -c "CREATE DATABASE leo_pos;"

## 8. Migration

    cd backend
    npx prisma migrate deploy        # applies every migration (use this on any database)
    npm run db:migrate               # development only: also creates new migrations

## 9. Seed data

Set `SEED_OWNER_EMAIL` and `SEED_OWNER_PASSWORD` in `backend/.env`, then:

    npm run db:seed                  # a sample cafe, owner, categories and 14 products
    npm run db:sample-orders         # fake sales, so the dashboard has numbers
    npm run db:sample-orders:clear   # remove them again

These are for development only and refuse to run in production. For a real cafe, see "First owner" below.

## 10. Running the frontend

    cd frontend
    npm run dev                      # http://localhost:5173

## 11. Running the backend

    cd backend
    npm run dev                      # http://localhost:5000

## 12. Testing

    cd backend
    npm run db:test:create           # once: creates the test database
    npm test                         # fast tests, no database
    npm run test:integration         # the real app against the test database
    npm run test:all                 # both: run this before every commit
    cd ../frontend
    npm run check:ui                 # accessibility checks, colour contrast, type check

See `docs/TESTING.md`.

## 13. Production deployment

The full step-by-step guide is in `docs/DEPLOYMENT.md`, and a checklist for launch day is in `docs/GO-LIVE.md`. In short: one small server runs Docker Compose (database, API, Caddy for HTTPS). You need a domain name. Nightly backups are included.

### First owner

Production has no sample data. Create the first owner on the server, with no email or SMS needed:

    docker compose exec api node dist/cli/create-owner.js

It prints a temporary password once. Log in and change it under Settings, Account. If the only owner is ever locked out:

    docker compose exec api node dist/cli/reset-password.js owner@example.com

## Useful commands

| Command (in `backend/`) | What it does |
|---|---|
| `npm run build` / `npm start` | Compile and run the production build |
| `npm run typecheck` | Check the types without running |
| `npm run db:studio` | Look inside the database in a browser |
| `npm run db:tenant-check` | Two temporary cafes try to read each other's data (needs the dev server running) |
| `npm run cli:create-owner` / `cli:reset-password` / `cli:send-test` | The server commands, run from source |
