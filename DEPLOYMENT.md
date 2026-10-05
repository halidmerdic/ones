# oneS production deployment

Use this checklist for the Hetzner server and `ones.ba`. The live database,
`config.local.php`, `data/`, and `uploads/` must never be replaced during a
normal code deployment.

Security segment T01–T03 (2026-10-05):

- Deploy the complete package, including `backup-validation.php`,
  `vendor/htmlpurifier/` and `assets/vendor/`. The sanitizers are local,
  versioned dependencies; no CDN or Composer installation is needed.
- The new `auth_state` table is created by the existing database initialization
  mechanism. Existing browser sessions are invalidated once on this upgrade.
  Every successful CMS JSON restore then revokes all older sessions atomically;
  log in again using the administrator password contained in the restored backup.
- Restore accepts complete version 1/2 backups with a valid `admin@ones.local`
  account and password hashes. Incomplete/redacted or inconsistent backups are
  rejected before replacement. Legacy version 1 fields are migrated explicitly.
- MySQL/MariaDB restore requires InnoDB for every affected table. Test restoration
  on a disposable database before production rollout. Safety JSON copies still
  belong in private `data/backups/`; media files remain a separate backup.
- `admin.html` has a stricter CSP that disables inline scripts and event handlers.
  Recheck that header on the deployed server; IIS configuration also needs an
  IIS runtime check. These changes do not replace the later PHP upgrade task.

Security segment T04–T06 (2026-10-05):

- Existing admin accounts using `onesadmin` or the example configuration
  password are restricted to password change and logout. Other admin API
  operations return `403 ADMIN_PASSWORD_CHANGE_REQUIRED`, including reads,
  downloads, uploads and restore. The restriction also applies to existing
  sessions. The public catalogue continues to work.
- On production, the known demo credential cannot even open the restricted
  session. For a legacy demo account, the server owner must privately set
  `security.initial_admin_password` in the existing `config.local.php` to a
  unique strong password (15–72 characters). Sign in with that configured
  password, enter it again in the change form, and choose the permanent admin
  password. Once changed, the configuration password no longer authenticates
  this account. Clear it from the configuration if no longer needed. An empty,
  weak or example recovery value fails closed. Normal deployments never reset
  an existing password or enable this recovery path for a non-demo account.
- Production restore rejects any admin with a known demo password before
  writing. For an old demo backup, restore it to an isolated local installation,
  change the admin password there, and export a fresh validated backup.
- Deploy the updated API client together with the page scripts and their HTML
  version references (`20261005-security-2`). Customer logout now requires a
  confirmed server response or a fresh server status confirming logout.
- Retest inquiry validation, retry after a network error, and a second inquiry
  on the same cart page. Cart controls remain locked only while a request is
  pending. A lost submission response triggers a cart refresh and asks the
  customer to check their profile; it does not automatically resubmit.

## 1. Before every deployment

- [ ] Download a CMS backup from `CMS -> Sigurnost -> Preuzmi backup`.
- [ ] Back up the production MariaDB database on the server.
- [ ] Back up `uploads/` separately. The CMS JSON backup contains file paths,
      products, users, carts, and inquiries, but not the image/PDF file contents.
- [ ] Upload only changed application files with WinSCP.
- [ ] Never overwrite `config.local.php`, `data/`, or `uploads/`.
- [ ] Confirm product names, prices, badges, sale dates, delivery times,
      manuals, gallery images, FAQ, blog posts, and contact numbers.

