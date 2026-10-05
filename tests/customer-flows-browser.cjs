// Real local API for authentication/cart; controlled responses for failure scenarios.
const { chromium, request } = require('playwright');
const assert = require('node:assert/strict');
const baseURL = process.env.ONES_TEST_URL;
if (!baseURL || new URL(baseURL).hostname !== '127.0.0.1' || process.env.ONES_DISPOSABLE_TEST !== '1') {
  throw Error('Requires ONES_TEST_URL on disposable loopback and ONES_DISPOSABLE_TEST=1');
}
const email = 'segment2-' + Date.now() + '@example.invalid';
const password = 'Segment two customer password 2026!';
let checks = 0;
async function get(ctx, action) {
  const response = await ctx.get(baseURL + '/api.php?action=' + action);
  assert.equal(response.status(), 200);
  return response.json();
}
async function post(ctx, action, data) {
  return ctx.post(baseURL + '/api.php?action=' + action, {
    data, headers: { 'X-CSRF-Token': (await get(ctx, 'csrf-token')).csrfToken },
  });
}
function json(route, status, value) { return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) }); }
async function readyButton(page) { await page.waitForFunction(() => !document.querySelector('#submitOrderBtn').disabled); }
async function logoutChecks(browser, path, width, dark, lostResponse = false) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width <= 1024 });
  try {
    await context.addInitScript(dark => localStorage.setItem('onesTheme:store:last', dark ? 'dark' : 'light'), dark);
    assert.equal((await post(context.request, 'customer-login', { email, password })).status(), 200);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(baseURL + '/' + path);
    const profile = path.startsWith('profile');
    if (profile) await page.waitForFunction(() => document.querySelector('#profileNameInput').value === 'Segment Two');
    else await page.waitForFunction(() => document.querySelector('#accountLink').classList.contains('account-active'));
    if (path === 'index.html') await page.locator('#productGrid .product-card').first().waitFor();
    await page.evaluate(() => {
      sessionStorage.setItem('onesCustomerPreview', JSON.stringify({ name: 'Segment Two' }));
      localStorage.setItem('onesCartCountPreview', '1');
    });
    let pending;
    let requests = 0;
    await page.route('**/api.php?action=customer-logout', async route => { requests++; pending = route; });
    // Account menu triggers vary with viewport; open the same existing menu via its handler.
    if (!profile) await page.locator('#accountLink').dispatchEvent('click');
    let selector = profile ? '#profileLogoutBtn' : '#logoutBtn';
    if (profile && !await page.locator(selector).isVisible()) {
      await page.locator('[aria-controls="profileMobileNav"]').click();
      selector = '#profileMobileLogoutBtn';
    }
    assert.equal(await page.locator('html').getAttribute('data-theme'), dark ? 'dark' : 'light');
    const button = page.locator(selector);
    await button.click();
    await page.waitForFunction(selector => document.querySelector(selector).disabled, selector);
    while (!pending) await new Promise(resolve => setTimeout(resolve, 10));
    await page.evaluate(profile => { void (profile ? logout() : logoutCustomer()); }, profile);
    assert.equal(requests, 1);
    await pending.abort('failed');
    await page.waitForFunction(() => [...document.querySelectorAll('.admin-toast')].some(n => n.textContent.includes('Odjava nije potvrđena')));
    assert.equal((await get(context.request, 'customer-status')).loggedIn, true);
    assert.ok(await page.evaluate(() => sessionStorage.getItem('onesCustomerPreview')));
    assert.equal(await button.isEnabled(), true);
    assert.equal(await page.locator('.admin-toast').filter({ hasText: 'Odjavljeni ste.' }).count(), 0);
    if (!profile) assert.equal(await page.locator('#accountLink').getAttribute('href'), 'profile.html');
    await page.unroute('**/api.php?action=customer-logout');
    if (lostResponse) {
      await page.route('**/api.php?action=customer-logout', async route => {
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        await route.abort('failed');
      });
    }
    await button.click();
    if (profile) await page.waitForURL('**/login.html');
    else await page.waitForFunction(() => document.querySelector('#accountLink').getAttribute('href') === 'login.html');
    assert.equal((await get(context.request, 'customer-status')).loggedIn, false);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('onesCustomerPreview')), null);
    assert.equal(Number(await page.evaluate(() => localStorage.getItem('onesCartCountPreview'))), 0);
    assert.deepEqual(errors, []);
    checks += profile ? 11 : 12;
  } finally { await context.close(); }
}
async function cartChecks(browser, width, dark) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width <= 1024 });
  try {
    await context.addInitScript(dark => localStorage.setItem('onesTheme:store:last', dark ? 'dark' : 'light'), dark);
    await post(context.request, 'customer-login', { email, password });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', dialog => dialog.dismiss());
    await page.goto(baseURL + '/cart.html');
    await readyButton(page);
    assert.equal(await page.locator('html').getAttribute('data-theme'), dark ? 'dark' : 'light');
    checks++;
    const label = await page.locator('#submitOrderBtn').textContent();
    const originalCart = (await get(context.request, 'cart')).cart;
    await page.locator('#orderPhone').fill('061123456');
    await page.locator('#orderNote').fill('Sačuvaj napomenu nakon greške');
    let mode = 400;
    let pending;
    let submissions = 0;
    let mutations = 0;
    await page.route('**/api.php?action=order-submit', async route => {
      submissions++;
      if (mode === 'hold') { pending = route; return; }
      if (mode === 'network') return route.abort('failed');
      return json(route, mode, { ok: false, message: 'Test greška ' + mode });
    });
    for (const failure of [400, 429, 'network']) {
      mode = failure;
      await page.locator('#submitOrderBtn').click();
      await readyButton(page);
      assert.equal(await page.locator('#submitOrderBtn').textContent(), label);
      assert.equal(await page.locator('#orderNote').inputValue(), 'Sačuvaj napomenu nakon greške');
      assert.equal(await page.locator('#orderPhone').isEnabled(), true);
      assert.equal(await page.locator('[data-qty]').first().isEnabled(), true);
      checks += 4;
    }
    await page.route('**/api.php?action=cart-update', async route => { mutations++; pending = route; });
    await page.locator('[data-qty]').last().click();
    while (mutations === 0) await new Promise(resolve => setTimeout(resolve, 10));
    const beforeBlockedSubmit = submissions;
    await page.evaluate(() => { void submitOrder(); });
    assert.equal(submissions, beforeBlockedSubmit);
    assert.equal(await page.locator('#submitOrderBtn').isEnabled(), false);
    await json(pending, 200, { ok: true, cart: originalCart });
    await readyButton(page);
    checks += 2;
    mode = 'hold'; pending = null;
    const before = submissions;
    await page.locator('#submitOrderBtn').click();
    while (!pending) await new Promise(resolve => setTimeout(resolve, 10));
    await page.evaluate(() => { void submitOrder(); void updateQuantity(1, 2); void removeItem(1); });
    assert.equal(submissions, before + 1);
    assert.equal(mutations, 1);
    assert.equal(await page.locator('[data-remove]').first().isEnabled(), false);
    assert.equal(await page.locator('#orderPhone').isEnabled(), false);
    assert.equal(await page.locator('#orderNote').isEnabled(), false);
    await json(pending, 200, { ok: true, order: { id: 123 }, cart: { items: [], count: 0 } });
    await page.locator('#orderSuccess').waitFor();
    await page.waitForFunction(label => document.querySelector('#submitOrderBtn').textContent === label, label);
    assert.equal(await page.locator('#submitOrderBtn').isEnabled(), false);
    assert.equal(await page.locator('#orderNote').inputValue(), '');
    // A newly populated cart on the same page must allow a second submission.
    await page.evaluate(() => loadCart());
    await readyButton(page);
    pending = null;
    await page.locator('#submitOrderBtn').click();
    while (!pending) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(submissions, before + 2);
    // Expired session after the second click must release controls and request login.
    await page.route('**/login.html', route => route.fulfill({ contentType: 'text/html', body: '<h1>Login</h1>' }));
    await json(pending, 401, { ok: false, message: 'Prijavite se da koristite korpu.' });
    await page.waitForURL('**/login.html');
    assert.deepEqual(errors, []);
    checks += 9;
  } finally { await context.close(); }
}
(async () => {
  const ctx = await request.newContext();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    assert.equal((await post(ctx, 'customer-register', { name: 'Segment Two', email, password, acceptedPrivacy: true })).status(), 200);
    const cms = (await get(ctx, 'cms')).cms;
    const product = cms.products.find(p => p.enabled !== false);
    assert.ok(product);
    assert.equal((await post(ctx, 'cart-add', { productId: product.id, quantity: 1 })).status(), 200);
    // Validate -> correct -> success against the real order endpoint.
    assert.equal((await post(ctx, 'order-submit', { phone: '12', note: 'Invalid phone' })).status(), 400);
    assert.equal((await post(ctx, 'order-submit', { phone: '061123456', note: 'Valid retry' })).status(), 200);
    assert.equal((await get(ctx, 'cart')).cart.count, 0);
    assert.equal((await get(ctx, 'customer-profile')).orders.length, 1);
    assert.equal((await post(ctx, 'cart-add', { productId: product.id, quantity: 1 })).status(), 200);
    checks += 7;
    for (const width of [320, 360, 390, 768, 820, 1024, 1440]) {
      for (const dark of [false, true]) {
        for (const path of ['index.html', 'product.html?id=' + encodeURIComponent(product.id), 'blog.html?id=' + encodeURIComponent(cms.blogs[0]?.id || 'blog-1'), 'profile.html']) {
          await logoutChecks(browser, path, width, dark, dark);
        }
        await cartChecks(browser, width, dark);
      }
      console.log('Customer flows width ' + width + ' passed (both themes)');
    }
    console.log('Customer HTTP/browser checks passed: ' + checks);
  } finally { await ctx.dispose(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
