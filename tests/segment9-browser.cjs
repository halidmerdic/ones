const {chromium,request}=require('playwright');
const assert=require('node:assert/strict'),path=require('node:path');
const {activateCustomer}=require('./mail-helper.cjs'),{withCartVersion}=require('./cart-helper.cjs');
const baseURL=process.env.ONES_TEST_URL;
if(!baseURL||new URL(baseURL).hostname!=='127.0.0.1'||process.env.ONES_DISPOSABLE_TEST!=='1')throw Error('Disposable loopback fixture required');
let checks=0;
async function get(c,a){const r=await c.get(baseURL+'/api.php?action='+a);assert.equal(r.status(),200,await r.text());return r.json();}
async function post(c,a,data,status=200){data=await withCartVersion(c,baseURL,a,data);const r=await c.post(baseURL+'/api.php?action='+a,{data,headers:{'X-CSRF-Token':(await get(c,'csrf-token')).csrfToken}});assert.equal(r.status(),status,await r.text());return r.json();}
async function login(page,email,password,target){await page.locator('#loginEmail').fill(email);await page.locator('#loginPassword').fill(password);await page.locator('#customerLoginBtn').click();await page.waitForURL(url=>url.pathname.endsWith(target));}
async function channelLinks(page,scope){const wa=page.locator(scope+' a[href^="https://wa.me/"]'),vb=page.locator(scope+' a[href^="viber://"]');assert.equal(new URL(await wa.getAttribute('href')).pathname,'/38761123456');assert.equal(new URL(await vb.getAttribute('href')).searchParams.get('number'),'+38761123456');checks+=2;}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const admin=await request.newContext({extraHTTPHeaders:{'CF-Connecting-IP':'198.51.100.191'}}),customer=await request.newContext({extraHTTPHeaders:{'CF-Connecting-IP':'198.51.100.192'}});
 try{
  await post(admin,'admin-login',{password:'Segment one admin password 2026!'});
  let state=await get(admin,'admin-cms');await post(admin,'reset-cms',{revision:state.revision});state=await get(admin,'admin-cms');
  const cms=state.cms,id=cms.products[0].id;
  cms.contact.whatsapp='061 123 456';cms.contact.viber='00387 61 123 456';
  cms.categories.push({name:'Prazna javna kategorija',enabled:true},{name:'Skrivena kategorija',enabled:false});
  const hiddenProduct={...cms.products[0],id:'hidden-fixture',name:'Skriveni proizvod',enabled:false};delete hiddenProduct._identity;cms.products.push(hiddenProduct);
  cms.parts=[{name:'Radne rukavice',text:'Zaštita na radu',enabled:true},{name:'Skriveni dio',text:'Romobil',enabled:false}];
  cms.blogs=[{id:'radno-vrijeme',title:'Radno vrijeme',tag:'Obavijesti',text:'Od ponedjeljka radimo do 18 sati.',enabled:true},{id:'hidden-news',title:'Skrivena vijest',text:'Romobil',enabled:false}];
  cms.manuals=[{title:'Opći uslovi podrške',type:'Dokument',status:'Dostupno',visibility:'Javno'},
   {title:'Upute prazne kategorije',category:'Prazna javna kategorija',visibility:'Javno'},
   {title:'Interno uputstvo',visibility:'Sakriveno'},
   {title:'Upute skrivenog proizvoda',relatedProductId:'hidden-fixture',visibility:'Javno'},
   {title:'Upute skrivene kategorije',category:'Skrivena kategorija',visibility:'Javno'}];
  await post(admin,'save-cms',{cms,revision:state.revision});
  state=await get(admin,'admin-cms');assert.equal(state.cms.contact.whatsapp,'+38761123456');assert.equal(state.cms.contact.viber,'+38761123456');checks+=2;
  for(const bad of ['++38761123456','123','061123456 ext 1']){
   const invalid=structuredClone(state.cms);invalid.contact.whatsapp=bad;
   await post(admin,'save-cms',{cms:invalid,revision:state.revision},422);
   const unchanged=await get(admin,'admin-cms');assert.equal(unchanged.revision,state.revision);assert.equal(unchanged.cms.contact.whatsapp,'+38761123456');checks+=2;
  }
  const xml=await(await admin.get(baseURL+'/sitemap.php')).text();assert.ok(xml.includes('blog.html?id=radno-vrijeme'));assert.ok(!xml.includes('hidden-news'));checks+=2;
  const email='s9-'+Date.now()+'@example.invalid',password='Segment nine customer 2026!';
  await post(customer,'customer-register',{name:'Test kontakt',email,acceptedPrivacy:true});await activateCustomer(customer,baseURL,email,password);
  for(const phone of ['061 123 456','00387 61 123 456','+387 (0)61 123 456']){const r=await post(customer,'customer-profile-update',{name:'Test kontakt',email,phone});assert.equal(r.profile.phone,'+38761123456');checks++;}
  for(const phone of ['telefon 061123456','++38761123456','123','061123456 ext 1'])await post(customer,'customer-profile-update',{name:'Test kontakt',email,phone},400);
  await post(customer,'cart-add',{productId:id,quantity:1});await post(customer,'order-submit',{phone:'00387 61 123 456',updateProfilePhone:true});
  const order=(await get(admin,'admin-orders')).orders[0];assert.equal(order.phone,'+38761123456');checks++;
  await post(customer,'cart-add',{productId:id,quantity:2});
  await post(customer,'order-submit',{phone:'123',updateProfilePhone:true},400);
  assert.equal((await get(customer,'cart')).cart.count,2);checks++;
  for(const width of [320,360,390,768,820,1024,1440])for(const dark of [false,true]){
   const c=await browser.newContext({viewport:{width,height:1000},hasTouch:width<=1024,extraHTTPHeaders:{'CF-Connecting-IP':'198.51.100.193'}});
   await c.addInitScript(dark=>{for(const key of ['onesTheme:admin','onesTheme:guest','onesTheme:store:last'])localStorage.setItem(key,dark?'dark':'light');},dark);
   const page=await c.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(baseURL+'/');await page.locator('#blogGrid .blog-card').waitFor();
   assert.equal(await page.locator('#blogGrid .blog-card').count(),1);assert.ok((await page.locator('#blogGrid').textContent()).includes('Radno vrijeme'));checks+=2;
   assert.equal(await page.locator('#partsStrip .part-card').count(),1);assert.ok((await page.locator('#partsStrip').textContent()).includes('Radne rukavice'));checks+=2;
   assert.equal(await page.locator('#manualResults .manual-item').count(),2);assert.ok((await page.locator('#manualResults').textContent()).includes('Upute prazne kategorije'));checks+=2;
   await page.goto(baseURL+'/blog.html?id=radno-vrijeme');await page.locator('.blog-article h1').waitFor();assert.equal(await page.locator('.blog-article h1').textContent(),'Radno vrijeme');checks++;
   await page.goto(baseURL+'/blog.html?id=hidden-news');await page.getByRole('heading',{name:'Blog nije pronađen'}).waitFor();checks++;
   // Anonymous cart navigation preserves query/hash without replaying any mutation.
   await page.goto(baseURL+'/cart.html?source=qa#upit');await page.waitForURL(url=>url.pathname.endsWith('/login.html'));
   assert.equal(new URL(page.url()).searchParams.get('next'),baseURL+'/cart.html?source=qa#upit');checks++;
   await page.locator('#loginReturnHint').waitFor();
   assert.equal(await page.locator('html').getAttribute('data-theme'),dark?'dark':'light');checks++;
   if([320,820,1440].includes(width)&&process.env.ONES_TEST_SCREENSHOTS)await page.screenshot({path:path.join(process.env.ONES_TEST_SCREENSHOTS,`cart-login-${width}-${dark?'dark':'light'}.png`)});
   await login(page,email,password,'/cart.html');await page.waitForFunction(()=>cartReady);
   assert.equal(new URL(page.url()).hash,'#upit');assert.ok(await page.locator('[data-qty]').count()>0);checks+=2;
   assert.equal(new URL(await page.locator('#cartWhatsapp').getAttribute('href')).pathname,'/38761123456');
   assert.equal(new URL(await page.locator('#cartViber').getAttribute('href')).searchParams.get('number'),'+38761123456');checks+=2;
   // A genuinely expired session during cart mutation also returns to the same cart.
   await post(c.request,'customer-logout',{});await page.locator('[data-qty]').first().click();await page.waitForURL(url=>url.pathname.endsWith('/login.html'));
   assert.ok(new URL(page.url()).searchParams.get('next').includes('/cart.html?source=qa#upit'));checks++;
   await login(page,email,password,'/cart.html');await page.waitForFunction(()=>cartReady);
   // Public inquiry links use the same number and encoding.
   await page.goto(baseURL+'/product.html?id='+id);await page.locator('#detailInquiryBtn').click();await channelLinks(page,'#inquiryModal');await page.keyboard.press('Escape');
   await page.goto(baseURL+'/');await page.locator('#blogGrid .blog-card').waitFor();await page.waitForFunction(()=>currentCustomer!==null);await page.evaluate(()=>openInquiryModal('Test proizvod'));await channelLinks(page,'#inquiryModal');await page.keyboard.press('Escape');
   // Interrupted Add requires an explicit second click after login, never an automatic mutation.
   await post(c.request,'customer-logout',{});await page.goto(baseURL+(dark?'/':'/product.html?id='+id));
   const before=(await get(customer,'cart')).cart.count;
   if(dark)await page.locator('[data-add-cart]').first().click();else await page.locator('#detailAddCart').click();
   await page.waitForURL(url=>url.pathname.endsWith('/login.html'));await page.locator('#loginReturnHint').waitFor();
   await login(page,email,password,'/product.html');await page.locator('#cartRetryHint').waitFor();
   assert.equal((await get(customer,'cart')).cart.count,before);checks++;
   await page.locator('#detailAddCart').click();await page.locator('#cartRetryHint').waitFor({state:'detached'});
   assert.equal((await get(customer,'cart')).cart.count,before+1);assert.equal(new URL(page.url()).searchParams.has('cartPending'),false);checks+=2;
   // Administrator order and customer links share the public normalization.
   await post(c.request,'admin-login',{password:'Segment one admin password 2026!'});
   await page.goto(baseURL+'/admin.html?panel=orders');await page.locator(`[data-order-detail="${order.id}"]`).click();await channelLinks(page,'#orderDetailModal');await page.locator('#closeOrderDetailBtn').click();
   await page.evaluate(()=>activatePanel('customers'));await page.locator('[data-customer-detail]').first().click();await channelLinks(page,'#customerDetailModal');
   assert.deepEqual(errors,[]);checks++;
   await c.close();
  }
  // Removing every product cannot unpublish unrelated public information.
  state=await get(admin,'admin-cms');state.cms.products.forEach(p=>p.enabled=false);await post(admin,'save-cms',{cms:state.cms,revision:state.revision});
  const p=await browser.newPage();await p.goto(baseURL+'/');await p.locator('#blogGrid .blog-card').waitFor();assert.ok((await p.locator('#manualResults').textContent()).includes('Upute prazne kategorije'));checks++;
  assert.ok((await(await admin.get(baseURL+'/sitemap.php')).text()).includes('blog.html?id=radno-vrijeme'));checks++;
  await p.goto(baseURL+'/blog.html?id=radno-vrijeme');await p.locator('.blog-article').waitFor();
  state=await get(admin,'admin-cms');state.cms.blogs[0].enabled=false;await post(admin,'save-cms',{cms:state.cms,revision:state.revision});
  await p.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'onesCmsUpdatedAt'})));await p.getByRole('heading',{name:'Blog nije pronađen'}).waitFor();checks++;
  state=await get(admin,'admin-cms');state.cms.blogs[0].enabled=true;await post(admin,'save-cms',{cms:state.cms,revision:state.revision});
  await p.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'onesCmsUpdatedAt'})));await p.locator('.blog-article').waitFor();checks++;
  console.log(`Segment 9 browser: ${checks} checks (7 widths × 2 themes, publication, canonical contacts, real login/cart, expired sessions and explicit Add retry)`);
 }finally{await browser.close();await admin.dispose();await customer.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});