Create a safe deployment archive from the current application files:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\build-package.ps1
```

The generated `ones-deployment-YYYYMMDD-HHMMSS.zip` intentionally excludes
`config.local.php`, the database, tests, deployment helpers, and all CMS media
inside `uploads/`. Extract its contents over `/var/www/html/` without deleting
the existing server directories. The archive may update only the protective
`.htaccess` files inside `data/` and `uploads/`; it does not contain their live
contents.

Do not use `cp -a staging/. /var/www/html/` for this deployment. That command
can replace the ownership and mode of the web root, `data/`, and `uploads/`.
After extracting application files, confirm that Apache can traverse the web
root and write to the listed CMS directories before opening the CMS.

## 2. Server requirements

- PHP 8.1 or newer.
- MariaDB/MySQL with `pdo_mysql`, plus `gd`, `fileinfo`, `json`, and `session`.
- Apache modules: `headers`, `rewrite`, `expires`, `deflate`, and `remoteip`.
- Writable directories for the Apache user:
  - `data/`
  - `data/backups/`
  - `uploads/`
  - `uploads/products/`
  - `uploads/blogs/`
  - `uploads/manuals/`
- `config.local.php` must use the MySQL driver and must not be committed or
  included in deployment archives.

Enable the required Apache modules:

```bash
sudo a2enmod headers rewrite expires deflate remoteip
sudo apache2ctl configtest
sudo systemctl reload apache2
```

## 3. HTTPS and Cloudflare proxy

1. In Cloudflare DNS, keep the `ones.ba` A/AAAA record and the `www` record
   proxied (orange cloud).
2. Install a valid certificate for `ones.ba` and `www.ones.ba` on Apache. A
   current Let's Encrypt certificate is sufficient.
3. In `SSL/TLS -> Overview`, choose `Full (strict)`. Do not use Flexible mode.
4. Enable `Always Use HTTPS` only after `https://ones.ba` works through
   Cloudflare without a 526 response.
5. Keep the canonical redirect from `www.ones.ba` to `https://ones.ba`.

The application accepts forwarded HTTPS and visitor-IP headers only when the
direct sender is listed as a trusted proxy. Merge the `network` section from
`config.example.php` into the production `config.local.php`, or provide these
comma-separated server environment variables:

```text
ONES_ALLOWED_HOSTS=ones.ba,www.ones.ba
ONES_TRUSTED_PROXIES=<current Cloudflare IPv4 and IPv6 ranges>
```

Before deployment, compare the stored ranges with:

- `https://www.cloudflare.com/ips-v4`
- `https://www.cloudflare.com/ips-v6`

## 4. Real visitor IP in Apache

The repository contains `deploy/apache/ones-remoteip.conf`. In WinSCP, upload
that file to:

```text
/etc/apache2/conf-available/ones-remoteip.conf
```

Then enable and verify it:

```bash
sudo a2enmod remoteip
sudo a2enconf ones-remoteip
sudo apache2ctl configtest
sudo systemctl reload apache2
```

In `/etc/apache2/apache2.conf`, the combined `LogFormat` should use `%a` for
the visitor address instead of `%h`. Open the website from a phone network and
confirm that Apache logs the phone's public address rather than a Cloudflare
address:

```bash
sudo tail -f /var/log/apache2/access.log
```

Never configure `RemoteIPHeader` without `RemoteIPTrustedProxy` entries. An
unrestricted forwarded-IP header can be forged and would weaken rate limits.

## 5. Server firewall

Use Hetzner Cloud Firewall, UFW on the server, or both. Test each rule before
closing the current SSH session:

- TCP `22`: allow only the administrator's fixed public IPv4 `/32` and, when
  used, IPv6 `/128`.
- TCP `80` and `443`: allow only the current Cloudflare IPv4 and IPv6 ranges.
- Do not expose MariaDB port `3306` publicly.
- Leave outbound rules empty unless there is a documented reason to restrict
  them; Hetzner then permits outbound traffic.
- Apply the firewall to the production server and open a second SSH session to
  verify access before disconnecting the first one.

For a fresh UFW configuration, the repository contains
`deploy/configure-ufw-cloudflare.sh`. Review the current Cloudflare ranges in
the script, copy it to the server, and run it as root. It leaves TCP `22` open
for SSH and restricts TCP `80` and `443` to Cloudflare. Restrict SSH to the
administrator's fixed address separately when that address is available.

After this firewall is active, requests sent directly to the Hetzner origin IP
on ports 80/443 are blocked, so Cloudflare protection cannot be bypassed.

