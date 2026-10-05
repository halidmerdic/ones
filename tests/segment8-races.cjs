const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const baseURL = process.env.ONES_TEST_URL;
if (!baseURL || new URL(baseURL).hostname !== '127.0.0.1' || process.env.ONES_DISPOSABLE_TEST !== '1') throw Error('Disposable loopback server required');
let checks=0;
async function until(fn) { const end=Date.now()+10000;while(!fn()){if(Date.now()>end)throw Error('Request not observed');await new Promise(r=>setTimeout(r,10));} }
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:820,height:1000}}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const token=(await(await context.request.get(baseURL+'/api.php?action=csrf-token')).json()).csrfToken;
    assert.equal((await context.request.post(baseURL+'/api.php?action=admin-login',{headers:{'X-CSRF-Token':token},data:{password:'Segment one admin password 2026!'}})).status(),200);
    await page.goto(baseURL+'/admin.html?panel=orders');await page.locator('[data-order-detail]').first().waitFor();
    const ids=await page.evaluate(()=>orders.map(o=>o.id));assert.ok(ids.length>=2,'Run segment8-browser.cjs first');checks++;
    const id=ids[0],other=ids[1];
    // A read already in flight must not replace a newer successful write.
    let delayed,oldResponse,readCount=0;
    await page.route('**/api.php?action=admin-orders',async route=>{readCount++;oldResponse=await route.fetch();delayed=route;});
    await page.evaluate(()=>{void loadOrders(true);void loadOrders(true);});await until(()=>delayed);
    assert.equal(readCount,1);checks++;
    await page.locator(`[data-order-detail="${id}"]`).click();
    await page.locator('#orderDetailNote').fill('Race draft');
    await page.locator('#orderDetailStatus').selectOption('Kontaktiran');await page.waitForFunction(()=>!orderMutationPending);
    await delayed.fulfill({response:oldResponse});await page.unroute('**/api.php?action=admin-orders');
    await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,50)));
    assert.equal(await page.evaluate(id=>orders.find(o=>o.id===id).status,id),'Kontaktiran');checks++;
    assert.equal(await page.locator('#orderDetailNote').inputValue(),'Race draft');checks++;
    // Rejecting a status request restores the confirmed status and preserves the draft.
    await page.route('**/api.php?action=admin-order-status',route=>route.fulfill({status:500,contentType:'application/json',body:'{"ok":false,"message":"Test error"}'}));
    await page.locator('#orderDetailStatus').selectOption('Završeno');await page.waitForFunction(()=>!orderMutationPending);
    assert.equal(await page.locator('#orderDetailStatus').inputValue(),'Kontaktiran');checks++;
    assert.equal(await page.locator('#orderDetailNote').inputValue(),'Race draft');checks++;
    await page.unroute('**/api.php?action=admin-order-status');
    await page.route('**/api.php?action=admin-order-note',route=>route.fulfill({contentType:'application/json',body:'{"ok":true,"orders":[]}'}));
    await page.locator('#saveOrderDetailNoteBtn').click();await page.waitForFunction(()=>!orderMutationPending);
    assert.equal(await page.locator('#orderDetailNote').inputValue(),'Race draft');checks++;
    assert.equal(await page.evaluate(id=>orderNoteDrafts.get(id),id),'Race draft');checks++;
    await page.unroute('**/api.php?action=admin-order-note');
    // Closing A while its save is pending must not reopen A over B; duplicate writes are ignored.
    delayed=null;let mutationCount=0;
    await page.route('**/api.php?action=admin-order-note',route=>{mutationCount++;delayed=route;});
    await page.locator('#saveOrderDetailNoteBtn').click();await until(()=>delayed);
    await page.evaluate(id=>updateOrderNote(id,'Unexpected duplicate'),id);assert.equal(mutationCount,1);checks++;
    page.once('dialog',dialog=>dialog.accept());await page.locator('#closeOrderDetailBtn').click();
    await page.locator(`[data-order-detail="${other}"]`).click();await delayed.continue();await page.waitForFunction(()=>!orderMutationPending);
    assert.equal(await page.locator('#orderDetailModal').getAttribute('data-order-id'),String(other));checks++;
    assert.notEqual(await page.locator('#orderDetailNote').inputValue(),'Race draft');checks++;
    await page.unroute('**/api.php?action=admin-order-note');await page.locator('#closeOrderDetailBtn').click();
    // Empty notes can be deliberately saved; oversized notes remain editable after the API rejects them.
    await page.locator(`[data-order-detail="${id}"]`).click();await page.locator('#orderDetailNote').fill('ž'.repeat(1001));
    await page.locator('#saveOrderDetailNoteBtn').click();await page.waitForFunction(()=>!orderMutationPending);
    assert.equal((await page.locator('#orderDetailNote').inputValue()).length,1001);checks++;
    await page.locator('#orderDetailNote').fill('');await page.locator('#saveOrderDetailNoteBtn').click();await page.waitForFunction(()=>!orderMutationPending);
    assert.equal(await page.evaluate(id=>orders.find(o=>o.id===id).adminNote,id),'');checks++;
    assert.equal(await page.evaluate(()=>orderNoteDrafts.size),0);checks++;
    await page.locator('#closeOrderDetailBtn').click();
    // Malformed success must preserve the full previous CMS and revision.
    await page.evaluate(()=>activatePanel('products'));
    const before=await page.evaluate(()=>({cms:cmsSnapshot(),revision:cmsRevision}));
    const original=await(await context.request.get(baseURL+'/api.php?action=admin-cms')).json();
    await page.route('**/api.php?action=admin-cms',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({...original,cms:{...original.cms,products:[null]}})}));
    assert.equal(await page.evaluate(()=>loadCms()),false);checks++;
    assert.deepEqual(await page.evaluate(()=>({cms:cmsSnapshot(),revision:cmsRevision})),before);checks++;
    assert.equal(await page.locator('#saveBtn').isDisabled(),true);checks++;
    await page.unroute('**/api.php?action=admin-cms');await page.locator('[data-retry-load=cms]').click();await page.locator('[data-edit-product]').first().waitFor();
    // A failed reload with an open clean editor closes it, so stale content cannot remain editable.
    await page.locator('[data-edit-product]').first().click();
    await page.locator('#saveProductCmsBtn').click();await page.waitForFunction(()=>!cmsSaving);
    await page.route('**/api.php?action=admin-cms',route=>route.abort('failed'));
    await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'onesCmsUpdatedAt',newValue:'reload'})));
    await page.locator('[data-retry-load=cms]').waitFor();assert.equal(await page.locator('#productEditModal').count(),0);checks++;
    await page.unroute('**/api.php?action=admin-cms');await page.locator('[data-retry-load=cms]').click();await page.locator('[data-edit-product]').first().waitFor();
    // A delayed response from the old session cannot restore private state after logout.
    delayed=null;
    await page.route('**/api.php?action=admin-cms',async route=>{oldResponse=await route.fetch();delayed=route;});
    await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'onesCmsUpdatedAt',newValue:'logout-race'})));await until(()=>delayed);
    await page.evaluate(()=>adminLogout());await delayed.fulfill({response:oldResponse});
    await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,50)));
    assert.deepEqual(await page.evaluate(()=>({orders:orders.length,customers:customers.length,loaded:adminLoads.cms.loaded,revision:cmsRevision,drafts:orderNoteDrafts.size,nav:document.querySelector('#adminNav').children.length})),{orders:0,customers:0,loaded:false,revision:0,drafts:0,nav:0});checks++;
    assert.equal(await page.locator('#adminEditor').isHidden(),true);checks++;
    assert.equal(await page.locator('#saveBtn').isDisabled(),true);checks++;
    assert.deepEqual(errors,[]);checks++;
    console.log(`Segment 8 races: ${checks} checks (late reads, duplicate writes, rejected status, close during save, note limits, invalid CMS, logout)`);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
