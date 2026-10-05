# oneS production deployment

Use this checklist for the Hetzner server and `ones.ba`. The live database,
`config.local.php`, `data/`, and `uploads/` must never be replaced during a
normal code deployment.

**Current schema procedure:** section 20 (T34–T35) supersedes older references
below to automatic database initialization. Run the explicit CLI migration during
maintenance before serving this release. Web requests never perform migrations.

Security segment T01–T03 (2026-10-05):

- Deploy the complete package, including `backup-validation.php`,
  `vendor/htmlpurifier/` and `assets/vendor/`. The sanitizers are local,
  versioned dependencies; no CDN or Composer installation is needed.
- The new `auth_state` table is created by the existing database initialization
  mechanism. Existing browser sessions are invalidated once on this upgrade.
  Every successful CMS JSON restore then revokes all older sessions atomically;
  log in again using the administrator password contained in the restored backup.
- Restore accepts complete version 1/2/3 backups with a valid `admin@ones.local`
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

Security segment T07–T09 (2026-10-05):

- PHP 8.5 is the project baseline. The API rejects older runtimes with HTTP 503
  before opening the database. Run `php tests/runtime.php` with the intended
  runtime before deployment. Windows setup/start instructions are in README.md;
  never deploy `.runtime/` or replace a production PHP service with this Windows
  runtime. Update the pinned installer version and SHA-256 together when adopting
  a newer patch from https://www.php.net/downloads.php?os=windows.
- Read-only verification of ones.ba found Ubuntu 26.04 LTS, PHP CLI and Apache
  package `8.5.4-0ubuntu1.3`, with PHP 8.5 enabled in Apache and the required
  extensions present. The installed package matched the candidate in the
  server's existing APT metadata; no repository refresh or upgrade was performed.
  Distribution security backports must be assessed by package revision, not
  by comparing only the upstream patch number. Branch support reference:
  https://www.php.net/supported-versions.php.
- Deploy `login-security.php` together with `api.php`. Initialization creates
  the small InnoDB/SQLite `login_limit_lock` coordination table. It is not user
  content and is not imported/exported by CMS backups. Existing request-limit
  storage remains private and is pruned by the existing retention policy.
- Admin/customer login reserve all counters atomically before checking a
  password: 8 attempts per IP/account pair in 15 minutes, 30 failed/pending
  attempts per IP in 15 minutes, and 120 total attempts per minute across the
  system. Account failures follow the account across IPs; after five attempts,
  a cooldown grows from 2 to at most 60 seconds. Rejected requests do not extend
  it. A correct credential clears older account/pair failures and its own IP
  reservation, never the global budget or newer in-flight reservations.
- HTTP 429 includes `Retry-After`, `retryAfter` and `LOGIN_THROTTLED`. Existing
  sessions remain usable; there is no permanent account lock. Monitor real
  traffic before adjusting limits. This does not replace edge rate limiting
  or add MFA.
- CMS controls are temporarily inert during save/reset/restore. Save also waits
  for image/PDF uploads to finish. Failures release controls and retain drafts.
  Deploy the matching `admin.html` reference `admin.js?v=20261005-security-3`.
- The new GitHub workflow runs PHP 8.5 regression tests and concurrent login
  tests on pushes/PRs. It does not deploy the application. Its first cloud run
  still needs verification after this segment is pushed.

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

- PHP 8.5 or newer, with current security updates for the chosen distribution.
- MariaDB/MySQL with `pdo_mysql`, plus `dom`, `mbstring`, `gd`, `fileinfo`,
  `openssl`, `json`, and `session`. Local tests also require `pdo_sqlite`.
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
- [ ] New and changed passwords must contain at least 15 Unicode code points
      and at most 72 UTF-8 bytes (bcrypt limit). Emoji and accented letters use
      multiple bytes. Existing
      customer passwords remain valid until the customer changes them.
- [ ] Confirm a customer can still sign in after deployment.
- [ ] Confirm changing a password keeps the current session active and rejects
      another previously opened session.
- [ ] Confirm changing the profile email requires the current password.
- [ ] The first API request adds the non-destructive `users.auth_version`
      column when it is missing; it does not delete or replace users.
