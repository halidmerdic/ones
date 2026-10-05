const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const file=path.join(os.tmpdir(),`ones-cms-concurrency-${process.pid}-${Date.now()}.sqlite`);
let checks=0;
function worker(action,data={}) {
  return new Promise((resolve,reject)=>{
    const p=spawn(process.env.PHP_BINARY||'php',[path.join(__dirname,'cms-worker.php')]);
    let out='',error='';p.stdin.end(JSON.stringify({path:file,action,...data}));
    p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>error+=d);p.on('error',reject);
    p.on('close',code=>{try{assert.equal(code,0,error);resolve(JSON.parse(out))}catch(e){reject(e)}});
  });
}
(async()=>{
  let state=(await worker('init')).result;
  const originalId=state.cms.products[0].id;
  let results=await Promise.all(Array.from({length:8},(_,i)=>{
    const cms=structuredClone(state.cms);cms.products[0].name=`Concurrent name ${i}`;
    return worker('save',{cms,revision:state.revision});
  }));
  assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.filter(r=>r.conflict).length,7);checks+=2;
  assert.ok(results.every(r=>!r.transactionOpen));checks++;
  let after=(await worker('read')).result;
  assert.equal(after.revision,state.revision+1);assert.equal(after.history,state.history+1);assert.equal(after.cms.products[0].id,originalId);checks+=3;
  state=after;
  // A valid revision does not turn a renamed ID into a new record, even if
  // the old ID is declared deleted. Failed writers must release their locks.
  results=await Promise.all(Array.from({length:8},(_,i)=>{
    const cms=structuredClone(state.cms);cms.products[0].id=`renamed-${i}`;
    return worker('save',{cms,revision:state.revision,deletedProductIds:[originalId]});
  }));
  assert.equal(results.filter(r=>r.invalid).length,8);assert.ok(results.every(r=>!r.transactionOpen));checks+=2;
  assert.deepEqual((await worker('read')).result,state);checks++;
  // A valid edit racing invalid renames wins once; the other writers either
  // reject identity metadata or see the committed revision conflict.
  results=await Promise.all(Array.from({length:8},(_,i)=>{
    const cms=structuredClone(state.cms);cms.products[0].name='Final name';
    if(i)cms.products[0].id=`renamed-again-${i}`;
    return worker('save',{cms,revision:state.revision,deletedProductIds:i?[originalId]:[]});
  }));
  assert.equal(results[0].ok,true);assert.equal(results.filter(r=>r.ok).length,1);assert.ok(results.slice(1).every(r=>r.invalid||r.conflict));assert.ok(results.every(r=>!r.transactionOpen));checks+=4;
  after=(await worker('read')).result;
  assert.equal(after.revision,state.revision+1);assert.equal(after.history,state.history+1);assert.equal(after.cms.products[0].id,originalId);assert.equal(after.cms.products[0].name,'Final name');checks+=4;
  console.log(`CMS concurrency: ${checks} checks, 8 independent workers (${process.env.ONES_TEST_MYSQL_PORT?'mysql':'sqlite'})`);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{for(const suffix of ['','-wal','-shm'])if(fs.existsSync(file+suffix))fs.unlinkSync(file+suffix)});
