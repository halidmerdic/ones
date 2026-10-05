// Run against a fresh disposable package seeded with a local demo admin.
const { chromium, request } = require('playwright');
const assert = require('node:assert/strict');
const baseURL = process.env.ONES_TEST_URL;
if (!baseURL || new URL(baseURL).hostname !== '127.0.0.1' || process.env.ONES_DISPOSABLE_TEST !== '1') {
  throw Error('Requires ONES_TEST_URL on disposable loopback and ONES_DISPOSABLE_TEST=1');
}
let checks = 0;
async function post(ctx, action, data) {
  const token = await (await ctx.get(baseURL + '/api.php?action=csrf-token')).json();
  return ctx.post(baseURL + '/api.php?action=' + action, { data, headers: { 'X-CSRF-Token': token.csrfToken } });
}
(async () => {
  const admin = await request.newContext();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    assert.equal((await post(admin, 'admin-login', { password: 'onesadmin' })).status(), 200);
    for (const action of ['admin-cms', 'admin-orders', 'admin-customers', 'backup-download', 'admin-order-status', 'admin-order-note', 'backup-restore', 'upload-product-image', 'upload-blog-image', 'upload-manual', 'save-cms', 'reset-cms']) {
      const response = await post(admin, action, {});
      assert.equal(response.status(), 403, action);
      assert.equal((await response.json()).code, 'ADMIN_PASSWORD_CHANGE_REQUIRED', action);
      checks += 2;
    }
    assert.equal((await post(admin, 'admin-password-update', { currentPassword: 'onesadmin', newPassword: 'PROMIJENI-U-JAKU-LOZINKU' })).status(), 400);
    checks++;
    for (const width of [320, 360, 390, 768, 820, 1024, 1440]) {
      for (const dark of [false, true]) {
        const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width <= 1024 });
        await context.addInitScript(dark => localStorage.setItem('onesTheme:admin', dark ? 'dark' : 'light'), dark);
        const page = await context.newPage();
        const errors = [];
        const privateLoads = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('request', r => { if (/action=(admin-cms|admin-orders|admin-customers)/.test(r.url())) privateLoads.push(r.url()); });
        await page.goto(baseURL + '/admin.html?panel=products&product=demo');
        await page.locator('#passwordInput').fill('onesadmin');
        await page.locator('#loginBtn').click();
        await page.locator('#adminCurrentPassword').waitFor();
        assert.equal(await page.locator('[data-panel-btn]').count(), 1);
        assert.equal(await page.locator('#saveBtn').isVisible(), false);
        assert.equal(await page.locator('#securityRestoreBackupBtn').isVisible(), false);
        assert.equal(await page.locator('#securityBackupBtn').isVisible(), false);
        assert.equal(await page.locator('#securityResetBtn').isVisible(), false);
        assert.equal(await page.locator('html').getAttribute('data-theme'), dark ? 'dark' : 'light');
        assert.deepEqual(privateLoads, []);
        await page.reload();
        await page.locator('#adminCurrentPassword').waitFor();
        assert.equal(await page.locator('[data-panel-btn]').count(), 1);
        assert.deepEqual(errors, []);
        checks += 9;
        await context.close();
      }
    }
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await post(context.request, 'admin-login', { password: 'onesadmin' });
    const page = await context.newPage();
    await page.goto(baseURL + '/admin.html?panel=security');
    await page.locator('#adminCurrentPassword').fill('onesadmin');
    await page.locator('#adminNewPassword').fill('Segment two permanent admin 2026!');
    await page.locator('#adminConfirmPassword').fill('Segment two permanent admin 2026!');
    await page.locator('#adminPasswordUpdateBtn').click();
    await page.waitForFunction(() => !document.querySelector('#saveBtn').hidden);
    assert.ok(await page.locator('[data-panel-btn]').count() > 1);
    assert.equal((await context.request.get(baseURL + '/api.php?action=admin-cms')).status(), 200);
    assert.equal((await admin.get(baseURL + '/api.php?action=admin-cms')).status(), 401);
    assert.equal((await post(admin, 'admin-login', { password: 'onesadmin' })).status(), 401);
    checks += 4;
    await context.close();
    console.log('Admin bootstrap HTTP/browser checks passed: ' + checks);
  } finally { await admin.dispose(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
