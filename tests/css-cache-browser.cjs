const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const base=process.env.ONES_TEST_URL,root=path.resolve(process.env.ONES_TEST_DOCUMENT_ROOT||'.');
if(!base||new URL(base).hostname!=='127.0.0.1'||new URL(base).port!=='18865'||process.env.ONES_DISPOSABLE_TEST!=='1'||root!==path.resolve('.runtime/segment13-tests/web'))throw Error('Disposable Apache fixture required');
const files=['styles.css','admin.css','privacy.html','terms.html'];
const originals=new Map(files.map(name=>[name,fs.readFileSync(path.join(root,name))]));
const restore=()=>{for(const [name,bytes]of originals)fs.writeFileSync(path.join(root,name),bytes);};
let checks=0;
function ok(value,message){assert.ok(value,message);checks++;}
async function post(context,action,data){const {csrfToken}=await(await context.get(base+'/api.php?action=csrf-token')).json();const r=await context.post(base+'/api.php?action='+action,{data,headers:{'X-CSRF-Token':csrfToken}});assert.equal(r.status(),200,await r.text());}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),cdp=await context.newCDPSession(page);
  await cdp.send('Network.enable');let cached=0;cdp.on('Network.requestServedFromCache',()=>cached++);
  const oldVersion='legacy-'+Date.now();
  const oldHtml=`<!doctype html><html><head><link rel="stylesheet" href="styles.css?v=${oldVersion}"><link rel="stylesheet" href="admin.css?v=${oldVersion}"></head><body>Cache fixture</body></html>`;
  for(const file of ['privacy.html','terms.html'])fs.writeFileSync(path.join(root,file),oldHtml);
  for(const file of ['styles.css','admin.css'])fs.writeFileSync(path.join(root,file),Buffer.concat([originals.get(file),Buffer.from('\n:root{--ones-cache-fixture:old;}')]));
  await page.goto(base+'/privacy.html');
  ok(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--ones-cache-fixture').trim())==='old','Old stylesheet primed');
  for(const file of ['styles.css','admin.css','privacy.html'])fs.writeFileSync(path.join(root,file),originals.get(file));
  await page.goto(base+'/terms.html');
  ok(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--ones-cache-fixture').trim())==='old','Old URL still serves cached CSS after deployment');
  ok(cached>=2,'Actual browser cache used; no Playwright network routing');
  restore();await page.goto(base+'/privacy.html');
  ok(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--ones-cache-fixture').trim())==='','New fingerprint loads fresh CSS in warm cache');
  const links=await page.locator('link[rel=stylesheet]').evaluateAll(items=>items.map(x=>x.href));
  ok(links.every(link=>!link.includes(oldVersion)),'New HTML replaced old resource URLs');
  // Authenticate the seeded disposable customer and administrator for every page.
  await post(context.request,'customer-login',{email:'css@example.invalid',password:'CSS customer password 2026!'});
  await post(context.request,'admin-login',{password:'Segment one admin password 2026!'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const pages=['index.html','admin.html?panel=products','cart.html','blog.html','product.html?id=scooter-f3','profile.html','privacy.html','terms.html','verify.html'];
  const observed=new Map();
  for(const width of [320,390,768,820,1024,1440])for(const dark of [false,true]){
   await page.setViewportSize({width,height:1000});
   for(const url of pages){
    await page.goto(base+'/'+url);await page.evaluate(d=>onesTheme.apply(d?'dark':'light'),dark);
    if(url.startsWith('admin.'))await page.locator('[data-edit-product]').first().waitFor();
    if(url.startsWith('profile.'))await page.locator('#profileOrderPagination').waitFor();
    ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Overflow ${url}/${width}/${dark}`);
    const refs=await page.locator('link[rel=stylesheet]').evaluateAll(items=>items.map(e=>({file:new URL(e.href).pathname.split('/').pop(),version:new URL(e.href).searchParams.get('v')})));
    for(const {file,version}of refs){
     const expected=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex').slice(0,16);
     ok(version===expected,`${url} current ${file} hash`);
     if(observed.has(file))assert.equal(version,observed.get(file));else observed.set(file,version);
    }
    ok(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--ones-cache-fixture').trim())==='','No stale cached stylesheet across navigation');
    if(process.env.ONES_TEST_SCREENSHOTS&&url.startsWith('admin.')&&[390,1024,1440].includes(width)&&!dark)await page.screenshot({path:path.join(process.env.ONES_TEST_SCREENSHOTS,`css-cms-${width}.png`)});
   }
  }
  const guest=await browser.newContext();const login=await guest.newPage();login.on('pageerror',e=>errors.push(e.message));
  for(const width of [320,820,1440]){await login.setViewportSize({width,height:1000});await login.goto(base+'/login.html');await login.locator('#loginPassword').waitFor();ok(await login.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Guest login layout');}
  ok(errors.length===0,JSON.stringify(errors));
  console.log(`CSS/browser: ${checks} checks (real stale cache reproduced then invalidated, shared hashes, desktop/tablet/mobile, both themes and authenticated pages)`);
 }finally{restore();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