## 6. Cloudflare cache rules

Do not enable `Cache Everything` for the whole domain. Create one Cache Rule
named `Bypass private and dynamic pages` with this expression:

```text
(http.request.uri.path eq "/api.php") or
(http.request.uri.path in {"/admin.html" "/cart.html" "/login.html" "/profile.html"})
```

Choose `Cache eligibility -> Bypass cache`. Keep this bypass rule after any
broader cache rule because the last matching Cloudflare Cache Rule wins.

Static CSS, JavaScript, fonts, images, and PDFs may be cached. Their HTML
references use version parameters when application files change. The origin
also sends `no-store` for the API, CMS, cart, login, and profile pages.

## 7. Domain and SEO

- [ ] Set `ONES_SITE_URL=https://ones.ba` in the Apache/PHP environment.
- [ ] Confirm `robots.txt` contains `Sitemap: https://ones.ba/sitemap.php`.
- [ ] Open `/sitemap.php` and confirm product and blog URLs use `ones.ba`.
- [ ] Check product and blog SEO titles/descriptions in CMS.
- [ ] Confirm `https://www.ones.ba/...` redirects to the same path on
      `https://ones.ba/...`.

## 8. Security checks

- [ ] Confirm `.htaccess` is enabled (`AllowOverride` permits these rules).
- [ ] Confirm these URLs return 403 or 404:
  - `/config.local.php`
  - `/data/ones.sqlite`
  - `/data/backups/`
  - `/.env`
  - `/.git/config`
- [ ] Confirm private responses are not cached:

```bash
curl -I "https://ones.ba/api.php?action=cms"
curl -I "https://ones.ba/admin.html"
curl -I "https://ones.ba/cart.html"
```

Expected: `Cache-Control` contains `no-store` and Cloudflare reports a dynamic
or bypassed response instead of `HIT`.

## 9. Authentication checks

- [ ] Confirm the default local admin password is not used in production.
- [ ] New and changed passwords must contain 15 to 72 characters. Existing
      customer passwords remain valid until the customer changes them.
- [ ] Confirm a customer can still sign in after deployment.
- [ ] Confirm changing a password keeps the current session active and rejects
      another previously opened session.
- [ ] Confirm changing the profile email requires the current password.
- [ ] The first API request adds the non-destructive `users.auth_version`
      column when it is missing; it does not delete or replace users.
- [ ] Do not add an insecure manual "forgot password" flow. Password recovery
      remains deferred together with SMTP and verified email delivery.

## 10. Final QA

- [ ] Register and sign in as a customer.
- [ ] Add a product, update quantity, and submit an inquiry.
- [ ] Double-click the inquiry button once and confirm that only one inquiry is
      created and the button shows the sending state.
- [ ] Confirm the inquiry appears in CMS and update its status.
- [ ] Test product image, blog image, and manual upload.
- [ ] Open two CMS tabs and confirm that an older tab cannot overwrite a newer
      saved revision without first being refreshed.
- [ ] Test the mobile layout at 360px and 390px, then desktop.
- [ ] Test dark and light modes on public pages, customer pages, and CMS.
- [ ] Confirm Apache and PHP logs contain no new errors.
- [ ] Purge only the changed static URLs in Cloudflare when necessary; a purge
      does not delete users, products, CMS data, or uploaded files.

Run the automated public checks from the project directory after deployment.
Pass the current Hetzner public IP so the script also confirms that the origin
cannot be reached directly around Cloudflare:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\verify-production.ps1 -OriginIp "YOUR_HETZNER_IP"
```

If Windows Schannel cannot initialize TLS credentials, use the equivalent Node
verifier:

```powershell
node --use-system-ca .\deploy\verify-production.mjs --origin-ip "YOUR_HETZNER_IP"
```

Do not consider the Cloudflare setup complete while the direct-origin check
fails. Fix the Hetzner Cloud Firewall first, then rerun the same command.

SMTP/email verification is intentionally deferred. Do not mark email delivery
as production-ready until an official sender address and provider are chosen.
