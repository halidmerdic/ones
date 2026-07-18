# oneS deployment checklist

Use this before publishing the website to a real domain.

## Before upload

- [ ] Make a CMS backup from `CMS -> Sigurnost -> Preuzmi backup`.
- [ ] Confirm product names, prices, badges, sale dates, delivery times, manuals, and gallery images.
- [ ] Confirm store locations, FAQ, blog posts, contact numbers, WhatsApp and Viber templates.
- [ ] Keep the current admin password during development only. Change it when deployment starts.
- [ ] Confirm that `data/ones.sqlite` is not uploaded publicly without server protection.
- [ ] Confirm that `data/backups/` is private and not browsable.
- [ ] Confirm that `uploads/` is public for images/PDF manuals, but cannot execute scripts.

## Hosting requirements

- GitHub Pages is not enough for this project because it does not run PHP, SQLite, sessions, uploads, or the CMS API.
- Use PHP hosting, cPanel hosting, LiteSpeed/Apache hosting with PHP, or a VPS/container where PHP can write to `data/` and `uploads/`.
- For test hosting with MySQL, edit `config.local.php`, set `driver` to `mysql`, and enter the database credentials from the hosting panel.
- Do not overwrite `config.local.php` on hosting during normal code redeploys. The hosted file contains the live database connection.
- If CMS content looks reset after redeploy, first check `htdocs/config.local.php`. It must exist on hosting and must use `driver => mysql`; otherwise the app is looking at the wrong database.
- PHP 8.1 or newer.
- PHP extensions for local SQLite: `pdo_sqlite`, `sqlite3`, `gd`, `fileinfo`, `json`, `session`.
- PHP extensions for MySQL hosting: `pdo_mysql`, `gd`, `fileinfo`, `json`, `session`.
- Writable folders on server:
  - `data/`
  - `data/backups/`
  - `uploads/`
  - `uploads/products/`
  - `uploads/blogs/`
  - `uploads/manuals/`

## Domain and SEO

- [ ] Set the production domain for sitemap generation.
  - Preferred server environment variable: `ONES_SITE_URL=https://example.com`
  - If the host cannot set environment variables, verify `sitemap.php` generates the correct domain after upload.
- [ ] Update `robots.txt` sitemap line if needed:
  - `Sitemap: https://example.com/sitemap.php`
- [ ] Check product SEO title/description in CMS.
- [ ] Check blog SEO title/description in CMS.
- [ ] Open `/sitemap.php` in browser and confirm product/blog URLs are correct.

## Security

- [ ] Confirm `.htaccess` is supported if hosting uses Apache or LiteSpeed.
- [ ] If hosting uses IIS, confirm `data/web.config` blocks `data/`.
- [ ] Test that these URLs are blocked after upload:
  - `/data/ones.sqlite`
  - `/data/backups/`
  - `/.env`
- [ ] Confirm admin page is not indexed:
  - `/robots.txt` disallows `/admin.html`, `/api.php`, `/data/`.
- [ ] Do not keep backup JSON files in public downloads or email inboxes longer than needed.

## Final QA

- [ ] Register a customer.
- [ ] Login as customer.
- [ ] Add product to cart.
- [ ] Update quantity in cart.
- [ ] Submit inquiry with phone number.
- [ ] Confirm inquiry appears in CMS orders.
- [ ] Change order status in CMS.
- [ ] Test product image upload.
- [ ] Test blog image upload.
- [ ] Test manual upload/download.
- [ ] Test mobile layout on at least 360px, 390px, and desktop width.
- [ ] Test dark mode on public website, customer pages, and CMS.
