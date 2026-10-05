const { withCartVersion } = require('./cart-helper.cjs');
const { chromium, request } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { capturedMail, verificationToken } = require('./mail-helper.cjs');
const baseURL = process.env.ONES_TEST_URL;
if (!baseURL || new URL(baseURL).hostname !== '127.0.0.1' || process.env.ONES_DISPOSABLE_TEST !== '1') throw Error('Disposable loopback server required');
let checks = 0;
const contexts = [];
async function get(ctx, action) { const r = await ctx.get(baseURL + '/api.php?action=' + action); assert.equal(r.status(), 200); return r.json(); }
async function post(ctx, action, data) {
  data = await withCartVersion(ctx, baseURL, action, data); return ctx.post(baseURL + '/api.php?action=' + action, { data, headers: { 'X-CSRF-Token': (await get(ctx, 'csrf-token')).csrfToken } }); }
async function status(response, expected) { assert.equal(response.status(), expected, await response.text()); checks++; return response.json(); }
async function context(ip) { const c = await request.newContext({ extraHTTPHeaders: { 'CF-Connecting-IP': ip.replace('203.0.113.', '198.51.100.') } }); contexts.push(c); return c; }
(async () => {
  const stamp = Date.now();
  const email = `s4-${stamp}@example.invalid`, nextEmail = `s4-next-${stamp}@example.invalid`;
  const password = 'čćšđžČĆŠĐŽ12345', nextPassword = 'Novi čćšđž test 2026!';
  const customer = await context('203.0.113.41'), other = await context('203.0.113.42'), admin = await context('203.0.113.43');
  await status(await customer.get(baseURL + '/api.php?action=customer-email-confirm'), 405);
  await status(await customer.post(baseURL + '/api.php?action=customer-email-confirm', { data: { token: 'a'.repeat(64) } }), 403);
  await status(await post(customer, 'customer-email-confirm', { token: [] }), 400);
  await status(await post(customer, 'customer-register', { name: [], email, acceptedPrivacy: true }), 400);
  await status(await post(customer, 'customer-register', { name: 'Consent test', email, acceptedPrivacy: 'false' }), 400);
  await status(await post(customer, 'customer-register', { name: 'Unicode kupac', email, acceptedPrivacy: true, password: 'Attacker supplied password 2026!' }), 200);
  assert.equal((await get(customer, 'customer-status')).loggedIn, false); checks++;
  await status(await post(other, 'customer-login', { email, password: 'Attacker supplied password 2026!' }), 401);
  await status(await post(customer, 'customer-register', { name: 'Unicode kupac', email, acceptedPrivacy: true }), 429);
  const token = verificationToken(email); assert.match(token, /^[a-f0-9]{64}$/); checks++;
  await status(await post(customer, 'customer-email-confirm', { token, password: 'č'.repeat(8) }), 400);
  await status(await post(customer, 'customer-email-confirm', { token: '0'.repeat(64), password }), 400);
  await status(await post(customer, 'customer-email-confirm', { token, password }), 200);
  await status(await post(other, 'customer-email-confirm', { token, password }), 400);
  assert.equal((await get(customer, 'customer-profile')).user.emailVerified, true); checks++;
  await status(await post(other, 'customer-login', { email, password }), 200);
  const profile = { name: 'Unicode kupac', phone: '061123456', email: nextEmail, currentPassword: 'wrong' };
  await status(await post(customer, 'customer-profile-update', profile), 401);
  profile.currentPassword = password;
  const pending = await status(await post(customer, 'customer-profile-update', profile), 200);
  assert.equal(pending.profile.email, email); assert.equal(pending.profile.pendingEmail, nextEmail); checks += 2;
  const notification = capturedMail(email).at(-1).text;
  assert.ok(notification.includes(nextEmail)); assert.ok(!notification.includes('#token=')); checks += 2;
  const changeToken = verificationToken(nextEmail);
  const stranger = await context('203.0.113.44');
  await status(await post(stranger, 'customer-email-confirm', { token: changeToken }), 401);
  await status(await post(customer, 'customer-email-confirm', { token: changeToken }), 200);
  assert.equal((await get(customer, 'customer-profile')).user.email, nextEmail); checks++;
  assert.equal((await get(other, 'customer-status')).loggedIn, false); checks++;
  await status(await post(customer, 'customer-password-update', { currentPassword: password, newPassword: '😀😁😂😃😄😅😆😉' }), 400);
  await status(await post(customer, 'customer-password-update', { currentPassword: password, newPassword: 'a'.repeat(71) + 'č' }), 400);
  await status(await post(customer, 'customer-password-update', { currentPassword: password, newPassword: nextPassword }), 200);
  await status(await post(admin, 'admin-login', { password: 'Segment one admin password 2026!' }), 200);
  await status(await post(admin, 'admin-password-update', { currentPassword: 'Segment one admin password 2026!', newPassword: 'č'.repeat(8) }), 400);
  let current = await get(admin, 'admin-cms');
  for (const invalid of ['1e3', '-100', '+100', '1.234,56', '0.001', '100 KM', '1.2.3']) {
    const cms = structuredClone(current.cms); cms.products[0].mpcPrice = invalid;
    await status(await post(admin, 'save-cms', { cms, revision: current.revision }), 422);
    assert.equal((await get(admin, 'admin-cms')).revision, current.revision); checks++;
  }
  const first = current.cms.products[0];
  if (!current.cms.products[1]) current.cms.products.push({ ...structuredClone(first), id: first.id + '-decimal', name: 'Decimal test second product' });
  const second = current.cms.products[1];
  for (const [product, price] of [[first, '0,10'], [second, '0.20']]) Object.assign(product, { enabled: true, mpcPrice: price, discountPrice: '0', salePrice: '0', saleUntil: '', price: '0' });
  await status(await post(admin, 'save-cms', { cms: current.cms, revision: current.revision }), 200);
  await status(await post(customer, 'cart-add', { productId: first.id, quantity: 3 }), 200);
  await status(await post(customer, 'cart-add', { productId: second.id, quantity: 1 }), 200);
  await status(await post(customer, 'favorite-toggle', { productId: first.id }), 200);

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [320, 360, 390, 768, 820, 1024, 1440]) for (const dark of [false, true]) {
      const ctx = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width <= 1024, extraHTTPHeaders: { 'CF-Connecting-IP': '203.0.113.45' } });
      try {
        await ctx.addInitScript(dark => { localStorage.setItem('onesTheme:store:last', dark ? 'dark' : 'light'); localStorage.setItem('onesTheme:admin', dark ? 'dark' : 'light'); }, dark);
        const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
        // Real form validation, including emoji code points; capture successful POST.
        await page.goto(baseURL + '/verify.html#token=' + 'a'.repeat(64) + '&kind=signup');
        assert.equal(new URL(page.url()).hash, ''); checks++;
        await page.locator('#verificationPassword').fill('😀😁😂😃😄😅😆😉');
        await page.locator('#verifyEmailBtn').click();
        assert.match(await page.locator('#verificationStatus').textContent(), /najmanje 15/); checks++;
        if ([320, 820, 1440].includes(width)) await page.screenshot({ path: path.join(process.env.ONES_TEST_SCREENSHOTS, `verify-${width}-${dark ? 'dark' : 'light'}.png`), fullPage: true });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); checks++;
        await page.route('**/api.php?action=customer-email-confirm', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
        await page.locator('#verificationPassword').fill(password);
        await page.locator('#verifyEmailBtn').click(); await page.locator('#verificationContinue').waitFor(); checks++;
        await page.unroute('**/api.php?action=customer-email-confirm');
        await page.goto(baseURL + '/login.html');
        await page.route('**/api.php?action=customer-register', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, verificationRequired: true, message: 'Provjerite email za potvrdu.' }) }));
        await page.locator('#registerName').fill('Test kupac'); await page.locator('#registerEmail').fill('form@example.invalid'); await page.locator('#registerConsent').check(); await page.locator('#customerRegisterBtn').click();
        await page.waitForFunction(() => document.querySelector('#registerStatus').textContent.includes('Provjerite email')); checks++;
        await status(await post(ctx.request, 'customer-login', { email: nextEmail, password: nextPassword }), 200);
        await page.goto(baseURL + '/profile.html'); await page.waitForFunction(() => document.querySelector('#emailVerificationState').textContent.includes('je potvrđena'));
        assert.equal(await page.locator('#profileFavorites b').first().textContent(), '0.1 KM'); checks++;
        await page.locator('#currentPasswordInput').fill(nextPassword); await page.locator('#newPasswordInput').fill('č'.repeat(8)); await page.locator('#savePasswordBtn').click();
        assert.match(await page.locator('#profilePasswordStatus, .admin-toast').last().textContent(), /najmanje 15/); checks++;
        await page.goto(baseURL + '/cart.html'); await page.waitForFunction(() => document.querySelectorAll('[data-qty]').length > 0);
        assert.equal(await page.evaluate(() => money(cartTotal())), '0.5 KM'); checks++;
        await page.goto(baseURL + '/product.html?id=' + first.id); await page.waitForFunction(() => document.querySelector('#productTitle')?.textContent || document.body.textContent.includes('0.1 KM'));
        assert.ok((await page.locator('body').textContent()).includes('0.1 KM')); checks++;
        await status(await post(ctx.request, 'admin-login', { password: 'Segment one admin password 2026!' }), 200);
        await page.goto(baseURL + '/admin.html?panel=products'); await page.locator('[data-edit-product]').first().click();
        const input = page.locator('#productEditModal').getByLabel('MPC - maloprodajna cijena', { exact: true });
        await input.fill('1e3');
        assert.equal(await input.inputValue(), '1e3');
        assert.equal(await input.evaluate(e => e.validity.valid), false); checks += 2;
        await page.evaluate(() => saveCms());
        assert.equal(await input.inputValue(), '1e3'); checks++;
        await input.fill('12,34'); assert.equal(await input.evaluate(e => e.validity.valid), true); checks++;
        assert.deepEqual(errors, []); checks++;
      } finally { await ctx.close(); }
    }
  } finally { await browser.close(); }
  await status(await post(customer, 'order-submit', { phone: '061123456', note: 'Decimal snapshot' }), 200);
  const order = (await get(customer, 'customer-profile')).orders[0];
  assert.equal(order.items.find(i => i.productId === first.id).price, '0.1');
  assert.equal(order.items.find(i => i.productId === second.id).price, '0.2'); checks += 2;
  console.log('Segment 4 HTTP/browser checks passed: ' + checks + ' (7 widths, 2 themes)');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { for (const c of contexts) await c.dispose(); });
