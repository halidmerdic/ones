const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = process.env.ONES_TEST_URL;
if (!base || new URL(base).hostname !== '127.0.0.1' || process.env.ONES_DISPOSABLE_TEST !== '1') throw Error('Disposable loopback fixture required');
let checks = 0;
function ok(value, message) { assert.ok(value, message); checks++; }
async function post(ctx, action, data) {
  const {csrfToken} = await (await ctx.get(base+'/api.php?action=csrf-token')).json();
  const r = await ctx.post(base+'/api.php?action='+action, {data,headers:{'X-CSRF-Token':csrfToken}});
  assert.equal(r.status(),200,await r.text()); return r.json();
}
async function loaded(page, key, number, total) {
  await page.waitForFunction(({key,number,total}) => !adminLoads[key].loading && recordPages[key]?.page === number &&
    (total === undefined || recordPages[key]?.total === total), {key,number,total});
}
async function fits(page, selector) {
  ok(await page.locator(selector).evaluate(e => e.scrollWidth <= e.clientWidth+1),selector+' fits');
  ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1),'No document overflow');
}
async function until(fn) { const end=Date.now()+10000;while(!fn()){if(Date.now()>end)throw Error('Request not observed');await new Promise(r=>setTimeout(r,10));} }
(async()=>{
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1000}});
    for (const action of ['admin-orders','admin-customers','admin-customer-detail&customerId=2','admin-order-detail&orderId=1','customer-orders']) {
      const response=await context.request.get(base+'/api.php?action='+action);
      ok(response.status()===401,action+' requires authentication');
      ok((response.headers()['cache-control']||'').includes('no-store'),'Private response not cached');
    }
    await post(context.request,'admin-login',{password:'Segment one admin password 2026!'});
    for(const query of ['pageSize=51','page=0','search%5B%5D=x','date=2026-02-30']) {
      const response=await context.request.get(base+'/api.php?action=admin-orders&'+query);
      ok(response.status()===400 && (await response.json()).code==='INVALID_QUERY','Invalid query rejected');
    }
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/admin.html?panel=orders');await loaded(page,'orders',1,464);
    ok(await page.locator('[data-order-detail]').count()===25,'Initial download renders one page');
    await page.locator('[data-pagination="orders"] [data-page-change="next"]').click();await loaded(page,'orders',2,464);
    ok(await page.evaluate(()=>orders[0].id)===439,'Second page comes from server');
    await page.locator('[data-pagination="orders"] [data-page-size]').selectOption('50');await loaded(page,'orders',1,464);
    ok(await page.locator('[data-order-detail]').count()===50,'Page size bounded at 50');
    for(const width of [320,390,768,820,1024,1440]) for(const dark of [false,true]) {
      await page.setViewportSize({width,height:1000});await page.evaluate(d=>onesTheme.apply(d?'dark':'light'),dark);
      await page.evaluate(()=>activatePanel('orders'));await page.locator('#clearOrderFiltersBtn').click();await loaded(page,'orders',1,464);
      await page.locator('#orderProductFilter').fill('ŽUTI');await loaded(page,'orders',1,77);
      await page.locator('#orderStatusFilter').selectOption('Završeno');await loaded(page,'orders',1,38);
      ok(await page.evaluate(()=>orders.every(o=>o.status==='Završeno'&&o.items[0].name.includes('ŽUTI'))),'Filters search all history');
      await fits(page,'[data-panel="orders"]');
      await page.evaluate(()=>activatePanel('customers'));
      await page.locator('#customerSearch').fill('željko 100%_!');await loaded(page,'customers',1,1);
      ok(await page.evaluate(()=>customers[0].orders.length===0&&customers[0].orderCount===77),'Summary does not download history');
      await page.locator('[data-customer-detail]').click();await page.locator('[data-pagination="customer-history"]').waitFor();
      ok(await page.locator('[data-customer-order]').count()===25,'Customer detail downloads one page');
      await page.locator('[data-pagination="customer-history"] [data-page-change="next"]').click();
      await page.waitForFunction(()=>customerDetailPagination?.page===2);
      ok(await page.locator('[data-customer-order]').count()===25,'Customer history next page');
      await fits(page,'#customerDetailModal .product-edit-dialog');
      if(process.env.ONES_TEST_SCREENSHOTS && [390,1024,1440].includes(width) && !dark) await page.screenshot({path:path.join(process.env.ONES_TEST_SCREENSHOTS,`history-${width}.png`)});
      await page.locator('#closeCustomerDetailBtn').click();
      ok(await page.evaluate(()=>document.activeElement.matches('[data-customer-detail]')),'Async modal restores focus');
    }
    // Empty filters, invalid dates and retry preserve previous records rather than misrepresenting errors.
    await page.evaluate(()=>activatePanel('orders'));await page.locator('#clearOrderFiltersBtn').click();await loaded(page,'orders',1,464);
    await page.locator('#orderSearch').fill('does-not-exist');await loaded(page,'orders',1,0);
    ok(await page.locator('[data-order-detail]').count()===0,'Empty result');
    await page.locator('#clearOrderFiltersBtn').click();await loaded(page,'orders',1,464);
    await page.locator('#orderDateFilter').fill('2026-03-01');await page.locator('#orderDateToFilter').fill('2026-02-01');
    await page.locator('[data-retry-load="orders"]').waitFor();
    ok((await page.locator('[data-panel="orders"]').innerText()).includes('Datum od'),'Invalid date is an error');
    await page.locator('#clearOrderFiltersBtn').click();await loaded(page,'orders',1,464);
    // A response arriving during the debounce of a newer query must be ignored.
    let delayed, response;
    await page.route('**/api.php?action=admin-orders&**',async route=>{response=await route.fetch();delayed=route;});
    await page.evaluate(()=>{void loadOrders(true);});await until(()=>delayed);
    await page.locator('#orderSearch').fill('željko');
    await delayed.fulfill({response});await page.unroute('**/api.php?action=admin-orders&**');await loaded(page,'orders',1,77);
    ok(await page.locator('#orderSearch').inputValue()==='željko','Newer query survives old response');
    await page.locator('#clearOrderFiltersBtn').click();await loaded(page,'orders',1,464);
    await page.locator('#orderStatusFilter').selectOption('Novo');
    await page.waitForFunction(()=>!adminLoads.orders.loading && orders.every(o=>o.status==='Novo'));
    const id=await page.locator('[data-order-detail]').first().getAttribute('data-order-detail');
    await page.locator('[data-order-detail]').first().click();await page.locator('#orderDetailNote').fill('Keep my unsaved draft');
    await page.locator('#orderDetailStatus').selectOption('Kontaktiran');
    await page.waitForFunction(()=>!orderMutationPending&&!adminLoads.orders.loading);
    ok(await page.locator('#orderDetailNote').inputValue()==='Keep my unsaved draft','Draft survives removal from filtered page');
    ok(await page.evaluate(id=>!orders.some(o=>o.id===Number(id)),id),'Updated status removes row from filter');
    await page.locator('#saveOrderDetailNoteBtn').click();await page.waitForFunction(()=>!orderMutationPending&&!adminLoads.orders.loading);
    ok(await page.evaluate(()=>orderNoteDrafts.size)===0,'Single-record mutation confirms note');
    await page.locator('#closeOrderDetailBtn').click();
    // Closing a detail while its fetch is pending cannot reopen it afterwards.
    await page.evaluate(()=>activatePanel('customers'));delayed=null;
    await page.route('**/api.php?action=admin-customer-detail&**',async route=>{response=await route.fetch();delayed=route;});
    await page.locator('[data-customer-detail]').first().click();await until(()=>delayed);
    await page.locator('#closeCustomerDetailBtn').click();await delayed.fulfill({response});await page.unroute('**/api.php?action=admin-customer-detail&**');
    await page.waitForFunction(()=>document.querySelector('#customerDetailModal')===null);
    ok(await page.locator('#customerDetailModal').count()===0,'Closed async detail stays closed');
    await page.locator('#customerSearch').fill('pending logout');await page.evaluate(()=>adminLogout());
    await page.waitForTimeout(600);
    ok(await page.evaluate(()=>customers.length===0&&orders.length===0&&recordPages.orders===null&&recordPages.customers===null),'Logout clears pagination and cancels search');
    ok(errors.length===0,JSON.stringify(errors));

    const customer=await browser.newContext({viewport:{width:390,height:1000}});
    await post(customer.request,'customer-login',{email:'page0@example.invalid',password:'Page customer password 2026!'});
    let privateData=await(await customer.request.get(base+'/api.php?action=customer-orders&pageSize=50&customerId=3')).json();
    ok(privateData.pagination.total===77&&privateData.orders.length===50&&privateData.orders.every(o=>!('adminNote'in o)&&o.id<=77),'History ignores forged owner and excludes internal notes');
    const profile=await customer.newPage();profile.on('pageerror',e=>errors.push(e.message));
    await profile.goto(base+'/profile.html');await profile.locator('#profileOrderPagination').waitFor();
    ok(await profile.locator('#profileOrderCount').innerText()==='77','Profile shows total, not page length');
    await profile.route('**/api.php?action=customer-orders&**',r=>r.fulfill({status:500,contentType:'application/json',body:'{"ok":false,"message":"Test failure"}'}));
    await profile.locator('#profileOrderPagination').getByRole('button',{name:'Sljedeća',exact:true}).click();
    await profile.locator('#profileOrderPagination [role="alert"]').waitFor();
    ok((await profile.locator('#profileOrders').innerText()).includes('#77'),'Failed history preserves old page');
    await profile.unroute('**/api.php?action=customer-orders&**');
    await profile.locator('#profileOrderPagination').getByRole('button',{name:'Pokušaj ponovo'}).click();
    await profile.waitForFunction(()=>document.querySelector('#profileOrderPagination [role="status"]').textContent.includes('Stranica 2'));
    ok((await profile.locator('#profileOrders').innerText()).includes('#52'),'Retry requests failed target page');
    for(const width of [320,390,768,820,1024,1440]) for(const dark of [false,true]) {
      await profile.setViewportSize({width,height:1000});await profile.evaluate(d=>onesTheme.apply(d?'dark':'light'),dark);
      await fits(profile,'#profileOrderPagination');
    }
    ok(errors.length===0,JSON.stringify(errors));
    console.log(`Segment 12 browser: ${checks} checks (server pages, filters, details, drafts, async races, ownership, profile, 6 widths/both themes)`);
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
