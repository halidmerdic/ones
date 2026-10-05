const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../api-client.js'), 'utf8');
let checks = 0;
function client(handler, blockedStorage = false) {
  const cache = new Map([['onesCustomerPreview', 'Customer'], ['onesCartCountPreview', '3']]);
  const storage = { removeItem(key) { if (blockedStorage) throw Error('Storage denied'); cache.delete(key); } };
  const window = { localStorage: storage, sessionStorage: storage };
  vm.runInNewContext(source, { window, fetch: async url => {
    const action = new URL(url, 'http://127.0.0.1').searchParams.get('action');
    if (action === 'csrf-token') return { ok: true, status: 200, json: async () => ({ ok: true, csrfToken: 'test' }) };
    const result = await handler(action);
    return { ok: result.status < 400, status: result.status, json: async () => result.body };
  } });
  return { window, cache };
}
(async () => {
  for (const status of [true, 'false', null]) {
    const app = client(async action => {
      if (action === 'customer-logout') throw Error('Network lost');
      return { status: 200, body: { ok: true, loggedIn: status } };
    });
    await assert.rejects(app.window.onesLogoutCustomer(), /Odjava nije potvrđena/);
    assert.equal(app.cache.get('onesCustomerPreview'), 'Customer');
    assert.equal(app.cache.get('onesCartCountPreview'), '3');
    checks += 3;
  }
  const offline = client(async () => { throw Error('Offline'); });
  await assert.rejects(offline.window.onesLogoutCustomer(), /Odjava nije potvrđena/);
  assert.equal(offline.cache.get('onesCustomerPreview'), 'Customer');
  checks += 2;
  const serverFailure = client(async action => ({ status: action === 'customer-logout' ? 500 : 200, body: { ok: action !== 'customer-logout', loggedIn: true } }));
  await assert.rejects(serverFailure.window.onesLogoutCustomer(), /Odjava nije potvrđena/);
  assert.equal(serverFailure.cache.get('onesCustomerPreview'), 'Customer');
  checks += 2;
  const lost = client(async action => {
    if (action === 'customer-logout') throw Error('Response lost after commit');
    return { status: 200, body: { ok: true, loggedIn: false } };
  });
  await lost.window.onesLogoutCustomer();
  assert.equal(lost.cache.size, 0);
  assert.equal((await lost.window.__onesCustomerStatusPromise).loggedIn, false);
  checks += 2;
  const blocked = client(async () => ({ status: 200, body: { ok: true } }), true);
  await blocked.window.onesLogoutCustomer();
  assert.equal((await blocked.window.__onesCustomerStatusPromise).loggedIn, false);
  checks++;
  let calls = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const concurrent = client(async () => { calls++; await gate; return { status: 200, body: { ok: true } }; });
  const first = concurrent.window.onesLogoutCustomer();
  const second = concurrent.window.onesLogoutCustomer();
  release();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  checks++;
  console.log('Logout client checks passed: ' + checks);
})().catch(error => { console.error(error); process.exitCode = 1; });
