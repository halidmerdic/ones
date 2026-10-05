const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const baseURL = process.env.ONES_TEST_URL;
if (!baseURL || new URL(baseURL).hostname !== '127.0.0.1' || process.env.ONES_DISPOSABLE_TEST !== '1') throw Error('Disposable loopback only');
let checks = 0;
async function post(ctx, action, data) {
  const token = await (await ctx.get(baseURL + '/api.php?action=csrf-token')).json();
  return ctx.post(baseURL + '/api.php?action=' + action, { data, headers: { 'X-CSRF-Token': token.csrfToken } });
}
const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 820, height: 1000 }, hasTouch: true });
    const email = 'cart-recovery-' + Date.now() + '@example.invalid';
    const registered = await post(context.request, 'customer-register', { name: 'Recovery Test', email, acceptedPrivacy: true });
    assert.equal(registered.status(), 200);
    await require('./mail-helper.cjs').activateCustomer(context.request, baseURL, email, 'Recovery customer password 2026!');
    const cms = await (await context.request.get(baseURL + '/api.php?action=cms')).json();
    const productId = cms.cms.products.find(p => p.enabled !== false).id;
    await post(context.request, 'cart-add', { productId, quantity: 1 });
    const original = await (await context.request.get(baseURL + '/api.php?action=cart')).json();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', dialog => dialog.dismiss());
    await page.route('**/api.php?action=cart', route => json(route, 500, { ok: false, message: 'Load failed' }));
    await page.goto(baseURL + '/cart.html');
    await page.locator('.admin-toast').filter({ hasText: 'Load failed' }).waitFor();
    assert.equal(await page.locator('#submitOrderBtn').isEnabled(), false);
    assert.deepEqual(errors, []);
    checks += 2;
    await page.unroute('**/api.php?action=cart');
    const unavailable = structuredClone(original);
    unavailable.cart.items[0].product.enabled = false;
    await page.route('**/api.php?action=cart', route => json(route, 200, unavailable));
    await page.reload();
    await page.locator('#cartSummaryText').filter({ hasText: 'više nije dostupan' }).waitFor();
    assert.equal(await page.locator('#submitOrderBtn').isEnabled(), false);
    assert.equal(await page.locator('[data-remove]').isEnabled(), true);
    checks += 2;
    await page.unroute('**/api.php?action=cart');
    await page.evaluate(() => loadCart());
    await page.route('**/api.php?action=cart-update', route => json(route, 500, { ok: false, message: 'Mutation failed' }));
    await page.locator('[data-qty]').last().click();
    await page.locator('.admin-toast').filter({ hasText: 'Mutation failed' }).waitFor();
    assert.equal(await page.locator('#submitOrderBtn').isEnabled(), true);
    assert.equal(await page.locator('[data-qty]').last().isEnabled(), true);
    checks += 2;
    await page.locator('#orderPhone').fill('061123456');
    await page.locator('#orderNote').fill('Lost response preserves this note');
    const label = await page.locator('#submitOrderBtn').textContent();
    let requests = 0;
    await page.route('**/api.php?action=order-submit', async route => {
      requests++;
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      await route.abort('failed');
    });
    // Cache failures after load must not mask a confirmed server result or block recovery.
    await page.evaluate(() => {
      Storage.prototype.setItem = Storage.prototype.removeItem = Storage.prototype.getItem = () => { throw Error('Storage unavailable'); };
    });
    await page.locator('#submitOrderBtn').click();
    await page.locator('.admin-toast').filter({ hasText: 'Slanje nije potvrđeno' }).waitFor();
    assert.equal(requests, 1);
    assert.equal(await page.locator('#submitOrderBtn').textContent(), label);
    assert.equal(await page.locator('#submitOrderBtn').isEnabled(), false);
    assert.equal(await page.locator('#orderNote').isEnabled(), true);
    assert.equal(await page.locator('#orderNote').inputValue(), 'Lost response preserves this note');
    assert.equal(await page.locator('#orderSuccess').isVisible(), false);
    assert.equal((await (await context.request.get(baseURL + '/api.php?action=customer-profile')).json()).orders.length, 1);
    assert.deepEqual(errors, []);
    checks += 8;
    console.log('Cart recovery HTTP/browser checks passed: ' + checks);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
