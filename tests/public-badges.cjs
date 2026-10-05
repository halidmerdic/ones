const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
let checks = 0;
for (const file of ['app.js', 'product.js']) {
  const window = { addEventListener() {}, dispatchEvent() {} };
  const context = vm.createContext({ window, Event, TextEncoder, URL, setTimeout() {}, clearTimeout() {},
    fetch: async () => ({ ok: true, json: async () => ({ ok: true, pricingClock: { zone: 'Europe/Sarajevo', date: '2026-10-05', asOf: 10, refreshAfterMs: 1000 } }) }) });
  vm.runInContext(fs.readFileSync('api-client.js', 'utf8'), context);
  const source = fs.readFileSync(file, 'utf8');
  for (const name of ['isDateActive', 'visibleBadge']) vm.runInContext(source.match(new RegExp('function '+name+'\\([^]*?\\n\\}'))[0], context);
  context.cms = { categories: [{ name: 'K', badge: 'Category' }], badges: [{ name: 'Product' }, { name: 'Category' }, { name: 'Disabled', enabled: false }] };
  const cases = [
    [{ badge: 'Product' }, 'Product'], [{ badge: 'Missing' }, ''], [{ badge: 'Disabled' }, ''],
    [{ badge: '-' }, 'Category'], [{}, 'Category'], [{ badge: 'Product', badgeUntil: '2026-10-04' }, 'Category'],
    [{ badge: 'Product', badgeUntil: '2026-10-05' }, 'Product'], [{ badge: 'Product', badgeUntil: '2026-10-06' }, 'Product'],
    [{ badge: 'Product', badgeUntil: 'invalid' }, 'Category'], [{ category: 'Missing' }, ''],
  ];
  (async () => {
    await window.onesApi('cms');
    for (const [data, expected] of cases) { assert.equal(context.visibleBadge({category:'K', ...data}), expected, file+JSON.stringify(data)); checks++; }
    for (const name of ['Disabled','Missing','-']) {
      context.cms.categories[0].badge = name;
      assert.equal(context.visibleBadge({ category: 'K' }), ''); checks++;
    }
    context.cms.categories[0] = { name: 'K', badge: 'Category', badgeUntil: '2026-10-04' };
    assert.equal(context.visibleBadge({ category: 'K' }), ''); checks++;
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
process.on('beforeExit', () => { if (!process.exitCode) console.log(`Public badges: ${checks} checks (catalogue and detail, allowlist, inheritance and Sarajevo expiry)`); });
