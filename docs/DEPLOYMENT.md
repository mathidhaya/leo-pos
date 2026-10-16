# Deploying Leo POS

This guide puts the app on **one small server**. Docker Compose runs three things: PostgreSQL (the database), the API, and Caddy (the website, with a free HTTPS certificate that renews itself). Only Caddy is reachable from the internet.

Read it once from top to bottom before you start. Most steps are a few commands. Steps 1 to 5 need an hour or two; the rest is quick.

Prices, server regions and provider rules change. Check each provider's current website.

## 1. What you need

| Need | Notes |
|---|---|
| A domain name | For example `cafe.yourname.com`. HTTPS needs one. A subdomain of a domain you own is fine. |
| A server | Ubuntu 24.04 LTS (22.04 also works), **2 GB RAM or more**, 1 to 2 CPUs, 25 GB disk or more. Choose a region in or near India. 1 GB can run out of memory while building. |
| A way to send email | Any SMTP service (a transactional email service, or a Gmail account with an app password for very small volume). Needed for OTP codes. |
| Optional: SMS | Twilio, or another provider. In India, commercial SMS needs DLT registration (approved sender names and message templates), which can take days or weeks. Start with email. |
| Your computer | With Git and `ssh` (Git Bash on Windows has both). |

## 2. Point the domain at the server

At your domain's DNS settings, add an **A record** for the name you chose, pointing to the server's IPv4 address. Wait a few minutes, then check from your computer:

    nslookup cafe.example.com

It must show your server's address before continuing, or the certificate step will fail.

## 3. Prepare the server

Log in as `root` (your provider shows how), then:

    adduser deploy
    usermod -aG sudo deploy
    mkdir -p /home/deploy/.ssh
    cp ~/.ssh/authorized_keys /home/deploy/.ssh/
    chown -R deploy:deploy /home/deploy/.ssh

Open a **second** terminal and check that `ssh deploy@SERVER_IP` works **before** closing the first one. Then, as `deploy`:

    sudo apt update && sudo apt upgrade -y
    sudo apt install -y ufw unattended-upgrades
    sudo ufw allow OpenSSH
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    sudo ufw allow 443/udp
    sudo ufw enable

Install Docker by following the **official guide for Ubuntu** at `docs.docker.com/engine/install/ubuntu`, including the "Docker Compose plugin". Then allow `deploy` to use it:

    sudo usermod -aG docker deploy

Log out and back in, and check:

    docker --version
    docker compose version

Optional but recommended: turn off password login for SSH (only if your key login works), by setting `PasswordAuthentication no` in a file under `/etc/ssh/sshd_config.d/`, then `sudo systemctl restart ssh`. Keep your first session open while you test a new one.

## 4. Put the code on the server

Only **committed** files are sent. Passwords and `.env` files are never part of the code.

On **your computer** (Git Bash, in the project folder), after your latest commit:

    cd ~/leo-pos
    git archive --format=tar.gz -o ~/leo-pos-release.tar.gz HEAD
    scp ~/leo-pos-release.tar.gz deploy@SERVER_IP:/tmp/

On the **server**:

    sudo mkdir -p /opt/leo-pos
    sudo chown deploy:deploy /opt/leo-pos
    tar -xzf /tmp/leo-pos-release.tar.gz -C /opt/leo-pos
    rm /tmp/leo-pos-release.tar.gz

(Later, a private GitHub repository with a deploy key is tidier than copying archives. The commands in section 11 then become `git pull`.)

## 5. Create the settings file

    cd /opt/leo-pos/deploy
    bash make-env.sh cafe.example.com

This writes `deploy/.env` with fresh random passwords and secrets. It never overwrites an existing file. **Make a safe copy of this file** somewhere that is not this server, for example in your password manager.

| Setting | Meaning |
|---|---|
| `SITE_ADDRESS` | Your domain |
| `POSTGRES_PASSWORD`, `APP_DB_PASSWORD` | Database passwords (letters and numbers only). The app uses its own limited user `leo_app`, not the administrator. |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Login secrets. If you change them, everyone is logged out. |
| `ALLOW_REGISTRATION` | Keep `false`. The first owner is created in step 7. |
| `SMTP_*` | Email for OTP codes (step 8) |

## 6. Start everything

    cd /opt/leo-pos/deploy
    docker compose up -d --build
    docker compose ps
    docker compose logs -f api

The first build takes a few minutes. In the log you should see `Applying migration ...` several times (the database tables being created) and then `Leo POS API running on http://localhost:5000`. Press Ctrl+C to stop watching (this does not stop the app).

Check from your computer:

    curl -s https://cafe.example.com/api/v1/health

It should answer `{"success":true,...`. The first visit can take a few seconds while Caddy gets the certificate. If the browser shows a certificate error, see "Common problems".

## 7. Create the first owner

    docker compose exec api node dist/cli/create-owner.js

It asks for the cafe name, the owner's name and an email or mobile number, then prints a **temporary password once**. Open the site, log in, and:

1. Settings, Account: change the password.
2. Settings, Cafe: name, address, phone, GST number, logo.
3. Settings, Billing and Receipt: invoice prefix, default GST, receipt footer.
4. Products and Categories: enter your real menu.
5. Staff: add managers and cashiers. Each gets a one-time password to hand over.

## 8. Email for OTP codes

Edit `deploy/.env`:

    nano .env

Fill in `SMTP_HOST`, `SMTP_PORT` (587 or 465), `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM`, for example `Leo Cafe <no-reply@yourdomain.com>`. Apply and test:

    docker compose up -d
    docker compose exec api node dist/cli/send-test-message.js you@gmail.com

It should say `Sent.` and the message should arrive (check spam). Messages sent from a domain you own need SPF and DKIM records at your email service, or they land in spam.

