# oneS website

Database-backed oneS electric scooter catalog and CMS.

The project uses PHP 8.5. On Windows, install the isolated project runtime
(official archive with SHA-256 verification), then start the local server:

```text
./deploy/setup-php.ps1
./.runtime/php-8.5.11/php.exe migrate.php --config=config.example.php --development
./deploy/start-local.ps1
```

Then open:

```text
http://127.0.0.1:8000/index.html
```

This leaves XAMPP and the global PATH unchanged. The ignored `.runtime/` directory
is local only and is excluded from deployment packages. On Linux with PHP 8.5
and the required extensions, use `php -S 127.0.0.1:8000 deploy/local-router.php`.
Run `php tests/runtime.php` first, then explicitly initialize/upgrade the local
database with `php migrate.php --config=config.example.php --development`.
This creates `data/ones.sqlite`; web requests never create or migrate tables.
If using a private `config.local.php`, pass that file instead. `--development`
is only for local SQLite fixtures and permits the demo password. Before upgrading
an existing database, stop the server and back it up. Startup checks the schema
without changing it; missing/outdated schemas return HTTP 503 until migration.

Deployment preparation notes are in `DEPLOYMENT.md`. Apache 2.4 with PHP 8.5 is
the supported production target. IIS is not supported; `web.config` deliberately
rejects all HTTP verbs to prevent an accidental deployment with incomplete rules.

Important: GitHub Pages is static hosting only. Registration, cart, CMS, uploads, and admin login require PHP hosting because they use `api.php`, SQLite, and sessions.

For PHP hosting with MySQL, fill in `config.local.php` and set:

```php
'driver' => 'mysql',
```

Then enter the MySQL host, database name, username, and password from the hosting panel. Keep this file private. During later code uploads, never overwrite the production `config.local.php`.

Production uses a separate CLI migration account/configuration and a web account
with only SELECT, INSERT, UPDATE and DELETE. Follow section 20 of `DEPLOYMENT.md`
for migration, maintenance and rollback; never use `--development` on production.

## CMS

Open `http://127.0.0.1:8000/admin.html` to manage the website content.

Local development password:

```text
onesadmin
```

Keep this password only during local development. Production installations must set `security.initial_admin_password` in `config.local.php` before the first run, and the password should then be changed from the CMS security panel.

The CMS saves content in the SQLite database. After saving, refresh the public website to see changes.

You can edit:

- WhatsApp and Viber phone numbers and contact email
- product categories
- products and specifications
- coming soon products
- spare parts marked as coming soon
- manuals and documents
- store locations
- blog posts
- FAQ questions and answers

Customer login is available at `http://127.0.0.1:8000/login.html`.

Registration now requires an email confirmation before choosing a password.
The email workflow is prepared locally; production activation awaits a sender
and SMTP provider. See section 11 of `DEPLOYMENT.md` before deploying this
segment. Without SMTP configuration the API rejects new registrations/email
changes, and unverified accounts must confirm an address before sending inquiries.

Customer cart is available at `http://127.0.0.1:8000/cart.html`.

Cart flow:

- customer logs in or registers
- customer adds products from the public catalog
- cart is saved in SQLite
- customer can change quantity or remove products
- cart can be sent as a WhatsApp or Viber inquiry
- admin can upload a main product image and product gallery images
- admin can upload PDF manuals for the manuals/downloads section
- manuals can be connected to products or categories and filtered/searchable on the public website
- product cards link to a detail page with gallery, specs, cart, and inquiry actions
- products have a rich detailed description field with bold, italic, lists, and font size controls
- products can choose status and badge from dropdowns, include delivery time, and upload a linked manual directly
- badges are managed from a dedicated CMS section
- badges can be assigned to individual products or categories, each with its own expiry date
- products support MPC, discount price, sale price, and required sale end date

## Deployment and security

- `data/` contains the SQLite database and backup files. It must stay private on hosting.
- `uploads/` must stay public for product images, blog images, and manuals, but it should not execute scripts.
- During a normal production update, replace code and static assets only. Do not replace `data/`, `uploads/`, or `config.local.php`; those contain live profiles, carts, orders, products, media, and database credentials.
- Apache/LiteSpeed protection files are included:
  - `.htaccess`
  - `data/.htaccess`
  - `data/backups/.htaccess`
  - `uploads/.htaccess`
- IIS configuration is a rejection guard, not a supported hosting configuration.
- The sitemap can use `ONES_SITE_URL=https://your-domain.com` on production.
- Full pre-launch checklist is in `DEPLOYMENT.md`.
- The CMS also includes a `Provjera` panel for tracking launch QA items directly in the admin interface.

After changing CSS, run `./deploy/sync-css.ps1`; `-Check` verifies that every
page uses the same content fingerprint for the same stylesheet. The package
builder also regenerates CSS references from the actual packaged bytes, without
editing source files. Generated archives default to the private
`.runtime/packages/` directory. Public HTTP access is limited to application
entry points, images/scripts/styles/fonts, uploaded media and ACME challenges.
Old deployment trees, archives, tests, source helpers and configuration files
are blocked. GitHub Pages uses `_config.yml` to include only the static preview.

## Included sections

- Početna
- Proizvodi
- Proizvodi uskoro
- Usporedba proizvoda
- Servis i podrška
- Rezervni dijelovi
- Manuali i dokumenti
- Dostava i povrat
- Lokacije prodavnica
- Blog i novosti
- FAQ
- WhatsApp i Viber upit
- Email upit
- Privatnost i uslovi korištenja

## Later additions

- English language version
- bundles
- open a product directly from the CMS
- add customer favorites to the profile
- add images for categories
- production email sending
- final online payment flow, if needed later
