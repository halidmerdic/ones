const { request } = require('playwright');
const assert = require('node:assert/strict');
const baseURL = process.env.ONES_TEST_URL;
if (!baseURL || new URL(baseURL).hostname !== '127.0.0.1' || process.env.ONES_DISPOSABLE_TEST !== '1') throw Error('Disposable loopback with trusted loopback proxy required');
let checks = 0;
(async () => {
  const ctx = await request.newContext();
  try {
    const token = await (await ctx.get(baseURL + '/api.php?action=csrf-token')).json();
    const email = 'missing-' + Date.now() + '@example.invalid';
    for (const action of ['customer-login', 'admin-login']) {
      const before = Date.now();
      for (let i = 0; i < 5; i++) {
        const result = await ctx.post(baseURL + '/api.php?action=' + action, {
          headers: { 'X-CSRF-Token': token.csrfToken, 'CF-Connecting-IP': '198.51.100.' + (i + 1) },
          data: { email, password: 'Wrong login fixture' },
        });
        assert.equal(result.status(), 401); checks++;
      }
      const result = await ctx.post(baseURL + '/api.php?action=' + action, {
        headers: { 'X-CSRF-Token': token.csrfToken, 'CF-Connecting-IP': '203.0.113.99' },
        data: { email: email.toUpperCase(), password: 'Wrong login fixture' },
      });
      assert.equal(result.status(), 429, 'Distributed ' + action + ' after ' + (Date.now() - before) + 'ms');
      const body = await result.json();
      assert.equal(body.code, 'LOGIN_THROTTLED');
      assert.ok(body.retryAfter > 0);
      assert.equal(Number(result.headers()['retry-after']), body.retryAfter);
      checks += 4;
    }
    console.log('Distributed login HTTP checks passed: ' + checks);
  } finally { await ctx.dispose(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
