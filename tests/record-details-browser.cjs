const {chromium}=require('playwright'),assert=require('node:assert/strict');
const path=require('node:path');
const base=process.env.ONES_TEST_URL;
if(!base||new URL(base).hostname!=='127.0.0.1'||process.env.ONES_DISPOSABLE_TEST!=='1')throw Error('Disposable loopback fixture required');
let checks=0;
function ok(value,message){assert.ok(value,message);checks++;}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:820,height:1000},hasTouch:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/admin.html?panel=customers');await page.locator('#passwordInput').fill('Segment one admin password 2026!');await page.locator('#loginBtn').click();
  await page.locator('#customerSearch').fill('page0@example.invalid');await page.waitForFunction(()=>recordPages.customers?.total===1&&!adminLoads.customers.loading);
  await page.locator('[data-customer-detail]').tap();await page.locator('[data-pagination="customer-history"]').waitFor();
  const original=await page.evaluate(()=>customerTemplateValues(customerDetailRecord));
  ok(original.broj_upita===77,'Latest inquiry used for contact');
  for(const target of [2,3]){
   await page.locator('[data-pagination="customer-history"] [data-page-change="next"]').tap();
   await page.waitForFunction(n=>customerDetailPagination?.page===n,target);
   assert.deepEqual(await page.evaluate(()=>customerTemplateValues(customerDetailRecord)),original);checks++;
   ok(await page.locator('[data-customer-order]').first().getAttribute('data-customer-order')!==String(original.broj_upita),'Visible page changes while contact remains latest');
  }
  await page.route('**/api.php?action=admin-customer-detail&**',r=>r.fulfill({status:500,contentType:'application/json',body:'{"ok":false,"message":"Test detail failure"}'}));
  await page.locator('[data-pagination="customer-history"] [data-page-change="next"]').tap();
  await page.locator('#customerDetailModal [role="alert"]').waitFor();
  ok(await page.locator('.admin-shell').evaluate(e=>e.inert),'Error detail retains focus isolation');
  await page.unroute('**/api.php?action=admin-customer-detail&**');await page.locator('#customerDetailModal').getByRole('button',{name:'Pokušaj ponovo'}).tap();
  await page.waitForFunction(()=>customerDetailPagination?.page===4);
  ok(await page.locator('[data-customer-order]').count()===2,'Detail retry goes to requested last page');
  await page.locator('#closeCustomerDetailBtn').tap();
  // Force detail retrieval for a record absent from the currently downloaded order page.
  await page.evaluate(()=>activatePanel('orders'));await page.locator('[data-order-detail]').first().waitFor();
  ok(await page.evaluate(()=>!orders.some(o=>o.id===1)),'Selected record is not on loaded list');
  await page.evaluate(()=>openOrderDetail(1));await page.locator('#orderDetailStatus').waitFor();
  ok(await page.locator('#orderDetailModal').getAttribute('data-order-id')==='1','One-record endpoint opens off-page inquiry');
  await page.keyboard.press('Escape');ok(await page.locator('#orderDetailModal').count()===0,'Off-page detail closes');
  await page.evaluate(()=>activatePanel('customers'));await page.locator('[data-customer-detail]').tap();await page.locator('[data-pagination="customer-history"]').waitFor();
  if(process.env.ONES_TEST_SCREENSHOTS){
   await page.locator('[data-pagination="customer-history"]').scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(process.env.ONES_TEST_SCREENSHOTS,'history-pagination-tablet.png')});
  }
  ok(errors.length===0,JSON.stringify(errors));
  console.log(`Record details: ${checks} checks (stable contact template, detail retry, last page, off-page order and touch)`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
