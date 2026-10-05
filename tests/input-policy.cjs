const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const inputs = {
  passwords: ['č'.repeat(8), 'č'.repeat(15), '😀😁😂😃😄😅😆😉', 'čćšđžČĆŠĐŽ12345', 'abcdefghi😀😁😂😃😄😅', 'a'.repeat(70)+'č', 'a'.repeat(71)+'č', '12345678901234\0', 'passwordpassword', 'PASSWORDPASSWORD', '\u00a0passwordpassword\u00a0', ' valid password '],
  prices: [null, '', ' ', '\t1,23\n', '1e3', 1000, '1000', '-1', '+1', '0.1', 0.1, 1.0000000000000002, 0.1+0.2, '12 KM', '1,234', '1.000,00', '00001.20', '1.2.3', true, {}, [], 'Infinity', 'NaN', '1000000000.00', '1000000000.01', '0000000000001', '１２', '\u00a012\u00a0', -0],
};
const window = {};
const context = vm.createContext({ window, document: { addEventListener() {} }, TextEncoder, URL, console });
vm.runInContext(fs.readFileSync('api-client.js', 'utf8'), context);
const result = spawnSync(process.env.PHP_BINARY || 'php', ['tests/input-policy.php', '--json'], { input: JSON.stringify(inputs), encoding: 'utf8' });
assert.equal(result.status, 0, result.stderr);
const php = JSON.parse(result.stdout);
assert.deepEqual(inputs.passwords.map(p => window.onesPasswordError(p)), php.passwords);
assert.deepEqual(inputs.prices.map(p => window.onesPriceCents(p)), php.prices);
assert.ok(window.onesPasswordError('abcdefghijklmno\uD800'));
assert.equal(window.onesFormatCents(30), '0.3');
assert.equal(window.onesFormatCents(99000000000000000n), '990000000000000');
// Exercise each real consumer without running its page initialization.
for (const file of ['app.js', 'product.js', 'admin.js', 'cart.js']) {
  const source = fs.readFileSync(file, 'utf8');
  const match = source.match(/function numericPrice\(value\) \{[\s\S]*?\n\}/)[0];
  const parse = vm.runInContext('(' + match + ')', context);
  assert.equal(Number(parse('1e3')), 0, file);
  assert.equal(Number(parse('-100')), 0, file);
  assert.equal(Number(parse('12,34')), 12.34, file);
}
console.log('PHP/JS input policy parity passed: ' + (inputs.passwords.length + inputs.prices.length) + ' vectors and all price consumers');