What works **without** codes: logging in, staff passwords (given by the owner on the Staff page), and owner recovery with `reset-password` (section 12). What needs codes: registering a new cafe through the website (switched off anyway) and "Forgot password". With email only, people who use a **mobile number** to log in cannot use "Forgot password": ask the owner to reset it on the Staff page.

SMS later: fill in the `TWILIO_*` settings after your DLT registration is approved, apply, and test with a mobile number.

## 9. Check everything once

Do the day-one test in `docs/GO-LIVE.md` before real customers use it.

## 10. Backups

The database and the uploaded images are on this server's disk. If the disk is lost, so is everything, so **backups must also leave this server**.

    cd /opt/leo-pos/deploy
    bash backup.sh
    ls -lh backups
    bash restore-test.sh

`restore-test.sh` restores your newest backup into a scratch database, shows the counts next to the live ones, and removes the scratch database. **Do this once now, and again every few months.** A backup that was never restored is only a hope.

Nightly backups with cron (`crontab -e`, then add the line; times are the server's time):

    0 2 * * * cd /opt/leo-pos/deploy && bash backup.sh >> backups/backup.log 2>&1

Backups older than 14 days are deleted automatically. **Copy them off the server** every day, to a different provider or your own computer. For example, from your computer:

    scp -r deploy@SERVER_IP:/opt/leo-pos/deploy/backups ~/leo-backups/

Backups contain customer phone numbers and password hashes, so store them somewhere private, and encrypt them if the place is shared (for example with `age` or `gpg`).

**To restore for real** (after a disaster, or to undo a bad update):

    cd /opt/leo-pos/deploy
    bash restore.sh backups/leo_pos_2026-10-16_020000.dump backups/uploads_2026-10-16_020000.tar

It asks you to type RESTORE. Everything entered after that backup is lost.

## 11. Updating the app

1. On the server: `cd /opt/leo-pos/deploy && bash backup.sh` (always back up first).
2. On your computer: commit, run `npm run test:all` in `backend/`, then make and copy a new archive as in section 4.
3. On the server, extract it over the old files (your `deploy/.env` and backups are not in the archive, so they stay):

       tar -xzf /tmp/leo-pos-release.tar.gz -C /opt/leo-pos

4. Rebuild and restart: `cd /opt/leo-pos/deploy && docker compose up -d --build`
5. Check: `docker compose ps`, `docker compose logs --tail 50 api`, and open the site.

Database changes are applied automatically when the API starts, and they only go forward. **To undo an update that changed the database**, restore the backup from step 1 and then redeploy the old archive. Keep the last few archives.

## 12. Looking after it

| Task | How |
|---|---|
| Is it up? | A free uptime monitor that checks `https://cafe.example.com/api/v1/health` every few minutes and emails you |
| Logs | `docker compose logs --tail 100 api` (also `web`, `db`) |
| Restart | `docker compose restart api` |
| Disk space | `df -h` now and then. Logs and backups are limited, but images and the database grow. |
| Computer updates | Monthly: `sudo apt update && sudo apt upgrade -y`, then `sudo reboot` (the app restarts by itself) |
| Locked-out owner | `docker compose exec api node dist/cli/reset-password.js owner@example.com` |
| Certificates | Renew by themselves. If one fails, see `docker compose logs web`. |

## 13. If the server is lost

1. Make a new server and do sections 2 to 4 (point the domain at the new address).
2. Put your saved `deploy/.env` in place (do not run `make-env.sh`: new secrets would not match the old backups' accounts, and everyone would be logged out).
3. `docker compose up -d --build`
4. Copy your newest backups to the new server's `deploy/backups/` and run `bash restore.sh ...`

## 14. Common problems

| Problem | Likely cause and fix |
|---|---|
| Browser says the certificate is invalid, or Caddy logs mention a failed challenge | The domain does not point at this server yet, or ports 80 and 443 are blocked at the provider's firewall. Check section 2 and the provider's firewall settings. |
| `api` keeps restarting | `docker compose logs api`. The first lines say why. A message starting `Invalid environment variables` names the setting. |
| Everyone is sent to the login page after an update | The JWT secrets changed. Put the old ones back. |
| 502 Bad Gateway | The API is still starting or stopped: `docker compose ps` and `docker compose logs api`. |
| Pictures or the logo disappear after an update | The `uploads` volume was removed (for example with `docker compose down -v`). Never use `-v`. Restore the uploads backup. |
| `permission denied` running Docker | You did not log out and in after `usermod -aG docker deploy`. |
| The database password setting is refused | `APP_DB_PASSWORD` may only contain letters and numbers. |
| Emails do not arrive | Run the test command, read its message, then check spam and SPF/DKIM. |
| Changed `POSTGRES_PASSWORD` or `APP_DB_PASSWORD` and the app cannot connect | Those only apply the first time the database is created. Change the real password with `docker compose exec db psql -U postgres -c "ALTER ROLE leo_app PASSWORD 'new'"` and update `.env` to match. |

## 15. Not covered

- More than one server, or a managed database. (The app keeps its rate-limit counters in memory, so it expects a single API server. Using a managed PostgreSQL service is possible: point `DATABASE_URL` at it and remove the `db` service.)
- Hosting services that deploy for you (Render, Railway and similar). The same pieces apply: build the `backend` folder with its Dockerfile, build the `frontend` folder, serve both under **one domain** (the website at `/`, the API at `/api` and `/uploads`), set the environment variables from section 5, and give the API a persistent disk for `/app/uploads`. Set `TRUST_PROXY` to the number of proxies in front.
- Monitoring dashboards, log shipping and alerts beyond an uptime check.
