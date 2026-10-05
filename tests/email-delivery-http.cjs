const { chromium } = require('playwright');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { verificationToken } = require('./mail-helper.cjs');
const baseURL = process.env.ONES_TEST_URL;
const fixture = path.resolve(process.env.ONES_TEST_FIXTURE_DIR || '');
if (process.env.ONES_DISPOSABLE_TEST !== '1' || new URL(baseURL).hostname !== '127.0.0.1' || fixture !== path.resolve('.runtime/segment4-tests/web')) throw Error('This test may mutate only its named disposable fixture');
const configPath = path.join(fixture, 'config.local.php'), originalConfig = fs.readFileSync(configPath, 'utf8');
assert.ok(originalConfig.includes("'port'=>10255"));
const email = 'legacy-' + Date.now() + '@example.invalid', password = 'Legacy customer password 2026!';
const php = process.env.PHP_BINARY || 'php';
const seed = spawnSync(php, ['-r', `$_SERVER['HTTP_HOST']='localhost'; define('ONES_API_LIBRARY_ONLY',true); require 'api.php'; $v=json_decode(stream_get_contents(STDIN),true); $p=new PDO('sqlite:'.$v['path']); $p->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION); $p->prepare('INSERT INTO users(name,email,password_hash,role,created_at) VALUES(?,?,?,"customer",?)')->execute(['Legacy test',$v['email'],hash_password($v['password']),date('c')]);`], { input: JSON.stringify({ path: path.join(fixture, 'data/test.sqlite'), email, password }), encoding: 'utf8' });
assert.equal(seed.status, 0, seed.stderr);
let checks = 0;
async function get(ctx, action) { return (await ctx.get(baseURL + '/api.php?action=' + action)).json(); }
async function post(ctx, action, data) { return ctx.post(baseURL + '/api.php?action=' + action, { data, headers: { 'X-CSRF-Token': (await get(ctx, 'csrf-token')).csrfToken } }); }
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 320, height: 900 }, hasTouch: true, extraHTTPHeaders: { 'CF-Connecting-IP': '192.0.2.' + (Date.now() % 200 + 1) } });
    assert.equal((await post(context.request, 'customer-login', { email, password })).status(), 200); checks++;
    const page = await context.newPage();
    await page.goto(baseURL + '/profile.html');
    await page.waitForFunction(() => document.querySelector('#emailVerificationState').textContent.includes('još nije'));
    const cms = (await get(context.request, 'cms')).cms;
    await post(context.request, 'cart-add', { productId: cms.products[0].id, quantity: 1 });
    assert.equal((await post(context.request, 'order-submit', { phone: '061123456' })).status(), 403);
    assert.equal((await get(context.request, 'cart')).cart.count, 1); checks += 2;
    await page.locator('#sendEmailVerificationBtn').click();
    await page.waitForFunction(() => document.querySelector('#emailVerificationStatus').textContent.includes('poslana'));
    const token = verificationToken(email); assert.ok(token); checks++;
    await page.goto(baseURL + '/verify.html#token=' + token + '&kind=verify');
    assert.equal(await page.locator('#verificationPassword').isVisible(), false);
    await page.locator('#verifyEmailBtn').click(); await page.locator('#verificationContinue').waitFor(); checks += 2;
    assert.equal((await post(context.request, 'order-submit', { phone: '061123456' })).status(), 200); checks++;
    // Simulate an unavailable SMTP listener; never change the project's config.
    fs.writeFileSync(configPath, originalConfig.replace("'port'=>10255", "'port'=>10256"));
    await new Promise(resolve => setTimeout(resolve, 3100)); // PHP OPcache revalidation interval.
    const newEmail = 'failed-' + Date.now() + '@example.invalid';
    const failed = await post(context.request, 'customer-profile-update', { name: 'Legacy test', email: newEmail, phone: '061123456', currentPassword: password });
    assert.equal(failed.status(), 503); assert.ok(!(await failed.text()).includes('10256')); checks += 2;
    const profile = (await get(context.request, 'customer-profile')).user;
    assert.equal(profile.email, email); assert.equal(profile.pendingEmail, ''); assert.equal(profile.emailVerified, true); checks += 3;
    const signup = await post(context.request, 'customer-register', { name: 'Failed signup', email: 'unavailable-' + Date.now() + '@example.invalid', acceptedPrivacy: true });
    assert.equal(signup.status(), 503); checks++;
    fs.writeFileSync(configPath, originalConfig);
    await new Promise(resolve => setTimeout(resolve, 3100));
    const cancelEmail = 'cancel-' + Date.now() + '@example.invalid';
    assert.equal((await post(context.request, 'customer-profile-update', { name: 'Legacy test', email: cancelEmail, phone: '061123456', currentPassword: password })).status(), 200); checks++;
    const cancelledToken = verificationToken(cancelEmail);
    await page.goto(baseURL + '/profile.html');
    await page.locator('#cancelEmailChangeBtn').click();
    await page.waitForFunction(() => document.querySelector('#pendingEmailState').textContent.includes('poništen'));
    assert.equal((await post(context.request, 'customer-email-confirm', { token: cancelledToken })).status(), 400); checks++;
    console.log('Email delivery/legacy profile HTTP checks passed: ' + checks);
    await context.close();
  } finally { fs.writeFileSync(configPath, originalConfig); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
