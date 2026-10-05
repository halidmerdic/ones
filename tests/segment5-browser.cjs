const {chromium,request}=require('playwright');
const assert=require('node:assert/strict');
const {activateCustomer}=require('./mail-helper.cjs');
const {withCartVersion}=require('./cart-helper.cjs');
const baseURL=process.env.ONES_TEST_URL;
if(process.env.ONES_DISPOSABLE_TEST!=='1'||new URL(baseURL).hostname!=='127.0.0.1')throw Error('Disposable loopback server required');
let checks=0;
async function get(ctx,action){const r=await ctx.get(baseURL+'/api.php?action='+action);assert.equal(r.status(),200,await r.text());return r.json()}
async function post(ctx,action,data){data=await withCartVersion(ctx,baseURL,action,data);return ctx.post(baseURL+'/api.php?action='+action,{data,headers:{'X-CSRF-Token':(await get(ctx,'csrf-token')).csrfToken}})}
(async()=>{
 const admin=await request.newContext({extraHTTPHeaders:{'CF-Connecting-IP':'198.51.100.151'}});
 const customer=await request.newContext({extraHTTPHeaders:{'CF-Connecting-IP':'198.51.100.152'}});
 const password='Segment five customer 2026!',email=`s5-${Date.now()}@example.invalid`;
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  assert.equal((await post(admin,'admin-login',{password:'Segment one admin password 2026!'})).status(),200);
  const state=await get(admin,'admin-cms'),today=state.pricingClock.date,product=state.cms.products[0];
  Object.assign(product,{mpcPrice:'100',discountPrice:'90',salePrice:'80',saleUntil:today,price:'100',enabled:true});
  assert.equal((await post(admin,'save-cms',{cms:state.cms,revision:state.revision})).status(),200);
  assert.equal((await post(customer,'customer-register',{name:'Segment five',email,acceptedPrivacy:true})).status(),200);
  await activateCustomer(customer,baseURL,email,password);
  assert.equal((await post(customer,'cart-add',{productId:product.id,quantity:1})).status(),200);
  await post(customer,'favorite-toggle',{productId:product.id});
  let cart=(await get(customer,'cart')).cart;
  const original=structuredClone(cart);
  // HTTP preconditions are mandatory, typed, scoped to the owner and checked on every action.
  for(const action of ['cart-add','cart-update','cart-remove','order-submit']){
   const body={cartId:cart.cartId,cartRevision:cart.revision-1,productId:product.id,quantity:9,itemId:cart.items[0].id,phone:'061123456'};
   const r=await post(customer,action,body);assert.equal(r.status(),409);assert.equal((await r.json()).code,'CART_CONFLICT');checks+=2;
  }
  assert.deepEqual((await get(customer,'cart')).cart,original);checks++;
  const raw=await customer.post(baseURL+'/api.php?action=cart-add',{data:{productId:product.id,quantity:1},headers:{'X-CSRF-Token':(await get(customer,'csrf-token')).csrfToken}});
  assert.equal(raw.status(),409);checks++;
  const zones=['America/Los_Angeles','Pacific/Kiritimati','UTC','Europe/Sarajevo'];
  for(const [index,width] of [320,360,390,768,820,1024,1440].entries())for(const dark of [false,true]){
   const ctx=await browser.newContext({viewport:{width,height:1000},hasTouch:width<=1024,timezoneId:zones[index%4],extraHTTPHeaders:{'CF-Connecting-IP':'198.51.100.153'}});
   try{
    await ctx.addInitScript(dark=>{localStorage.setItem('onesTheme:store:last',dark?'dark':'light')},dark);
    assert.equal((await post(ctx.request,'customer-login',{email,password})).status(),200);
    const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    // Freeze wall clock years in the future; prices must still follow the server.
    await page.clock.setFixedTime(new Date('2035-01-01T12:00:00Z'));
    await page.goto(baseURL+'/index.html');await page.waitForFunction(id=>cms.products.some(p=>p.id===id&&activePrice(p).label==='80'),product.id);
    assert.equal(await page.evaluate(id=>activePrice(cms.products.find(p=>p.id===id)).label,product.id),'80');checks++;
    await page.goto(baseURL+'/product.html?id='+encodeURIComponent(product.id));await page.waitForFunction(()=>product?.effectivePrice&&activePrice(product).label==='80');
    assert.equal(await page.evaluate(()=>activePrice(product).label),'80');checks++;
    await page.goto(baseURL+'/profile.html');await page.waitForFunction(()=>document.querySelector('#profileFavorites b')?.textContent==='80 KM');
    assert.equal(await page.locator('#profileFavorites b').first().textContent(),'80 KM');checks++;
    await page.goto(baseURL+'/cart.html');await page.waitForFunction(()=>cartReady&&priceText(cart.items[0].product)==='80');
    assert.equal(await page.evaluate(()=>priceText(cart.items[0].product)),'80');checks++;
    await page.locator('#orderPhone').fill('061123456');await page.locator('#orderNote').fill('Sačuvaj napomenu');
    // A second device updates while this page keeps the old version visible.
    cart=(await get(customer,'cart')).cart;
    assert.equal((await post(customer,'cart-update',{itemId:cart.items[0].id,quantity:3})).status(),200);
    await page.locator('[data-qty]').first().click();
    await page.waitForFunction(()=>!cartMutationPending && cart.count===3);
    assert.match(await page.locator('.admin-toast').last().textContent(),/drugom uređaju/);checks++;
    assert.equal(await page.locator('#orderNote').inputValue(),'Sačuvaj napomenu');assert.equal(await page.locator('#orderPhone').inputValue(),'061123456');checks+=2;
    assert.equal(await page.locator('#submitOrderBtn').isEnabled(),true);checks++;
    // Simulate the next confirmed store day without changing any device clock.
    const tomorrow=new Date(today+'T12:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
    const next=tomorrow.toISOString().slice(0,10);
    await page.route('**/api.php?action=pricing-clock',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,pricingClock:{date:next,zone:'Europe/Sarajevo',asOf:state.pricingClock.asOf+86400,refreshAfterMs:86400000}})}));
    await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
    await page.waitForFunction(()=>priceText(cart.items[0].product)==='90');checks++;
    assert.equal(await page.locator('#orderNote').inputValue(),'Sačuvaj napomenu');checks++;
    // Repeated prices from an older in-flight request cannot move store time back.
    await page.evaluate(()=>onesApi('cms'));assert.equal(await page.evaluate(()=>priceText(cart.items[0].product)),'90');checks++;
    assert.deepEqual(errors,[]);checks++;
    // Leave a different value so the next viewport produces an actual stale revision.
    cart=(await get(customer,'cart')).cart;await post(customer,'cart-update',{itemId:cart.items[0].id,quantity:1});
   }finally{await ctx.close()}
  }
  // A real order uses exactly the price the real server returned for this day.
  cart=(await get(customer,'cart')).cart;
  const expected=cart.items[0].product.effectivePrice.label;
  assert.equal((await post(customer,'order-submit',{phone:'061123456',note:'Server price snapshot'})).status(),200);
  const order=(await get(customer,'customer-profile')).orders[0];assert.equal(order.items[0].price,expected);checks++;
  for(const action of ['cart-add','cart-update','cart-remove','order-submit']){
   const r=await post(customer,action,{cartId:cart.cartId,cartRevision:cart.revision,productId:product.id,quantity:4,itemId:cart.items[0].id,phone:'061123456'});assert.equal(r.status(),409);checks++;
  }
  console.log(`Segment 5 HTTP/browser: ${checks} checks (7 widths, 2 themes, 4 time zones, wrong device clock)`);
 }finally{await browser.close();await customer.dispose();await admin.dispose()}
})().catch(e=>{console.error(e);process.exitCode=1});