- [ ] Do not add an insecure manual "forgot password" flow. Password recovery
      remains deferred; email verification is not a password recovery mechanism.

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

## 11. Email verification — local implementation, activation pending

The owner confirmed on 2026-10-05 that no email provider exists yet. The T11
implementation has been tested against a disposable loopback SMTP capture only.
Production sending is NOT activated. Do not deploy this segment to the live PHP
site until a sender/provider is configured and delivery has been verified: without
mail configuration, registration and email changes return 503; unverified
customers cannot submit new inquiries. Existing logins, profile data, favorites,
carts and past inquiries remain accessible.

Copy the `mail` section from `config.example.php` into the private server config.
Set an authorized sender, SMTP host, port, username and password there; never
put the password in chat, Git, client JavaScript or public files. Use `tls` for
STARTTLS (usually 587), or `ssl` for implicit TLS (usually 465). Certificate and
hostname verification stay enabled. `none` is accepted only for a local request
using a loopback SMTP host; it is rejected in production. `public_url` must be the
canonical HTTPS origin/base path, not a value taken from a browser request.
PHPMailer 7.1.1 is vendored with upstream commit and per-file SHA-256 checksums in
`vendor/phpmailer/UPSTREAM.json`; no runtime download is needed.

Before activating, verify provider authorization/SPF/DKIM/DMARC and send to an
owner-approved test mailbox. Test both a new signup and an address change,
including receipt of the notification at the old address. Reload PHP/clear its
configuration opcode cache when changing private configuration. SMTP acceptance
alone is not proof that a message reached an inbox. Do not disable certificate
verification to work around a delivery failure.

Registration sends a 30-minute link and creates no user or session until the
recipient confirms and chooses a password. The initial sender cannot set that
password. GET/page loads never consume links; confirmation requires POST and
CSRF. Tokens have 256 random bits; only SHA-256 hashes are stored. The link uses
a fragment, removed from history before interaction. Existing-account confirmation
requires the matching logged-in account. Changing an email requires the current
password, notifies the old address, and keeps that address active until the new
one is confirmed. Confirmation revokes other sessions; password changes invalidate
pending links. The profile can cancel a pending change.

Atomic budgets: 3 messages per destination/hour, at least 60 seconds between
sends, 6 per IP/hour and 60 site-wide/hour. Failed SMTP attempts consume budget
and remove their unusable challenge. Existing accounts are not overwritten by
registration. Signup responses do not disclose whether an address has an account.

Existing customer addresses start unverified; do not label them verified without
mailbox proof. Verification uses separate tables; user records are preserved.
Backups intentionally exclude pending tokens and email verification state. A
successful restore clears them transactionally and requires fresh confirmation,
so restored emails cannot inherit a previous identity's verification.

Local verification tests: `php tests/email-security.php`,
`node tests/email-concurrency.cjs`, and the HTTP/browser tests using
`tests/capture-mail.cjs`. These require disposable databases/configs; the SMTP
capture listens only on loopback and never forwards mail. Never point mutation
tests at the live site or the project's real SQLite database.

## 12. Price representation

Prices accept decimal units with a dot or comma and at most two decimal places,
from 0 through 1,000,000,000. Missing/empty values mean no price. Exponents,
negative signs, currency suffixes and thousands separators are rejected. PHP and
JavaScript parse identical integer-fening values; cart sums use integer arithmetic
including large totals. Invalid old values are never stripped into a different
number: they must be corrected before saving. Existing order snapshots are not
rewritten. Sale end dates are inclusive calendar dates in `Europe/Sarajevo`.
The API supplies effective prices and its business date; browser clocks and
time zones do not decide expiry. Open pages refresh the server date at midnight
and on resume, including DST. If the clock cannot be refreshed after expiry,
the browser withholds the old numeric price until reconnection. Order snapshots
always use server prices.

## 13. Cart integrity and backup format 3

