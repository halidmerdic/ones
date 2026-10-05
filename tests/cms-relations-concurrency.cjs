const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const file=path.join(os.tmpdir(),`ones-relations-race-${process.pid}-${Date.now()}.sqlite`);let userId,checks=0;
function worker(action,data={}){return new Promise((resolve,reject)=>{const p=spawn(process.env.PHP_BINARY||'php',[path.join(__dirname,'cms-relations-worker.php')]);let out='',err='';p.stdin.end(JSON.stringify({path:file,userId,action,...data}));p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',reject);p.on('close',code=>{try{assert.equal(code,0,err);resolve(JSON.parse(out))}catch(e){reject(e)}})});}
(async()=>{
 ({userId}=await worker('init'));
 for(let round=0;round<3;round++){
  await worker('prepare');const before=(await worker('read')).result;
  const args={cms:before.cms,revision:before.revision,cartId:before.cart.cartId,cartRevision:before.cart.revision};
  const tasks=['delete','favorite','add','favorite','add','favorite','add',...(round?['submit']:[])];
  const results=await Promise.all(tasks.map(action=>worker(action,args)));
  assert.equal(results[0].ok,true);assert.ok(results.every(r=>r.ok||r.conflict));assert.ok(results.every(r=>!r.transactionOpen));checks+=3;
  const after=(await worker('read')).result;
  assert.equal(after.cms.products.some(p=>p.id==='scooter-f3'),false);
  assert.equal(after.cms.manuals.length,0);
  assert.equal(after.favorites.some(f=>f.product_id==='scooter-f3'),false);
  const activeIds=new Set(after.carts.filter(c=>c.status==='active').map(c=>Number(c.id)));
  assert.equal(after.items.some(i=>activeIds.has(Number(i.cart_id))&&i.product_id==='scooter-f3'),false);checks+=4;
  assert.deepEqual(after.orders.slice(0,before.orders.length),before.orders);checks++;
  for(const order of after.orders.slice(before.orders.length)){assert.ok(JSON.parse(order.items_json).some(i=>i.productId==='scooter-f3'&&i.name));checks++;}
  for(const action of ['add','favorite']){assert.equal((await worker(action,{...args,cartId:after.cart.cartId,cartRevision:after.cart.revision})).conflict,true);checks++;}
 }
 console.log(`CMS relation concurrency: ${checks} checks, up to 8 workers (${process.env.ONES_TEST_MYSQL_PORT?'mysql':'sqlite'})`);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{for(const suffix of ['','-wal','-shm'])if(fs.existsSync(file+suffix))fs.unlinkSync(file+suffix)});
