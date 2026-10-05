const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const baseURL = process.env.ONES_TEST_URL;
if (!baseURL || new URL(baseURL).hostname !== '127.0.0.1' || process.env.ONES_DISPOSABLE_TEST !== '1') throw Error('Disposable loopback server required');
let checks = 0;
async function post(ctx, action, data) {
  const token = await (await ctx.get(baseURL + '/api.php?action=csrf-token')).json();
  return ctx.post(baseURL + '/api.php?action=' + action, { data, headers: { 'X-CSRF-Token': token.csrfToken } });
}
async function until(predicate) {
  const deadline = Date.now() + 10000;
  while (!predicate()) { if (Date.now() > deadline) throw Error('Request not observed'); await new Promise(r => setTimeout(r, 10)); }
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [320, 360, 390, 768, 820, 1024, 1440]) for (const dark of [false, true]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width <= 1024 });
      await context.addInitScript(dark => localStorage.setItem('onesTheme:admin', dark ? 'dark' : 'light'), dark);
      assert.equal((await post(context.request, 'admin-login', { password: 'Segment one admin password 2026!' })).status(), 200);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(baseURL + '/admin.html?panel=products');
      await page.locator('[data-edit-product]').first().click();
      const name = page.locator('#productEditModal').getByLabel('Naziv', { exact: true });
      const originalName = await name.inputValue();
      const title = 'Save fixture ' + width + ' ' + dark;
      await name.fill(title);
      let pending;
      let requests = 0;
      await page.route('**/api.php?action=save-cms', route => { requests++; pending = route; });
      await page.locator('#saveProductCmsBtn').click();
      await until(() => pending);
      assert.equal(await page.locator('#adminEditor').evaluate(e => e.inert), true);
      assert.equal(await page.locator('#productEditModal').evaluate(e => e.inert), true);
      assert.equal(await page.locator('#adminNav').evaluate(e => e.inert), true);
      assert.equal(await page.locator('#saveBtn').isEnabled(), false);
      assert.equal(await page.locator('html').getAttribute('data-theme'), dark ? 'dark' : 'light');
      await page.keyboard.type('Should not overwrite sent draft');
      await page.keyboard.press('Escape');
      assert.equal(await name.inputValue(), title);
      assert.equal(await page.locator('#productEditModal').count(), 1);
      await page.evaluate(() => { void saveCms(); void activatePanel('security'); window.dispatchEvent(new StorageEvent('storage', { key: 'onesCmsUpdatedAt', newValue: 'test' })); });
      assert.equal(requests, 1);
      await pending.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ ok: false, message: 'Save validation fixture' }) });
      await page.waitForFunction(() => !cmsSaving);
      assert.equal(await name.inputValue(), title);
      assert.equal(await page.locator('#productEditModal').evaluate(e => e.inert), false);
      assert.equal(await page.locator('#saveBtn').evaluate(e => e.classList.contains('has-unsaved')), true);
      await name.fill(title + ' corrected');
      pending = null;
      await page.locator('#saveProductCmsBtn').click();
      await until(() => pending);
      await pending.continue();
      await page.waitForFunction(() => !cmsSaving);
      assert.equal(await name.inputValue(), title + ' corrected');
      assert.equal(await page.locator('#saveBtn').evaluate(e => e.classList.contains('has-unsaved')), false);
      const stored = await (await context.request.get(baseURL + '/api.php?action=admin-cms')).json();
      assert.ok(stored.cms.products.some(p => p.name === title + ' corrected'));
      // Upload still in flight cannot detach its target object through a save response.
      let upload;
      await page.route('**/api.php?action=upload-product-image', route => { upload = route; });
      await page.locator('#productEditModal input[type=file][accept="image/*"]').first().setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64') });
      await until(() => upload);
      assert.equal(await page.locator('#saveProductCmsBtn').isEnabled(), false);
      const before = requests;
      await page.evaluate(() => saveCms());
      assert.equal(requests, before);
      await upload.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, file: { path: 'assets/ones-logo.webp' } }) });
      await page.waitForFunction(() => cmsPendingUploads === 0);
      assert.equal(await page.locator('#saveProductCmsBtn').isEnabled(), true);
      assert.equal(await page.evaluate(() => cms.products.find(p => p.id === editingProductId).image), 'assets/ones-logo.webp');
      // Network failure must release the same locks and keep the draft.
      await name.fill(title + ' network draft');
      pending = null;
      await page.locator('#saveProductCmsBtn').click();
      await until(() => pending);
      await pending.abort('failed');
      await page.waitForFunction(() => !cmsSaving);
      assert.equal(await page.locator('#adminEditor').evaluate(e => e.inert), false);
      assert.equal(await page.locator('#saveBtn').evaluate(e => e.classList.contains('has-unsaved')), true);
      assert.deepEqual(errors, []);
      checks += 21;
      // Avoid carrying a renamed product into visibility keyword tests from earlier segments.
      await page.unroute('**/api.php?action=save-cms');
      await name.fill(originalName);
      await page.locator('#saveProductCmsBtn').click();
      await page.waitForFunction(() => !cmsSaving);
      await context.close();
    }
    console.log('CMS save browser checks passed: ' + checks + ' (7 widths, 2 themes)');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
