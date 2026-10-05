const { chromium, request } = require('playwright');
const assert = require('node:assert/strict'), path = require('node:path');
const { activateCustomer } = require('./mail-helper.cjs'), { withCartVersion } = require('./cart-helper.cjs');
const baseURL = process.env.ONES_TEST_URL;
if (!baseURL || new URL(baseURL).hostname !== '127.0.0.1' || process.env.ONES_DISPOSABLE_TEST !== '1') throw Error('Disposable loopback server required');
let checks = 0;
async function get(ctx, action) { const r = await ctx.get(baseURL+'/api.php?action='+action); assert.equal(r.status(),200,await r.text()); return r.json(); }
async function post(ctx, action, data) {
  data = await withCartVersion(ctx, baseURL, action, data);
  const r = await ctx.post(baseURL+'/api.php?action='+action,{data,headers:{'X-CSRF-Token':(await get(ctx,'csrf-token')).csrfToken}});
  assert.equal(r.status(),200,await r.text()); return r.json();
}
async function until(fn) { const end=Date.now()+10000; while(!fn()){ if(Date.now()>end)throw Error('Pending request not observed'); await new Promise(r=>setTimeout(r,10)); } }
async function panel(page, key) { await page.evaluate(key=>activatePanel(key),key); }
async function has(page, selector, text) { assert.ok((await page.locator(selector).textContent()).includes(text)); checks++; }
async function fits(page, selector) {
  assert.equal(await page.locator(selector).evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,selector+' overflow'); checks++;
}
(async()=>{
  const browser = await chromium.launch({ channel:'chrome',headless:true });
  const admin = await request.newContext({extraHTTPHeaders:{'CF-Connecting-IP':'198.51.100.181'}});
  const customer = await request.newContext({extraHTTPHeaders:{'CF-Connecting-IP':'198.51.100.182'}});
  try {
    await post(admin,'admin-login',{password:'Segment one admin password 2026!'});
    let current=await get(admin,'admin-cms'); await post(admin,'reset-cms',{revision:current.revision}); current=await get(admin,'admin-cms');
    current.cms.badges.push({name:'Disabled fixture',enabled:false});
    current.cms.products[0].badge='Disabled fixture'; current.cms.categories[0].badge='Disabled fixture';
    await post(admin,'save-cms',{cms:current.cms,revision:current.revision});
    const publicCms=(await get(admin,'cms')).cms;
    assert.equal(publicCms.badges.some(b=>b.name==='Disabled fixture'),false);checks++;
    const email='segment8-'+Date.now()+'@example.invalid';
    await post(customer,'customer-register',{name:'Segment eight customer',email,acceptedPrivacy:true});
    await activateCustomer(customer,baseURL,email,'Segment eight customer 2026!');
    for(let i=0;i<2;i++) { await post(customer,'cart-add',{productId:current.cms.products[0].id,quantity:1}); await post(customer,'order-submit',{phone:'061123456',note:'Segment 8 fixture'}); }
    const [first,second]=(await get(admin,'admin-orders')).orders;
    for(const width of [320,360,390,768,820,1024,1440]) for(const dark of [false,true]) {
      const context=await browser.newContext({extraHTTPHeaders:{'CF-Connecting-IP':'198.51.100.183'},viewport:{width,height:1000},hasTouch:width<=1024});
      await post(context.request,'admin-login',{password:'Segment one admin password 2026!'});
      await context.addInitScript(dark=>localStorage.setItem('onesTheme:admin',dark?'dark':'light'),dark);
      const page=await context.newPage(), errors=[]; page.on('pageerror',error=>errors.push(error.message));
      // Both real public consumers see the filtered server response.
      for(const url of ['/', '/product.html?id='+current.cms.products[0].id]) {
        await page.goto(baseURL+url); await page.waitForFunction(()=>typeof cms!=='undefined' && cms?.badges?.some(b=>b.name==='Popularno'));
        assert.equal(await page.locator('.badge-row .badge').filter({hasText:'Disabled fixture'}).count(),0); checks++;
        assert.equal(await page.evaluate(()=>visibleBadge(cms.products[0])), '');checks++;
      }
      // Failed initial CMS must never expose demo inputs or enable Save.
      await page.route('**/api.php?action=admin-cms',route=>route.fulfill({status:503,contentType:'text/html',body:'Unavailable'}));
      await page.goto(baseURL+'/admin.html?panel=products');
      await page.locator('[data-retry-load=cms]').waitFor();
      assert.equal(await page.locator('#saveBtn').isDisabled(),true);checks++;
      assert.equal(await page.locator('[data-edit-product]').count(),0);checks++;
      await fits(page,'[data-load-state=cms]');
      await page.unroute('**/api.php?action=admin-cms');
      await page.locator('[data-retry-load=cms]').click(); await page.locator('[data-edit-product]').first().waitFor();
      assert.equal(await page.locator('#saveBtn').isEnabled(),true);checks++;
      // Each collection: initial error, retry, failed refresh preserves rows, delayed refresh and real empty result.
      for(const key of ['orders','customers']) {
        const pattern='**/api.php?action=admin-'+key;
        await page.route(pattern,route=>route.abort('failed'));
        await panel(page,key); await page.locator(`[data-retry-load=${key}]`).waitFor();
        assert.equal(await page.locator(`[data-panel=${key}] .product-admin-empty`).count(),0);checks++;
        await page.unroute(pattern); await page.locator(`[data-retry-load=${key}]`).click();
        await page.waitForFunction(key=>adminLoads[key].loaded&&!adminLoads[key].loading,key);
        const count=await page.evaluate(key=>key==='orders'?orders.length:customers.length,key); assert.ok(count>0);checks++;
        await page.route(pattern,route=>route.fulfill({status:500,contentType:'application/json',body:'{"ok":false}'}));
        await page.locator(key==='orders'?'#refreshOrdersBtn':'#refreshCustomersBtn').click();
        await page.locator(`[data-retry-load=${key}]`).waitFor();
        assert.equal(await page.evaluate(key=>key==='orders'?orders.length:customers.length,key),count);checks++;
        await has(page,`[data-load-state=${key}]`,'posljednji uspješno');await fits(page,`[data-load-state=${key}]`);
        if(key==='orders' && [320,820,1440].includes(width) && process.env.ONES_TEST_SCREENSHOTS) await page.screenshot({path:path.join(process.env.ONES_TEST_SCREENSHOTS,`orders-error-${width}-${dark?'dark':'light'}.png`)});
        await page.unroute(pattern); let pending;
        await page.route(pattern,route=>{pending=route;});
        await page.locator(`[data-retry-load=${key}]`).click();await until(()=>pending);
        await has(page,`[data-load-state=${key}]`,'Učitavanje');
        assert.equal(await page.evaluate(key=>key==='orders'?orders.length:customers.length,key),count);checks++;
        await pending.continue();await page.waitForFunction(key=>!adminLoads[key].loading,key); await page.unroute(pattern);
        // Successful [] is the only empty state; malformed success is an error.
        await page.route(pattern,route=>route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,[key]:[]})}));
        await page.evaluate(key=>key==='orders'?loadOrders(true):loadCustomers(true),key);
        assert.equal(await page.locator(`[data-panel=${key}] .product-admin-empty`).count(),1);checks++;
        await page.unroute(pattern);
        await page.route(pattern,route=>route.fulfill({contentType:'application/json',body:'{"ok":true}'}));
        await page.evaluate(key=>key==='orders'?loadOrders(true):loadCustomers(true),key);
        await page.locator(`[data-retry-load=${key}]`).waitFor();checks++;
        await page.unroute(pattern); await page.evaluate(key=>key==='orders'?loadOrders(true):loadCustomers(true),key);
      }
      // Draft survives status change, failed save, newer typing during save, closing/reopening, and another order.
      await panel(page,'orders');await page.locator(`[data-order-detail="${first.id}"]`).click();
      const note=page.locator('#orderDetailNote'); await note.fill('Draft '+width+' '+dark);
      const draft=await note.inputValue();let pending;
      await page.route('**/api.php?action=admin-order-status',route=>{pending=route;});
      await page.locator('#orderDetailStatus').selectOption('U obradi'); await until(()=>pending);
      assert.equal(await page.locator('#saveOrderDetailNoteBtn').isDisabled(),true);checks++;
      await note.fill(draft+' newer');await pending.continue();await page.waitForFunction(()=>!orderMutationPending);await page.unroute('**/api.php?action=admin-order-status');
      assert.equal(await note.inputValue(),draft+' newer');checks++;
      assert.equal((await get(admin,'admin-orders')).orders.find(o=>o.id===first.id).status,'U obradi');checks++;
      await page.route('**/api.php?action=admin-order-note',route=>route.abort('failed'));
      await page.locator('#saveOrderDetailNoteBtn').click();await page.waitForFunction(()=>!orderMutationPending);
      assert.equal(await note.inputValue(),draft+' newer');checks++;
      await has(page,'#orderDetailModal [role=alert]','Spremanje nije potvrđeno');
      await page.unroute('**/api.php?action=admin-order-note');pending=null;
      await page.route('**/api.php?action=admin-order-note',route=>{pending=route;});
      await page.locator('#saveOrderDetailNoteBtn').click();await until(()=>pending);
      await note.fill(draft+' final');await pending.continue();await page.waitForFunction(()=>!orderMutationPending);await page.unroute('**/api.php?action=admin-order-note');
      assert.equal(await note.inputValue(),draft+' final');checks++;
      assert.equal((await get(admin,'admin-orders')).orders.find(o=>o.id===first.id).adminNote,draft+' newer');checks++;
      assert.equal(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;}),true);checks++;
      page.once('dialog',dialog=>dialog.dismiss());await page.locator('#closeOrderDetailBtn').click();assert.equal(await note.count(),1);checks++;
      page.once('dialog',dialog=>dialog.accept());await page.keyboard.press('Escape');assert.equal(await note.count(),0);checks++;
      await page.locator(`[data-order-detail="${second.id}"]`).click();assert.notEqual(await note.inputValue(),draft+' final');checks++;
      await page.locator('#closeOrderDetailBtn').click();await page.locator(`[data-order-detail="${first.id}"]`).click();assert.equal(await note.inputValue(),draft+' final');checks++;
      await page.locator('#saveOrderDetailNoteBtn').click();await page.waitForFunction(()=>!orderMutationPending);
      assert.equal((await get(admin,'admin-orders')).orders.find(o=>o.id===first.id).adminNote,draft+' final');checks++;
      await has(page,'#orderDetailNoteState','Napomena je sačuvana');
      assert.equal(await page.evaluate(()=>orderNoteDrafts.size),0);checks++;
      await page.locator('#closeOrderDetailBtn').click();
      // Failed CMS reload locks editing and keeps last successful revision, then retry recovers.
      await panel(page,'products');const revision=await page.evaluate(()=>cmsRevision);
      await page.route('**/api.php?action=admin-cms',route=>route.fulfill({status:403,contentType:'application/json',body:'{"ok":false}'}));
      await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'onesCmsUpdatedAt',newValue:String(Date.now())})));
      await page.locator('[data-retry-load=cms]').waitFor();await has(page,'#cmsLoadState','Sesija je istekla');
      assert.equal(await page.evaluate(()=>cmsRevision),revision);checks++;
      assert.equal(await page.locator('#saveBtn').isDisabled(),true);checks++;
      assert.equal(await page.locator('[data-edit-product]').count(),0);checks++;
      await page.unroute('**/api.php?action=admin-cms');await page.locator('[data-retry-load=cms]').click();await page.locator('[data-edit-product]').first().waitFor();
      assert.deepEqual(errors,[]);checks++;
      await context.close();
    }
    console.log(`Segment 8 browser: ${checks} checks (7 widths × 2 themes, real orders/badges, request failures/delays/retries, note drafts)`);
  } finally { await browser.close();await admin.dispose();await customer.dispose(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
