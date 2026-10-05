// Disposable MariaDB fixture: demo admin, production Host policy, private recovery configured.
const { request } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const baseURL = process.env.ONES_TEST_URL;
if (!baseURL || new URL(baseURL).hostname !== '127.0.0.1' || process.env.ONES_DISPOSABLE_TEST !== '1' || !process.env.ONES_TEST_DEMO_BACKUP) {
  throw Error('Requires a disposable loopback production-policy fixture and ONES_TEST_DEMO_BACKUP');
}
const recovery = 'Private bootstrap fixture 2026!';
const permanent = 'Permanent production fixture 2026!';
let checks = 0;
async function post(ctx, action, data) {
  const token = await (await ctx.get(baseURL + '/api.php?action=csrf-token')).json();
  return ctx.post(baseURL + '/api.php?action=' + action, { data, headers: { 'X-CSRF-Token': token.csrfToken } });
}
(async () => {
  const ctx = await request.newContext({ extraHTTPHeaders: { Host: 'ones.ba' } });
  const second = await request.newContext({ extraHTTPHeaders: { Host: 'ones.ba' } });
  try {
    assert.equal((await post(ctx, 'admin-login', { password: 'onesadmin' })).status(), 401);
    assert.equal((await post(ctx, 'admin-login', { password: recovery })).status(), 200);
    assert.equal((await post(second, 'admin-login', { password: recovery })).status(), 200);
    assert.equal((await (await ctx.get(baseURL + '/api.php?action=admin-status')).json()).passwordNeedsChange, true);
    assert.equal((await ctx.get(baseURL + '/api.php?action=admin-cms')).status(), 403);
    assert.equal((await post(ctx, 'admin-password-update', { currentPassword: 'onesadmin', newPassword: permanent })).status(), 401);
    assert.equal((await post(ctx, 'admin-password-update', { currentPassword: recovery, newPassword: permanent })).status(), 200);
    assert.equal((await ctx.get(baseURL + '/api.php?action=admin-cms')).status(), 200);
    assert.equal((await second.get(baseURL + '/api.php?action=admin-cms')).status(), 401);
    assert.equal((await post(second, 'admin-login', { password: recovery })).status(), 401);
    checks += 10;
    const before = await (await ctx.get(baseURL + '/api.php?action=admin-cms')).json();
    const token = await (await ctx.get(baseURL + '/api.php?action=csrf-token')).json();
    const restore = await ctx.post(baseURL + '/api.php?action=backup-restore', {
      headers: { 'X-CSRF-Token': token.csrfToken },
      multipart: { backup: { name: 'demo.json', mimeType: 'application/json', buffer: fs.readFileSync(process.env.ONES_TEST_DEMO_BACKUP) } },
    });
    assert.equal(restore.status(), 400);
    assert.match((await restore.json()).message, /demonstracijsku/);
    assert.deepEqual(await (await ctx.get(baseURL + '/api.php?action=admin-cms')).json(), before);
    assert.equal((await post(second, 'admin-login', { password: permanent })).status(), 200);
    checks += 4;
    console.log('Production-policy MariaDB HTTP checks passed: ' + checks);
  } finally { await ctx.dispose(); await second.dispose(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
