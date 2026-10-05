const { spawn } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const file = path.join(os.tmpdir(), `ones-cart-concurrency-${process.pid}-${Date.now()}.sqlite`);
let userId, checks = 0;
function worker(action, data = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.env.PHP_BINARY || 'php', [path.join(__dirname, 'segment5-worker.php')]);
    let out = '', error = '';
    p.stdin.end(JSON.stringify({ path: file, userId, action, ...data }));
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => error += d); p.on('error', reject);
    p.on('close', code => { try { assert.equal(code, 0, error); resolve(JSON.parse(out)); } catch (e) { reject(e); } });
  });
}
(async () => {
  ({userId} = await worker('init'));
  const reads = await Promise.all(Array.from({length:8}, () => worker('read')));
  assert.equal(new Set(reads.map(r => r.result.cartId)).size, 1); checks++;
  let cart = reads[0].result;
  const args = c => ({cartId:c.cartId,revision:c.revision});
  let results = await Promise.all(Array.from({length:8}, () => worker('cart-add', {...args(cart),body:{productId:'scooter-f3',quantity:1}})));
  assert.equal(results.filter(r => r.ok).length, 1); assert.equal(results.filter(r => r.conflict).length, 7); checks+=2;
  cart = (await worker('read')).result; assert.equal(cart.count, 1); checks++;
  results = await Promise.all(Array.from({length:8}, (_,i) => worker(i%2 ? 'cart-update' : 'cart-remove', {...args(cart),body:{itemId:cart.items[0].id,quantity:2}})));
  assert.equal(results.filter(r => r.ok).length, 1); assert.equal(results.filter(r => r.conflict).length, 7); checks+=2;
  for (const mutation of ['cart-add','cart-update','cart-remove']) {
    cart = (await worker('read')).result;
    cart = (await worker('cart-add', {...args(cart),body:{productId:'scooter-f3',quantity:1}})).result;
    const before = cart;
    results = await Promise.all([worker('submit', args(cart)), worker(mutation, {...args(cart),body:{productId:'scooter-f3',quantity:3,itemId:cart.items[0].id}})]);
    assert.equal(results.filter(r => r.ok).length, 1); assert.equal(results.filter(r => r.conflict).length, 1); checks+=2;
    let state = (await worker('inspect')).result;
    if (results[0].ok) {
      const snapshot = JSON.parse(state.orders.find(o=>Number(o.id)===results[0].result).items_json);
      assert.equal(snapshot[0].quantity,before.count); checks++;
    } else {
      // Close the changed cart to test delayed requests against a submitted one.
      cart = (await worker('read')).result;
      if (!cart.count) cart = (await worker('cart-add', {...args(cart),body:{productId:'scooter-f3',quantity:1}})).result;
      assert.equal((await worker('submit', args(cart))).ok,true); checks++;
    }
    state = (await worker('inspect')).result;
    assert.equal((await worker(mutation,{...args(before),body:{productId:'scooter-f3',quantity:9,itemId:before.items[0].id}})).conflict,true);
    assert.deepEqual((await worker('inspect')).result,state); checks+=2;
  }
  cart = (await worker('read')).result;
  cart = (await worker('cart-add', {...args(cart),body:{productId:'scooter-f3',quantity:1}})).result;
  results = await Promise.all(Array.from({length:8},()=>worker('submit',args(cart))));
  assert.equal(results.filter(r=>r.ok).length,1); assert.equal(results.filter(r=>r.conflict).length,7); checks+=2;
  cart = (await worker('read')).result;
  const badOwner = await worker('cart-add',{...args(cart),userId:userId+10000,body:{productId:'scooter-f3',quantity:1}});
  assert.equal(badOwner.conflict,true); checks++;
  const state = (await worker('inspect')).result;
  assert.equal(state.carts.filter(c=>c.status==='active').length,1); checks++;
  console.log(`Segment 5 concurrency: ${checks} checks, 8 independent workers (${process.env.ONES_TEST_MYSQL_PORT?'mysql':'sqlite'})`);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{for(const suffix of ['', '-wal', '-shm', '.migration.lock']) if(fs.existsSync(file+suffix))fs.unlinkSync(file+suffix)});
