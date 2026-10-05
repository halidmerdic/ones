const {chromium,request}=require('playwright');
const assert=require('node:assert/strict');
const {activateCustomer}=require('./mail-helper.cjs');
const baseURL=process.env.ONES_TEST_URL;
if(!baseURL||new URL(baseURL).hostname!=='127.0.0.1'||process.env.ONES_DISPOSABLE_TEST!=='1')throw Error('Disposable loopback fixture required');
let checks=0;
async function post(c,action,data){
 const csrf=await(await c.get(baseURL+'/api.php?action=csrf-token')).json();
 const r=await c.post(baseURL+'/api.php?action='+action,{data,headers:{'X-CSRF-Token':csrf.csrfToken}});
 assert.equal(r.status(),200,await r.text());return r.json();
}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),admin=await request.newContext();
 try{
  await post(admin,'admin-login',{password:'Segment one admin password 2026!'});
  const state=await(await admin.get(baseURL+'/api.php?action=admin-cms')).json();
  await post(admin,'reset-cms',{revision:state.revision});
  const cms=(await(await admin.get(baseURL+'/api.php?action=cms')).json()).cms;
  const context=await browser.newContext({hasTouch:true});
  const email='card-'+Date.now()+'@example.invalid';
  await post(context.request,'customer-register',{name:'Card test',email,acceptedPrivacy:true});
  await activateCustomer(context.request,baseURL,email,'Card action password 2026!');
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  let columns=4;
  await page.route('**/api.php?action=cms',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,cms:{...cms,settings:{...cms.settings,productGridColumns:columns}}})}));
  for(columns of [3,4])for(const width of [320,360,390,768,820,1024,1440]){
   await page.setViewportSize({width,height:1000});await page.goto(baseURL+'/');
   await page.waitForFunction(()=>currentCustomer!==null);await page.locator('[data-add-cart]').first().waitFor();
   const card=page.locator('#productGrid .product-card').first();
   const activate=async locator=>width<=1024?locator.tap():locator.click();
   // Real pointer hit-testing: no forced clicks, DOM dispatch or CSS overrides.
   await activate(card.locator('[data-inquiry-product]'));await page.locator('#inquiryModal').waitFor();checks++;
   await page.locator('.inquiry-close').click();
   const favorite=card.locator('[data-favorite]'),prior=await favorite.getAttribute('aria-pressed');
   await activate(favorite);await page.waitForFunction(prior=>document.querySelector('#productGrid [data-favorite]').getAttribute('aria-pressed')!==prior,prior);checks++;
   const before=(await(await context.request.get(baseURL+'/api.php?action=cart')).json()).cart.count;
   await Promise.all([page.waitForResponse(r=>r.url().includes('action=cart-add')&&r.status()===200),activate(card.locator('[data-add-cart]'))]);
   assert.equal((await(await context.request.get(baseURL+'/api.php?action=cart')).json()).cart.count,before+1);checks++;
   await card.locator('[data-add-cart]').focus();
   await Promise.all([page.waitForResponse(r=>r.url().includes('action=cart-add')&&r.status()===200),page.keyboard.press('Enter')]);
   assert.equal((await(await context.request.get(baseURL+'/api.php?action=cart')).json()).cart.count,before+2);checks++;
   // The card link intentionally covers non-interactive text. Hit-test its
   // visible title coordinates rather than asking Playwright to bypass it.
   await card.locator('h3').evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));
   const title=await card.locator('h3').boundingBox(),x=title.x+title.width/2,y=title.y+title.height/2;
   assert.equal(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.classList.contains('card-open-link'),{x,y}),true);checks++;
   if(width<=1024)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);
   await page.waitForURL(url=>url.pathname.endsWith('/product.html'));checks++;
  }
  assert.deepEqual(errors,[]);checks++;
  console.log(`Product card actions: ${checks} checks (3/4 columns, 7 widths, touch/mouse, inquiry/favorite/cart/card navigation and keyboard)`);
 }finally{await browser.close();await admin.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});
