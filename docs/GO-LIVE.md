# Go-live checklist

## A few days before

- [ ] `npm run test:all` passes, and `npm run check:ui` in `frontend/` passes
- [ ] Lighthouse accessibility is 95 or higher on the main pages (`docs/UI-CHECKLIST.md`)
- [ ] The server is set up, the domain works over HTTPS, and `curl https://YOUR-DOMAIN/api/v1/health` answers
- [ ] A **second person** has seen the app on a phone or tablet, on mobile data (not the same Wi-Fi)
- [ ] `ALLOW_REGISTRATION=false` in `deploy/.env`
- [ ] No sample data: no `SEED_OWNER_*` settings on the server, and the seed and sample-order scripts were never run there
- [ ] The JWT secrets and database passwords are random and different from your computer's
- [ ] A copy of `deploy/.env` is saved somewhere other than the server
- [ ] Email test message arrives (`send-test-message`)
- [ ] `bash backup.sh` works, and `bash restore-test.sh` says "The restore works"
- [ ] The nightly backup is in cron, and a copy leaves the server every day
- [ ] An uptime monitor is watching `/api/v1/health`
- [ ] Real data is entered: cafe name, address, GST number, logo, invoice prefix, receipt footer, categories, products with real prices, GST and stock, and each product's cost price
- [ ] Staff accounts exist, and every person has changed their password in Settings, Account

## Day-one test (do it with the real settings, then undo it)

1. Cashier: take a dine-in order, with a discount, and check the total by hand.
2. Pay it with cash (check the change), then print or download the receipt. **Print it on the real receipt printer**, and check the paper width.
3. Take a delivery order for a customer, pay with UPI.
4. Owner: look at Orders, Payments, Invoices, the Dashboard and Reports. The totals must match what you did.
5. Owner: **refund** one paid order. Stock must come back, the invoice shows CANCELLED / REFUNDED.
6. Stock: add stock, remove some, and check the low-stock alert appears.
7. Log in as a cashier and a manager. A cashier must **not** see profit, cost prices, Reports, Staff or Inventory.
8. Disable a staff account and check it is logged out at once. Enable it again.
9. Turn the Wi-Fi off on the counter device. The offline banner must appear. Turn it back on.
10. Take a backup, then run `bash restore-test.sh`.
11. Remove the test orders you do not want in your books (refunded orders stay in the records, which is correct: ask your accountant how to treat them).

## On launch day

- [ ] Someone who knows the system is available for the first service
- [ ] Printed copy of the owner's recovery command (`docs/DEPLOYMENT.md`, section 12) and the server login details are kept safe, not on the counter
- [ ] A paper fallback exists if the internet or power is down (the app cannot save orders offline)

## First week

- [ ] Check `docker compose logs --tail 100 api` for repeated errors each day
- [ ] Check the backups really arrive off the server
- [ ] Compare the day's Reports with the cash drawer and the UPI app
- [ ] Ask the cashiers what slowed them down, and tell me

## Every month

- [ ] `sudo apt update && sudo apt upgrade -y`, then reboot
- [ ] `npm audit --omit=dev` in `backend/` and `frontend/`
- [ ] A restore test (`bash restore-test.sh`)
- [ ] Check free disk space (`df -h`)