Deploy PHP and the versioned JavaScript together during a maintenance window,
after taking a database backup. Do not run an old application version while the
cart migration is executing. The migration adds a positive cart `revision` and
enforces one active cart per user: a partial unique index on SQLite, a generated
nullable `active_user_id` with a unique index on MySQL/MariaDB. MySQL requires
InnoDB and generated-column support. Named locks serialize this migration across
new application workers; SQLite uses its write transaction. This does not replace
the broader migration cleanup still tracked as T34.

Existing duplicate active carts merge into the newest cart, preserving quantities
and unavailable products. If a combined product exceeds the allowed 99 units,
migration stops instead of silently dropping units. Resolve those duplicates from
the saved database copy with the administrator before retrying. Submitted carts
and order snapshots are preserved. Running the migration again is safe.

Cart add/update/remove and order submission require integer `cartId` and
`cartRevision` from the displayed cart response. All writers lock the same user
and cart before checking status/version. A stale request gets HTTP 409 with
`CART_CONFLICT`, makes no cart/order change and is never replayed automatically.
The browser refreshes the cart while retaining the phone and note. Old cached
clients without a revision must reload the page.

Backup exports now use format 3 with cart revisions. Imports accept formats 1/2/3,
with explicit migration for old carts; generated index columns are never exported
or accepted as input. A format-3 backup requires this application version to
restore. Keep the pre-upgrade backup for application rollback.

Downloads and pre-restore backups read CMS, its revision, users, carts, items,
favorites and orders within one snapshot transaction. MySQL explicitly uses
REPEATABLE READ for that transaction and rejects non-InnoDB tables. SQLite uses
one read transaction. Errors roll back the read transaction; nested exports are
rejected without committing a caller's transaction. The snapshot reflects one
committed point in time; later commits belong to the next backup. Media files and
private configuration still need their separate backup described above.

Tests: `php tests/segment5-integrity.php`, `node tests/segment5-concurrency.cjs`,
`node tests/pricing-clock.cjs`, and the disposable-server browser suite
`tests/segment5-browser.cjs`. Concurrency uses independent PHP processes/connections.

## 14. CMS collection types, references and product identity

Deploy `cms-integrity.php`, the updated PHP files and `admin.js` together. The
admin HTML now requests `admin.js?v=20261005-security-6`; refresh open admin tabs
after updating. No database schema or backup-format change is needed for this
segment. The pending email activation in section 11 still applies.

Regular CMS saves validate the JSON shape before converting objects to PHP
arrays. Collections, galleries, category attributes and attribute values must
be JSON lists. Product specs/attributes are maps; API responses return empty
maps as `{}` to preserve named entries during browser edits. Bad containers
return 422 with field paths and change neither the CMS revision nor its history.
Legacy named/indexed list containers are reindexed on read without dropping
entries or rewriting the database.

New saves require exact references to category names, badge names and product
IDs. Unambiguous old references differing only in case or surrounding whitespace
are resolved to the existing entity on read, sitemap generation and backup import. Unknown or
ambiguous references are not guessed; invalid imports/saves are rejected.
Entity IDs themselves are never normalized or renamed.

Product IDs are read-only in the editor; new products receive a random UUID ID.
An authenticated `admin-cms` response attaches transport-only `_identity`
evidence to each existing product. Send it back unchanged with the CMS `revision`
when saving. Existing products without matching evidence, and new IDs carrying
another record's evidence, are rejected. New records have no `_identity` until
their first save. Removing a saved product also requires its ID in the explicit
`deletedProductIds` list. These checks run under the CMS write lock; stale
revisions return 409 and cannot overwrite a concurrent save.

The evidence is not stored in CMS data or backups and is absent from public
responses. A restore rotates its signing epoch and requires a fresh login/load.
Restore and reset remain explicit whole-snapshot operations. Explicit deletion
plus creation is a separate operation from renaming an existing product; the
complete dependency handling for deletion is described in section 15.

Tests: `php tests/cms-integrity.php`, `node tests/cms-concurrency.cjs`, and
`tests/segment6-browser.cjs` / `tests/segment6-product-lifecycle.cjs` against a
disposable loopback server. `php tests/sitemap.php` also verifies that numeric
words in valid product names cannot cause a sitemap TypeError. The concurrency
suite uses eight independent PHP connections and supports isolated SQLite and
MySQL/MariaDB fixtures. Never point mutation tests at production or the real
project database.

