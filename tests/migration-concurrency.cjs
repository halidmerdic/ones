const {spawn} = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const directory = fs.mkdtempSync(path.join(os.tmpdir(),'ones-migration-'));
const config = path.join(directory,'config.php');
const database = path.join(directory,'migration.sqlite');
const php = process.env.PHP_BINARY || 'php';
fs.writeFileSync(config, `<?php return ['database'=>['driver'=>'sqlite','sqlite_path'=>__DIR__.'/migration.sqlite'],'security'=>['initial_admin_password'=>'Concurrent migration password 2026!']];`);
function run(args=[]) {return new Promise((resolve,reject)=>{
  const child=spawn(php,[path.join(__dirname,'../migrate.php'),'--config='+config,...args]);let out='',error='';
  child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>error+=d);child.on('error',reject);
  child.on('close',code=>resolve({code,out,error}));
});}
(async()=>{
  try {
    const missing=await run(['--check']);assert.equal(missing.code,2);assert.equal(fs.existsSync(database),false);
    const results=await Promise.all(Array.from({length:8},()=>run()));
    for(const result of results){assert.equal(result.code,0,result.error);assert.match(result.out,/Schema version 2 ready/);}
    assert.equal((await run(['--check'])).code,0);
    assert.equal((await run(['--unknown'])).code,1);
    fs.writeFileSync(config,"<?php return ['database'=>['driver'=>'mysql','host'=>'127.0.0.1','name'=>'','user'=>'']];");
    assert.equal((await run()).code,1);
    fs.writeFileSync(config,"<?php return ['database'=>['driver'=>'mistyped']];");
    assert.equal((await run()).code,1);
    console.log('Concurrent migrations: 22 checks, 8 independent CLI processes, non-writing --check, unknown option/invalid configs rejected');
  } finally {
    // Only this invocation's generated, flat temporary directory is removed.
    assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('ones-migration-'));
    for(const name of fs.readdirSync(directory)){const file=path.join(directory,name);assert.ok(fs.lstatSync(file).isFile());fs.unlinkSync(file);}
    fs.rmdirSync(directory);
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
