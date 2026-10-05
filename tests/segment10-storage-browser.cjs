const {chromium,request}=require('playwright');
const assert=require('node:assert/strict');
const {activateCustomer}=require('./mail-helper.cjs'),{withCartVersion}=require('./cart-helper.cjs');
const baseURL=process.env.ONES_TEST_URL;
if(!baseURL||new URL(baseURL).hostname!=='127.0.0.1'||process.env.ONES_DISPOSABLE_TEST!=='1')throw Error('Disposable loopback required');
let checks=0;
async function get(c,a){const r=await c.get(baseURL+'/api.php?action='+a);assert.equal(r.status(),200,await r.text());return r.json();}
async function post(c,a,data){data=await withCartVersion(c,baseURL,a,data);const r=await c.post(baseURL+'/api.php?action='+a,{data,headers:{'X-CSRF-Token':(await get(c,'csrf-token')).csrfToken}});assert.equal(r.status(),200,await r.text());return r.json();}
function denyStorage(mode){
 localStorage.setItem('onesTheme:customer:legacy@example.invalid','dark');
 sessionStorage.setItem('onesTheme:customer:legacy@example.invalid','light');
 localStorage.setItem('onesCustomerPreview',JSON.stringify({name:'Legacy',email:'legacy@example.invalid'}));
 sessionStorage.setItem('onesCustomerPreview',JSON.stringify({name:'Legacy',email:'legacy@example.invalid'}));
 window.__denyStorage=mode;
 const fail=method=>window.__denyStorage===method||window.__denyStorage==='all';
 for(const name of ['localStorage','sessionStorage']){
  const original=window[name];Object.defineProperty(window,name,{configurable:true,get(){if(window.__denyStorage==='property')throw new DOMException('Blocked','SecurityError');return original;}});
 }
 for(const method of ['getItem','setItem','removeItem','key']){
  const original=Storage.prototype[method];Storage.prototype[method]=function(...args){if(fail(method))throw new DOMException('Blocked',method==='setItem'?'QuotaExceededError':'SecurityError');return original.apply(this,args);};
 }
 const length=Object.getOwnPropertyDescriptor(Storage.prototype,'length').get;
 Object.defineProperty(Storage.prototype,'length',{configurable:true,get(){if(fail('length'))throw new DOMException('Blocked','SecurityError');return length.call(this);}});
}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),customer=await request.newContext();
 try{
  const stamp=Date.now(),password='Storage customer password 2026!';
  const cms=(await get(customer,'cms')).cms,id=cms.products[0].id,blog=cms.blogs[0].id;
  const cases=[];
  for(const width of [320,360,390,768,820,1024,1440])for(const dark of [false,true])cases.push({mode:'property',width,dark});
  for(const mode of ['getItem','setItem','removeItem','key','length','all'])cases.push({mode,width:820,dark:false});
  if(process.env.ONES_TEST_COMPAT==='1')cases.splice(0,cases.length,{mode:'property',width:820,dark:false},{mode:'setItem',width:820,dark:true});
  let caseIndex=0;
  for(const {mode,width,dark} of cases){
   const email=`storage-${stamp}-${caseIndex}@example.invalid`;
   const c=await browser.newContext({viewport:{width,height:1000},hasTouch:width<=1024,colorScheme:dark?'dark':'light',extraHTTPHeaders:{'CF-Connecting-IP':`198.51.100.${211+caseIndex++}`}});
   await c.addInitScript(denyStorage,mode);
   await post(c.request,'customer-register',{name:'Storage kupac',email,acceptedPrivacy:true});await activateCustomer(c.request,baseURL,email,password);
   await post(c.request,'admin-login',{password:'Segment one admin password 2026!'});
   const page=await c.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
   await page.goto(baseURL+'/');await page.locator('#productGrid .product-card').first().waitFor();await page.waitForFunction(()=>currentCustomer!==null);checks++;
   const beforeTheme=await page.locator('html').getAttribute('data-theme');await page.locator('[data-theme-toggle]').first().click();
   assert.notEqual(await page.locator('html').getAttribute('data-theme'),beforeTheme);checks++;
   await page.goto(baseURL+'/product.html?id='+id);await page.locator('#detailAddCart').click();
   await page.waitForFunction(()=>Array.from(document.querySelectorAll('.admin-toast')).some(e=>e.textContent.includes('dodan')));checks++;
   await page.goto(baseURL+'/cart.html');await page.waitForFunction(()=>cartReady);assert.ok(await page.locator('[data-qty]').count());checks++;
   await page.locator('#orderPhone').fill('061123456');await page.locator('#submitOrderBtn').click();await page.locator('#orderSuccess').waitFor();checks++;
   await page.goto(baseURL+'/profile.html');await page.waitForFunction(()=>document.querySelector('#profileEmailInput')?.value.includes('@example.invalid'));
   await page.locator('#profilePhoneInput').fill('00387 61 123 456');await page.locator('#saveProfileBtn').click();
   await page.waitForFunction(()=>document.querySelector('#profilePhoneInput').value==='+38761123456');checks++;
   await page.goto(baseURL+'/admin.html?panel=products');await page.locator('[data-edit-product]').first().waitFor();checks++;
   const revision=(await get(c.request,'admin-cms')).revision;
   await page.locator('[data-product-field="name"]').first().fill('Storage fixture '+mode+' '+width+' '+dark);
   await page.locator('#saveBtn').click();await page.locator('.admin-toast').filter({hasText:'CMS je sacuvan'}).waitFor();
   assert.equal((await get(c.request,'admin-cms')).revision,revision+1);checks++;
   await page.evaluate(()=>activatePanel('orders'));await page.locator('[data-order-detail]').first().waitFor();checks++;
   for(const url of ['/blog.html?id='+encodeURIComponent(blog),'/privacy.html','/terms.html','/verify.html','/login.html']){
    await page.goto(baseURL+url);if(url==='/login.html')await page.waitForURL(baseURL+'/');
    if(url.startsWith('/blog.html'))await page.locator('.blog-article h1').waitFor();
    assert.ok(await page.locator('body').isVisible());checks++;
   }
   // Retry migration after access is restored; do not clear unrelated storage.
   await page.evaluate(()=>{window.__denyStorage=false;localStorage.setItem('unrelated','keep');onesCleanLegacyStorage();});
   const values=await page.evaluate(()=>[localStorage,sessionStorage].flatMap(s=>Array.from({length:s.length},(_,i)=>{const k=s.key(i);return[k,s.getItem(k)];})));
   assert.ok(!JSON.stringify(values).includes('legacy@example.invalid'));assert.ok(!JSON.stringify(values).includes(email));checks+=2;
   assert.equal(await page.evaluate(()=>localStorage.getItem('unrelated')),'keep');checks++;
   await page.evaluate(()=>onesLogoutCustomer());assert.equal((await get(c.request,'customer-status')).loggedIn,false);checks++;
   assert.equal(await page.evaluate(()=>onesStorage.session.getItem('onesCustomerPreview')),null);checks++;
   assert.deepEqual(errors,[],JSON.stringify({mode,width,dark}));checks++;
   await c.close();
  }
  console.log(`Segment 10 storage/browser: ${checks} checks (${cases.length} contexts; property/method/length failures, real cart/profile/CMS writes and logout)`);
 }finally{await browser.close();await customer.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});
