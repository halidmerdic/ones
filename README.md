# oneS website

First static version of the oneS ecommerce catalog.

Run the local PHP server first:

```text
php -S 127.0.0.1:8000
```

Then open:

```text
http://127.0.0.1:8000/index.html
```

The SQLite database is created automatically at `data/ones.sqlite`.

Deployment preparation notes are in `DEPLOYMENT.md`.

Important: GitHub Pages is static hosting only. Registration, cart, CMS, uploads, and admin login require PHP hosting because they use `api.php`, SQLite, and sessions.

For PHP hosting with MySQL, fill in `config.local.php` and set:

```php
'driver' => 'mysql',
```

Then enter the MySQL host, database name, username, and password from the hosting panel. Keep this file private and upload it manually to the hosting account with the rest of the site files.

## CMS

Open `http://127.0.0.1:8000/admin.html` to manage the website content.

Demo password:

```text
onesadmin
```

Keep this password only during development. Change it before real deployment.

The CMS saves content in the SQLite database. After saving, refresh the public website to see changes.

You can edit:

- WhatsApp and Viber phone numbers
- product categories
- products and specifications
- coming soon products
- spare parts marked as coming soon
- manuals and documents
- store locations
- blog posts
- FAQ questions and answers

Customer login is available at `http://127.0.0.1:8000/login.html`.

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

This is the first database-backed CMS version. Later, the same structure can grow into image uploads, PDF uploads, hosting, and full cart checkout.

## Deployment and security

- `data/` contains the SQLite database and backup files. It must stay private on hosting.
- `uploads/` must stay public for product images, blog images, and manuals, but it should not execute scripts.
- Apache/LiteSpeed protection files are included:
  - `.htaccess`
  - `data/.htaccess`
  - `data/backups/.htaccess`
  - `uploads/.htaccess`
- IIS protection for the database folder is included in `data/web.config`.
- The sitemap can use `ONES_SITE_URL=https://your-domain.com` on production.
- Full pre-launch checklist is in `DEPLOYMENT.md`.
- The CMS also includes a `Provjera` panel for tracking launch QA items directly in the admin interface.

## Included sections

- Početna
- Kategorije
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

## Later additions

- English language version
- bundles
- production email sending
- final online payment flow, if needed later