## 15. Deleting and renaming catalogue entities

Deploy `cms-relations.php`, `cms-relations.css`, the changed PHP files and admin
HTML/JS together. Admin JS/CSS uses the `20261005-security-7` cache version.
Refresh existing admin tabs. This segment changes no database schema or backup
format. The pending email activation from section 11 still applies.

Deletion remains a draft until the administrator saves the CMS. The editor asks
for confirmation and describes the consequences. Removing a product deletes its
linked CMS manual entries, active cart items and favorites in the same transaction
as the CMS update. It increments each affected cart's revision once. Other cart
items, submitted carts and order snapshots remain unchanged. Uploaded manual files
are retained because backups and historical links may still use them; this is
not filesystem deletion. Resetting demo CMS uses the same active-dependency cleanup
for products that disappear. Restoring a backup remains an explicit full snapshot
replacement, including the backed-up business tables.

A category with products, manuals or scoped badges requires a replacement
category. All three kinds of reference move together, with product IDs and
specifications preserved. An unused category can be explicitly deleted without a
replacement. Saving unrelated content never removes empty categories. When no
categories remain, create a category before adding a product.

Renaming a badge updates its assignments on products and categories. Deleting
it clears those assignments and their expiry dates, without deleting the
products/categories. The `-` no-badge marker is reserved. New products start
without an assigned badge. Existing disabled-badge display behavior is still
tracked separately as T23.

Admin responses now attach transport-only `_identity` evidence to categories
and badges as well as products. Return it unchanged when renaming/editing;
new records omit it. Evidence is not persisted or exported. `save-cms` also
accepts `referenceChanges`, an object with these lists:

```json
{
  "categories": [{"from": "Old category", "to": "Replacement category"}],
  "badges": ["Deleted badge"]
}
```

Use `to: null` only when no remaining content refers to the deleted category.
Names in this deletion declaration refer to the last saved CMS; replacement
names refer to the final draft. Renames are inferred from identity evidence.
Reusing another original entity's name in the same save is ambiguous and rejected;
save an intermediate change before reusing that name. Duplicate, unknown or
undeclared deletions fail without changing data. Product deletion still uses
`deletedProductIds`. Final CMS validation runs after reference resolution, inside
the transaction, and any later failure rolls back cleanup and revision history.

All dependent writers now acquire the catalogue lock before user/cart locks;
order submission and restore acquire it before the email lock too. MySQL uses
shared catalogue locks for customer operations and an exclusive lock for CMS
writes; SQLite uses its transaction write lock. A cart/favorite writer cannot
reinsert a product after its deletion commits. A stale cart gets 409 and reloads
before retry. Orders committed before deletion keep their original snapshot.
Admin CMS content, identity evidence and revision are returned under one lock.
Backup export keeps its separate, non-locking snapshot read semantics from
section 13. Do not run old PHP workers alongside the new lock protocol during
deployment; use the maintenance window described above.

Tests: `php tests/cms-relations.php`, `node tests/cms-relations-concurrency.cjs`,
`tests/segment7-browser.cjs` and `tests/segment7-draft-chains.cjs` on a disposable
loopback server. Tests include
rollback after cleanup, deletion racing cart/favorite/order writes and cancelled
dialogs, replacement selection, empty-category retention and both themes on
mobile/tablet/desktop viewport sizes.

## 16. Public badges and administrator recovery (T23–T25)

The catalogue and product detail now require a badge to exist in the public
badge list before displaying it. Disabled or absent badges are hidden; product
precedence, category inheritance and the Sarajevo expiry clock are preserved.

Order notes have an in-memory draft for each order. Changing status or receiving
a delayed response preserves newer text. The save response acknowledges only
the submitted note. Closing details keeps the draft in the same tab after a
warning; leaving/reloading the page warns about unsaved drafts. Save the note
to persist it across reloads. Logout and restore clear the drafts and cached
administrator data. No notes are added to browser storage.

