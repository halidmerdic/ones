const { spawn, spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const php = process.env.PHP_BINARY || 'php';
const file = path.join(os.tmpdir(), 'ones-email-concurrency-' + Date.now() + '.sqlite');
const worker = path.join(__dirname, 'email-concurrency-worker.php');
(async () => {
  const init = spawnSync(php, [worker], { input: JSON.stringify({ action: 'init', path: file }), encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  const { token } = JSON.parse(init.stdout);
  const results = await Promise.all(Array.from({ length: 8 }, () => new Promise((resolve, reject) => {
    const p = spawn(php, [worker]); let out = '', error = '';
    p.stdin.end(JSON.stringify({ action: 'confirm', path: file, token }));
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => error += d); p.on('error', reject);
    p.on('close', code => { try { if (code) throw Error(error); resolve(JSON.parse(out)); } catch (e) { reject(e); } });
  })));
  assert.equal(results.filter(r => r.accepted).length, 1);
  assert.equal(results.filter(r => !r.accepted && r.status === 400).length, 7);
  console.log('Concurrent email confirmation passed: exactly 1 of 8 workers (' + (process.env.ONES_TEST_MYSQL_PORT ? 'mysql' : 'sqlite') + ')');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { if (fs.existsSync(file)) fs.unlinkSync(file); });
