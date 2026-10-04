// Requires a disposable packaged server, NEVER a live/project-data server.
const { chromium, request } = require('playwright');
const assert = require('node:assert/strict');
const baseURL = process.env.ONES_TEST_URL;
if (!baseURL || new URL(baseURL).hostname !== '127.0.0.1' || process.env.ONES_DISPOSABLE_TEST !== '1') {
  throw Error('Set ONES_TEST_URL to a disposable loopback server and ONES_DISPOSABLE_TEST=1');
}
const adminPassword = 'Segment one admin password 2026!';
const customerPassword = 'Segment one customer password 2026!';
const testEmail = 'segment-' + Date.now() + '@example.invalid';
let checks = 0;
const contexts = [];
let browser;
async function get(ctx, action) {
  const response = await ctx.get(baseURL + '/api.php?action=' + action);
  assert.equal(response.status(), 200);
  return response.json();
}
async function post(ctx, action, data) {
  const token = (await get(ctx, 'csrf-token')).csrfToken;
  return ctx.post(baseURL + '/api.php?action=' + action, { data, headers: { 'X-CSRF-Token': token } });
}
async function restore(ctx, backup) {
  const token = (await get(ctx, 'csrf-token')).csrfToken;
  return ctx.post(baseURL + '/api.php?action=backup-restore', {
    headers: { 'X-CSRF-Token': token },
    multipart: { backup: { name: 'test.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) } },
  });
}
async function apiContext() {
  const ctx = await request.newContext();
  contexts.push(ctx);
  return ctx;
}
(async () => {
  const admin = await apiContext();
  const secondAdmin = await apiContext();
  const customer = await apiContext();
  assert.equal((await post(admin, 'admin-login', { password: adminPassword })).status(), 200);
  assert.equal((await post(secondAdmin, 'admin-login', { password: adminPassword })).status(), 200);
  assert.equal((await post(customer, 'customer-register', { name: 'Original customer', email: testEmail, password: customerPassword, acceptedPrivacy: true })).status(), 200);
  let current = await get(admin, 'admin-cms');
  const unsafe = structuredClone(current.cms);
  unsafe.products[0].image = 'x" onerror="window.__auditXss=1';
  assert.equal((await post(admin, 'save-cms', { cms: unsafe, revision: current.revision })).status(), 422);
  checks++;
  const cms = structuredClone(current.cms);
  cms.products[0].detailedDescription = '<p><strong>Sigurno</strong><img src=x /onerror="window.__auditXss=1"></p>';
  cms.blogs[0].title = '<img src=x onerror="window.__auditXss=1">';
  assert.equal((await post(admin, 'save-cms', { cms, revision: current.revision })).status(), 200);
  current = await get(admin, 'admin-cms');
  assert.equal(current.cms.products[0].detailedDescription, '<p><strong>Sigurno</strong></p>');
  checks += 2;
  const backup = await get(admin, 'backup-download');
  const invalid = structuredClone(backup);
  invalid.tables.users = [];
  assert.equal((await restore(admin, invalid)).status(), 400);
  assert.equal((await get(admin, 'admin-status')).loggedIn, true);
  assert.equal((await get(customer, 'customer-status')).loggedIn, true);
  assert.deepEqual(await get(admin, 'admin-cms'), current);
  checks += 4;
  for (const mutate of [
    value => { value.cms.products[0].id = []; },
    value => { value.cms.contact.whatsapp = []; },
  ]) {
    const malformed = structuredClone(backup);
    mutate(malformed);
    const rejected = await restore(admin, malformed);
    assert.equal(rejected.status(), 400);
    assert.equal((await rejected.json()).ok, false);
    checks += 2;
  }
  const replacement = backup.tables.users.find(user => user.email === testEmail);
  replacement.name = 'Replacement customer';
  replacement.email = 'replacement-' + Date.now() + '@example.invalid';
  const result = await restore(admin, backup);
  assert.equal(result.status(), 200);
  const restored = await result.json();
  assert.equal(restored.reauthenticate, true);
  assert.equal(restored.cms, undefined);
  assert.equal(restored.orders, undefined);
  assert.equal((await get(admin, 'admin-status')).loggedIn, false);
  assert.equal((await get(secondAdmin, 'admin-status')).loggedIn, false);
  assert.equal((await get(customer, 'customer-status')).loggedIn, false);
  assert.equal((await secondAdmin.get(baseURL + '/api.php?action=admin-cms')).status(), 401);
  checks += 8;
  assert.equal((await post(customer, 'customer-login', { email: replacement.email, password: customerPassword })).status(), 200);
  assert.equal((await get(customer, 'customer-status')).loggedIn, true);
  checks += 2;
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  for (const width of [320, 360, 390, 768, 820, 1024, 1440]) {
    for (const dark of [false, true]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width <= 1024 });
      await context.addInitScript(value => localStorage.setItem('onesTheme:admin', value), dark ? 'dark' : 'light');
      assert.equal((await post(context.request, 'admin-login', { password: adminPassword })).status(), 200);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', dialog => dialog.accept(dialog.type() === 'prompt' ? 'VRATI' : undefined));
      await page.goto(baseURL + '/admin.html?panel=products');
      await page.waitForFunction(() => !document.querySelector('#adminEditor').hidden && document.querySelector('[data-edit-product]'));
      assert.equal(await page.locator('html').getAttribute('data-theme'), dark ? 'dark' : 'light');
      await page.locator('[data-edit-product]').first().click();
      await page.locator('#productEditModal .rich-text-editor').waitFor();
      assert.equal(await page.locator('#productEditModal .rich-text-editor strong').textContent(), 'Sigurno');
      assert.equal(await page.locator('#productEditModal [onerror]').count(), 0);
      // Restore with an open editor also has to discard stale modal state.
      const nextBackup = await get(context.request, 'backup-download');
      const response = page.waitForResponse(response => response.url().includes('action=backup-restore'));
      await page.locator('#restoreBackupInput').setInputFiles({
        name: 'test.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(nextBackup)),
      });
      assert.equal((await response).status(), 200);
      await page.waitForFunction(() => !document.querySelector('#loginPanel').hidden && document.querySelector('#adminEditor').hidden);
      assert.equal(await page.locator('#passwordInput').evaluate(element => document.activeElement === element), true);
      assert.equal((await get(context.request, 'admin-status')).loggedIn, false);
      assert.deepEqual(errors, []);
      assert.equal(await page.locator('.product-edit-modal').count(), 0);
      assert.equal(await page.evaluate(() => editingProductId), null);
      // An actual form login must work again with restored credentials.
      await page.locator('#passwordInput').fill(adminPassword);
      await page.locator('#loginBtn').click();
      await page.waitForFunction(() => !document.querySelector('#adminEditor').hidden);
      assert.equal((await get(context.request, 'admin-status')).loggedIn, true);
      checks += 10;
      await context.close();
    }
  }
  console.log('Segment 1 HTTP/browser checks passed: ' + checks + ' (7 widths × 2 themes)');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  await Promise.all(contexts.map(context => context.dispose()));
});