Administrator loads distinguish loading, failure, successful empty results and
previously loaded data. Failed refreshes retain the last successful records with
a stale-data notice and Retry. Failed CMS loads lock content editing and Save
until recovery. Invalid or late responses cannot masquerade as successful loads
or repopulate data after logout. An expired-session response also offers a
sign-in action. All API authorization checks remain on the server.

Ship `admin.js`, `app.js`, `product.js`, their HTML entry points and the new
`admin-feedback.css` together; HTML uses the security-8 script/style versions.
The deployment builder includes the new stylesheet. No database migration or
backup format change is needed. The email service in section 11 still awaits
official provider configuration and activation.

Tests: `node tests/public-badges.cjs` runs in CI. On a disposable loopback PHP
server with local SMTP capture, run `tests/segment8-browser.cjs`, followed by
`tests/segment8-races.cjs` (it uses the orders created by the first suite).
Browser checks require Chrome/Playwright and the existing `ONES_TEST_URL`,
`ONES_DISPOSABLE_TEST=1`, `ONES_TEST_MAIL` settings. Optional
`ONES_TEST_SCREENSHOTS` stores viewport screenshots; never target production.

## 17. Public content, phone links, login return and product card controls (T26–T28, T40)

Enabled blog posts, parts and unlinked public manuals no longer require words
from product names to appear publicly. Explicit product/category references,
visibility flags and disabled sections still apply. Public manuals belonging
to an enabled but empty category remain available. Blog detail and sitemap
use the same publication decision. Product keyword matching is used only for
related-product recommendations. Disabling a blog and refreshing the CMS removes
its displayed article, and enabling it again makes it available.

Ship `phone.php`, `api.php`, `sitemap.php`, `api-client.js`, `admin.js`, `app.js`,
`blog.js`, `cart.js`, `login.js`, `product.js`, `styles.css` and their changed HTML
entry points together. The shared client and changed page scripts use
`20261005-security-9`; the catalogue also uses that version for `styles.css`.
The deployment builder now includes `phone.php`. No schema or backup format
change is required. Existing administrator tabs should be refreshed.

PHP and JavaScript share a tested phone normalization contract. Domestic BiH
`061 123 456`, `00387 61 123 456`, `38761123456` and `+387 (0)61 123 456` become
`+38761123456`. Other countries require an explicit `+` or `00` country prefix.
Spaces and common separators are accepted; letters, extensions, multiple plus
signs and invalid lengths are rejected. This validates notation, not ownership,
allocation or registration with WhatsApp/Viber. WhatsApp links use country-code
digits, and Viber links use the encoded plus sign. Invalid historical contact
data does not generate a conversation link.

