// Run with NODE_PATH pointing to a Playwright installation; no live data is used.
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const fixture = JSON.parse(execFileSync(process.env.PHP_BINARY || 'php', [path.join(__dirname, 'cms-xss.php'), '--json'], { encoding: 'utf8' }));
const adminCsp = fs.readFileSync(path.join(root, '.htaccess'), 'utf8').match(/<Files "admin.html">[\s\S]*?Content-Security-Policy "([^"]+)"/)[1];

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  let checks = 0;
  try {
    for (const width of [320, 360, 390, 768, 820, 1024, 1440]) {
      for (const dark of [false, true]) {
        const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width <= 1024 });
        const errors = [];
        const page = await context.newPage();
        page.on('pageerror', e => errors.push(e.message));
        await context.addInitScript(value => localStorage.setItem('onesTheme:admin', value), dark ? 'dark' : 'light');
        await page.route('**/*', async route => {
          const url = new URL(route.request().url());
          if (url.hostname !== 'ones.test') return route.abort();
          if (url.pathname === '/api.php') {
            const action = url.searchParams.get('action');
            const responses = {
              'admin-status': { ok: true, loggedIn: true },
              'admin-cms': { ok: true, cms: fixture.cms, revision: 1 },
              'admin-orders': { ok: true, orders: [] },
              'admin-customers': { ok: true, customers: [] },
              'csrf-token': { ok: true, csrfToken: 'test-csrf' },
            };
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(responses[action] || { ok: true }) });
          }
          const file = path.resolve(root, '.' + url.pathname);
          if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
          const type = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream';
          // Test sanitizers without CSP first, to ensure CSP cannot mask a bypass.
          await route.fulfill({ contentType: type, body: fs.readFileSync(file) });
        });
        await page.goto('http://ones.test/admin.html?panel=products');
        await page.waitForFunction(() => !document.querySelector('#adminEditor').hidden && document.querySelector('[data-edit-product]'));
        assert.equal(await page.locator('html').getAttribute('data-theme'), dark ? 'dark' : 'light');
        checks++;
        await page.evaluate(({ payloads, sanitized, format }) => {
          window.__auditXss = 0;
          const host = document.createElement('div');
          host.id = 'security-test';
          document.body.append(host);
          const badPath = 'x" onerror="window.__auditXss=1';
          const badTitle = '<img src=x onerror="window.__auditXss=1">';
          host.append(imageUploadField(badTitle, badPath, () => {}));
          host.append(blogImageUploadField({ title: badTitle, image: badPath }));
          host.append(manualUploadField({ file: 'javascript:window.__auditXss=1' }));
          cms.manuals.push({ type: 'Uputstvo', relatedProductId: cms.products[0].id, file: badPath });
          host.append(productManualField(cms.products[0]));
          host.append(galleryField({ gallery: [badPath, 'javascript:window.__auditXss=1'] }));
          host.append(card(badTitle, () => {}));
          for (const html of [...payloads, ...sanitized]) host.append(richTextField('Test', html, () => {}));
          const rich = richTextField('Format', format, () => {});
          rich.id = 'valid-format';
          host.append(rich);
          const editor = rich.querySelector('.rich-text-editor');
          editor.focus();
          const clipboard = new DataTransfer();
          clipboard.setData('text/html', '<p><strong>Zalijepljeno</strong><img src=x onerror="window.__auditXss=1"></p>');
          editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }));
          const drop = new DataTransfer();
          drop.setData('text/html', '<svg onload="window.__auditXss=1"></svg><em>Drop</em>');
          editor.dispatchEvent(new DragEvent('drop', { dataTransfer: drop, bubbles: true, cancelable: true }));
        }, fixture);
        await page.waitForTimeout(100);
        assert.equal(await page.evaluate(() => window.__auditXss), 0);
        assert.equal(await page.locator('#security-test [onerror], #security-test [onload], #security-test script, #security-test svg, #security-test iframe, #security-test a[href^="javascript:"]').count(), 0);
        assert.ok(await page.locator('#valid-format strong').count());
        assert.ok(await page.locator('#valid-format font[size="5"]').count());
        assert.deepEqual(errors, []);
        checks += 5;
        // Verify the configured admin CSP itself prevents inline script.
        await page.route('**/admin.html?csp-test', route => route.fulfill({
          contentType: 'text/html', headers: { 'Content-Security-Policy': adminCsp },
          body: '<script>window.__cspBypass=1</script><script src="api-client.js"></script>',
        }));
        await page.goto('http://ones.test/admin.html?csp-test');
        assert.equal(await page.evaluate(() => window.__cspBypass), undefined);
        assert.equal(await page.evaluate(() => typeof window.onesApi), 'function');
        checks += 2;
        await context.close();
      }
    }
    console.log('CMS XSS browser checks passed: ' + checks + ' (7 widths × 2 themes)');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
