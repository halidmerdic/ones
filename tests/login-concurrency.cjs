const { spawn, spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const php = process.env.PHP_BINARY || 'php';
const test = path.join(__dirname, 'login-limits.php');
const database = path.join(os.tmpdir(), 'ones-login-test-' + Date.now() + '.sqlite');
(async () => {
  const init = spawnSync(php, [test, '--init', database], { encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  const results = await Promise.all(Array.from({ length: 20 }, (_, index) => new Promise((resolve, reject) => {
    const worker = spawn(php, [test, '--worker', database, String(index)]);
    let output = ''; let error = '';
    worker.stdout.on('data', data => { output += data; });
    worker.stderr.on('data', data => { error += data; });
    worker.on('error', reject);
    worker.on('close', code => { if (code) return reject(Error(error || output)); try { resolve(JSON.parse(output)); } catch(e) { reject(e); } });
  })));
  assert.equal(results.filter(result => result.accepted).length, 5);
  assert.equal(results.filter(result => !result.accepted && result.retryAfter === 2).length, 15);
  console.log('Concurrent login reservations passed: 20 workers, exactly 5 accepted (' + (process.env.ONES_TEST_MYSQL_PORT ? 'mysql' : 'sqlite') + ')');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  if (fs.existsSync(database)) fs.unlinkSync(database);
});