New profile phones, order phones and ordinary CMS contact saves use the
canonical format. An order's optional profile phone update remains in the same
transaction as its order. Empty optional profile phones remain supported.
Historical orders/profiles are not bulk rewritten; their links normalize at
render time. Internal CMS reset/restore retains the validated snapshot's phone
notation; normal editing canonicalizes it on the next save. Invalid CMS contact
numbers must be corrected before saving. Country formatting references:
[ITU/RAK BiH numbering plan](https://www.itu.int/dms_pub/itu-t/oth/02/02/T020200001B0001PDFE.pdf)
and [ITU E.164](https://www.itu.int/rec/T-REC-E.164-202602-I).

An anonymous or expired cart session goes to login with its cart URL, query and
fragment preserved. Login accepts only known public HTML destinations on the same
origin and application path; invalid values return to the application home.
Login, verification, admin and API endpoints cannot be used as return targets.
Interrupted Add opens the selected product after login and asks for an explicit
second click. Login never replays the cart mutation. Successful Add removes the
pending notice and query marker. This is the existing-account login flow; email
activation is still pending configuration as described in section 11.

The product body no longer creates a stacking context that traps its action
buttons below the whole-card link. Inquiry, favorite and cart buttons receive
their own clicks/taps, while ordinary card content still opens the product.

CI adds `php tests/phone.php` and `node tests/contact-navigation.cjs`. Local
browser tests require the disposable loopback server, SMTP capture and variables
described in section 16: `tests/segment9-browser.cjs`,
`tests/segment9-edges.cjs` and `tests/product-card-actions.cjs`.
Run mutating suites sequentially; the publication suite disables products at
its end, and the card suite resets the fixture catalogue. They must never target
live customer data. The tests cover seven viewport widths, both themes, real
login/expiry, no duplicate Add, invalid return destinations, canonical contacts
and mouse/touch/keyboard controls. Browser emulation does not replace physical
iOS/Android or Safari testing.

## 18. Optional browser storage, device theme and CMS width (T29–T31)

Ship the new `storage.js` and `admin-responsive.css`, the changed theme/client/
page scripts and all ten HTML entry points together. `storage.js` loads in the
head before any cache reads; the changed scripts use `20261005-security-10`.
Both new files are included by the deployment builder. No PHP/DB/schema or
backup format change is needed. Refresh existing tabs after deployment so they
stop using old code which writes account-specific theme keys.

All deployed pages use `onesStorage.local` and `.session` for optional browser
caches. Property getters, reads, writes, removals and enumeration can fail without
blocking catalogue loading, login/logout, cart, profile or CMS writes. An in-page
memory fallback keeps the latest value and a removal tombstone, so failed writes
cannot reveal an older cached value. Pending operations retry when that storage
key is used again or the wrapper enumerates keys. There is no promise of cache
persistence after navigation while browser storage is denied. Cookies used for
the server session are separate; no cache grants authentication or authorization.
If local storage cannot publish the CMS timestamp, other tabs can still fetch
the latest saved CMS on reload.

The public theme now uses only `onesTheme:store:last`; CMS retains the separate
`onesTheme:admin` preference. Neither key depends on a customer ID or email.
The initial head script and the theme toggle use the same preference; the system
theme is the fallback. Valid theme changes synchronize across tabs. Login,
logout and changing accounts no longer select another stored customer theme.
Startup/pageshow and legacy-key storage events remove `onesTheme:customer:*`
from local and session storage. A generic guest preference may migrate to the
public preference, but account-specific values are never copied. The old local
customer preview is removed; session previews are limited to the display name.
Confirmed logout removes customer/cart previews through the same safe wrapper.
If browser rules prevent deletion/enumeration, cleanup completes when access is
available on a later retry or page visit. Unrelated browser keys are preserved.
The privacy page describes the actual fields and this migration behavior.

The CMS main panel is a CSS inline-size container. Wide record rows become
two-column cards below 1150 px of available panel width and one column below
600 px, accounting for the fixed sidebar. Filters, pagination and long text wrap
without hiding controls. Dialog content responds to its own width and long
product titles cannot push actions outside the dialog. This stylesheet is scoped
to the CMS; the existing user-authored admin/profile visual changes are preserved.
The layout tests cover sidebar breakpoints, 16 widths from 320 to 1920 CSS px,
both themes, every CMS section and opening/closing the product editor. A 640 CSS
px viewport also checks the space available to a 1280 px window at 200% zoom;
this is viewport equivalence, not an automated browser zoom gesture.

Tests: `node tests/storage.cjs` and `node tests/logout-client.cjs` run in CI.
On the disposable loopback server with SMTP capture, run
`tests/segment10-layout.cjs`, `tests/segment10-storage-browser.cjs` and
`tests/theme-privacy-browser.cjs` sequentially, followed by
`tests/segment10-dialogs.cjs` for category/order/customer dialog geometry.
They create synthetic users/orders
and modify the test CMS; never run them against production. The storage suite
uses separate users/IP fixtures to respect real request limits. Existing login,
cart-recovery and restore suites remain applicable. See `SEGMENT-10.txt` for
the completed run results and platform limitations.

## 19. CMS dialog and drawer focus (T32–T33)

Ship `cms-focus.js`, `admin.js`, `admin.html` and `admin-responsive.css`
together. The admin entry point references the changed scripts and stylesheet
with `20261005-security-11`; the package builder includes the new script.
There is no PHP, database, schema or backup format change. Reload existing CMS
tabs after deployment.

Product/category editors and order/customer details move focus inside when
opened, contain Tab/Shift+Tab and isolate background controls with `inert`.
Closing via Escape, the close button or the backdrop restores the opener.
When rendering replaces the opener, the same record's action is resolved again;
deleted records fall back to Add or the visible panel heading. Rendering an open
editor retains an identifiable control and text selection, with a safe close
button fallback. Native relation confirmations keep their own close lifecycle
and receive Tab containment without closing the underlying editor on Escape.
Unsaved-note and invalid-name close guards still apply. Logout/restore clear
focus scopes and make the login form available again.

At widths up to 920 CSS px the closed sidebar is hidden, inert and excluded from
the accessibility tree. Opening it sets dialog semantics, focuses its close
button and isolates the main content. Closing or selecting a section restores
the menu toggle. Crossing the breakpoint releases the mobile scope and moves
focus out of a sidebar that has just become hidden. Desktop navigation remains
available. The floating save action is hidden while the drawer is open.

Run `tests/cms-focus-browser.cjs` and `tests/cms-focus-edges.cjs` against the
disposable loopback fixture described in section 16. The first creates a local
verified test customer and order via SMTP capture; both modify test CMS state.
Never run them against production. They cover eight viewport widths in both
themes, real keyboard interaction, emulated touch, native confirmations,
rerenders, close guards, resize, logout and Chrome's accessibility tree via CDP.
The edges suite optionally saves screenshots to `ONES_TEST_SCREENSHOTS`.
See `tests/audit-2026-10-04/SEGMENT-11.txt` for completed regression results.

## 20. Explicit schema migrations and server pagination (T34–T35)

This release requires schema version 2. `database()` only connects and reads the
version ledger; it does not create tables, check every column/index, consolidate
carts or seed accounts. An absent/older/newer schema returns HTTP 503 with
`DATABASE_MIGRATION_REQUIRED`. HTTP cannot run `migrate.php` or
`schema-migrations.php` (404). CLI `--check` exits 2 when migration is required,
1 on another failure, and 0 when ready. It never creates a missing SQLite file.

Deploy this release during maintenance:

1. Stop HTTP writes and any workers using the database. Keep traffic in
   maintenance until all checks finish. Take a native database backup plus a copy
   of uploads and the current release; a CMS JSON export alone is not a schema
   rollback backup. Verify restoration on an isolated database first.
2. Extract the complete code package into the new release directory. Keep the
   live database, media and private web `config.local.php`. Prepare a separate
   CLI configuration outside the document root, readable only by the deploy
   account, pointing to the same database with schema migration permissions.
   Never put this account in the web configuration. For a new installation,
   privately configure a strong `security.initial_admin_password` before seeding.
3. With PHP 8.5 and the required extensions, run from the new release:

   ```sh
   php migrate.php --config=/private/path/ones-migration.php
   php migrate.php --config=/private/path/ones-runtime.php --check
   ```

   The second configuration has the same settings/credentials as the actual web
   process. SQLite configurations must use an absolute database path so moving
   the config cannot point to a different file. `--development` is exclusively
   for local SQLite tests and is never used on production.
4. The migration account needs SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER,
   INDEX and REFERENCES on the application database. The web account needs only
   SELECT, INSERT, UPDATE and DELETE. Remove broader existing web grants rather
   than assuming an additional GRANT revokes them. Preserve the previous private
   config for rollback; do not change any live grants until testing this release.
5. Verify admin/customer login, catalogue, inquiry creation, filtered lists,
   details, pagination and native/JSON restore on a staging copy with that
   restricted web account. Then switch the release, refresh existing browser
   tabs and remove maintenance. Migration does not configure the pending SMTP
   service or activate T11; registration/email-change prerequisites still apply.

Migrations serialize through a MySQL named lock or an SQLite file lock. Existing
unversioned databases are adopted, required columns/coordination tables are
created once, and existing customer/order data are preserved. Each successful
phase records its version. Version 2 creates order/customer/date/status indexes
and `order_search_items`, rebuilding historical item names in batches of 100.
Repeated execution is idempotent; newer schema versions cannot be downgraded.
MySQL DDL implicitly commits: a failed migration can leave partial schema work.
Keep maintenance active, correct the error and rerun, or restore the native
database backup together with its matching code/config. Do not manually advance
the version ledger or run old code against an unverified partial upgrade.

List endpoints now accept `page` and `pageSize` (default 25, maximum 50):
`admin-orders`, `admin-customers` and `customer-orders`. Responses include
`pagination` (`page`, `pageSize`, `pageCount`, `total`, `start`); admin lists also
include global `stats`. Invalid queries return 400 `INVALID_QUERY`; stale page
numbers clamp to the last page, and empty lists are page 1 of 1. Counts and rows
use one read snapshot. Ordering is descending ID, with matching customer/status
indexes. Offset pagination is not a frozen snapshot across successive requests:
new records can shift pages between requests; refresh starts from current data.

Admin order filters run in SQL across the entire history: `search`, `status`,
inclusive calendar `date`/`dateTo`, and `product` (literal name substring).
Unicode case folding and literal `%`, `_`, `!` are tested on both backends.
Historical item names remain searchable after catalogue edits. Substring search
may still scan rows; this change bounds downloaded rows and PHP/browser memory,
not a guarantee of constant database query time at every production size.
Review query plans/latency on a production-sized staging copy before tuning.

Customer summaries contain aggregate counts/latest status, not nested history.
`admin-customer-detail?customerId=...` loads one customer and a bounded history;
`admin-order-detail?orderId=...` retrieves one authorized admin record. Note/status
mutations return the single `order`; the UI then refreshes the active page.
Draft notes survive filter changes and out-of-order reads. Detail loads can be
cancelled by closing the dialog; late responses cannot reopen it after logout.
Contact templates use one separately fetched latest inquiry, so moving to an
older customer-history page cannot change the inquiry referenced in a message.
Private profile history is always scoped to the authenticated customer, ignores
client-supplied owner IDs and omits internal admin notes/customer identity fields.
The profile counter is the total, and failed page loads retain previous rows with
an explicit retry of the requested page. Private responses retain `no-store`.

Ship the PHP modules, `api-client.js`, `admin.js`, `profile-orders.js`,
`profile.js` and matching HTML references (`20261005-security-12`) together.
Backup format remains version 3; schema version and derived search rows are not
exported. JSON restore rebuilds search rows in its transaction, preserving the
existing rollback/session-revocation behavior. All affected MySQL tables,
including the derived search table, must be InnoDB.

Regression commands:

```text
php tests/database-migrations.php
php tests/record-pages.php
node tests/migration-concurrency.cjs
```

For HTTP/browser tests, use the disposable package and SMTP capture from section
16 in `.runtime/segment12-tests/web`, with PHP on 127.0.0.1:18765 and SMTP on
127.0.0.1:10255. Use a fresh SQLite file under that package's `data/`, or a new
`ones_segment_test...` database on the isolated MariaDB instance at port 13316.
Migrate it explicitly with the fixture's strong initial password
`Segment one admin password 2026!`; never use these synthetic credentials on a
real server. Set `ONES_DISPOSABLE_TEST=1`, `ONES_TEST_URL` to the loopback URL,
`ONES_TEST_MAIL` to the capture file, and `PHP_BINARY` to PHP 8.5. Then run:

```text
php tests/record-pages-http-fixture.php .runtime/segment12-tests/web/config.local.php
node tests/segment12-browser.cjs
node tests/record-details-browser.cjs
node tests/cms-focus-browser.cjs
node tests/cms-focus-edges.cjs
node tests/segment8-races.cjs
```

The seeder refuses an existing populated database and creates 130 customers/464
orders, including a verified synthetic `page0@example.invalid` customer with
password `Page customer password 2026!`. Run the pagination suite first: it
expects those exact counts and then changes a status/note. Recreate the fixture
before repeating it. Existing focus/restore suites create their own local test
records. Optional `ONES_TEST_SCREENSHOTS` captures layout evidence. See the
segment 12 report for completed results and platform limitations.
