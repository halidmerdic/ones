const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {activateCustomer}=require('./mail-helper.cjs');
const baseURL=process.env.ONES_TEST_URL;
if(!baseURL||new URL(baseURL).hostname!=='127.0.0.1'||process.env.ONES_DISPOSABLE_TEST!=='1')throw Error('Disposable loopback required');
let checks=0;
async function post(c,a,data){const t=await(await c.get(baseURL+'/api.php?action=csrf-token')).json();const r=await c.post(baseURL+'/api.php?action='+a,{data,headers:{'X-CSRF-Token':t.csrfToken}});assert.equal(r.status(),200,await r.text());return r.json();}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const c=await browser.newContext({extraHTTPHeaders:{'CF-Connecting-IP':'198.51.100.244'}}),page=await c.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(baseURL+'/privacy.html');
  for(const route of ['index.html','product.html','blog.html','cart.html','login.html','profile.html','privacy.html','terms.html','verify.html','admin.html']){
   await page.evaluate(()=>{
    localStorage.setItem('onesTheme:store:last','dark');localStorage.setItem('onesTheme:admin','light');localStorage.setItem('unrelated','keep');
    for(const s of [localStorage,sessionStorage])for(const email of ['first@example.invalid','second@example.invalid'])s.setItem('onesTheme:customer:'+email,'light');
    localStorage.setItem('onesCustomerPreview','{"name":"Old","email":"first@example.invalid"}');
    sessionStorage.setItem('onesCustomerPreview','{"name":"Old","email":"first@example.invalid"}');
   });
   await page.goto(baseURL+'/'+route);if(['cart.html','profile.html'].includes(route))await page.waitForURL(url=>url.pathname.endsWith('/login.html'));
   const state=await page.evaluate(()=>({theme:document.documentElement.dataset.theme,keys:[localStorage,sessionStorage].flatMap(s=>Object.keys(s).map(k=>[k,s.getItem(k)])),other:localStorage.getItem('unrelated')}));
   assert.equal(state.theme,route==='admin.html'?'light':'dark');assert.ok(!JSON.stringify(state.keys).includes('@example.invalid'));assert.equal(state.other,'keep');checks+=3;
  }
  // Store preference survives account changes, and stays separate from admin.
  const emails=[0,1].map(i=>`privacy-${Date.now()}-${i}@example.invalid`),password='Privacy customer password 2026!';
  for(const email of emails){
   await post(c.request,'customer-register',{name:'Privacy test',email,acceptedPrivacy:true});await activateCustomer(c.request,baseURL,email,password);
   await page.goto(baseURL+'/profile.html');await page.waitForFunction(()=>document.querySelector('#profileEmailInput')?.value.includes('@example.invalid'));
   assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');checks++;
   await page.evaluate(()=>onesLogoutCustomer());
   const all=await page.evaluate(()=>[localStorage,sessionStorage].flatMap(s=>Object.keys(s).map(k=>[k,s.getItem(k)])));
   assert.ok(!JSON.stringify(all).includes(email));assert.ok(!all.some(([k])=>k==='onesCustomerPreview'));checks+=2;
  }
  const other=await c.newPage();await page.goto(baseURL+'/privacy.html');await other.goto(baseURL+'/terms.html');
  await page.locator('[data-theme-toggle]').click();await other.waitForFunction(()=>document.documentElement.dataset.theme==='light');checks++;
  await other.reload();assert.equal(await other.locator('html').getAttribute('data-theme'),'light');checks++;
  await other.evaluate(()=>localStorage.setItem('onesTheme:customer:old-tab@example.invalid','dark'));
  await page.waitForFunction(()=>localStorage.getItem('onesTheme:customer:old-tab@example.invalid')===null);checks++;
  assert.equal(await page.evaluate(()=>localStorage.getItem('onesTheme:admin')),'light');checks++;
  const quota=await page.evaluate(()=>{
   sessionStorage.setItem('onesCustomerPreview','{"name":"Old","email":"quota@example.invalid"}');
   const original=Storage.prototype.setItem;
   Storage.prototype.setItem=()=>{throw new DOMException('Full','QuotaExceededError');};
   onesCleanLegacyStorage();
   const disk=sessionStorage.getItem('onesCustomerPreview'),memory=onesStorage.session.getItem('onesCustomerPreview');
   Storage.prototype.setItem=original;
   return{disk,memory};
  });
  assert.equal(quota.disk,null);assert.equal(quota.memory,'{"name":"Old"}');checks+=2;
  assert.deepEqual(errors,[]);checks++;
  console.log(`Theme/privacy browser: ${checks} checks (10 entry points, legacy migration, two accounts/logout, reload, tab synchronization and old-tab cleanup)`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
