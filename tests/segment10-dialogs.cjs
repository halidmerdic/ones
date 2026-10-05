const {chromium}=require('playwright'),assert=require('node:assert/strict');
const baseURL=process.env.ONES_TEST_URL;
if(!baseURL||new URL(baseURL).hostname!=='127.0.0.1'||process.env.ONES_DISPOSABLE_TEST!=='1')throw Error('Disposable fixture required');
let checks=0;
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(baseURL+'/admin.html?panel=products');await page.locator('#passwordInput').fill('Segment one admin password 2026!');await page.locator('#loginBtn').click();await page.locator('[data-edit-product]').first().waitFor();
  for(const width of [320,820,1024,1440])for(const dark of [false,true]){
   await page.setViewportSize({width,height:1000});await page.evaluate(dark=>onesTheme.apply(dark?'dark':'light'),dark);
   for(const [panel,open,close] of [['categories','[data-edit-category]','#closeCategoryEditorBtn'],['orders','[data-order-detail]','#closeOrderDetailBtn'],['customers','[data-customer-detail]','#closeCustomerDetailBtn']]){
    await page.evaluate(key=>activatePanel(key),panel);await page.locator(open).first().click();
    const dialog=page.locator('.product-edit-dialog');await dialog.waitFor();
    await dialog.locator('h2').evaluate(e=>e.textContent='DugačakNaziv'.repeat(10));
    assert.equal(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,`${panel}/${width}/${dark}`);checks++;
    const box=await page.locator(close).boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1);checks++;
    await page.locator(close).click();await dialog.waitFor({state:'detached'});checks++;
   }
  }
  assert.deepEqual(errors,[]);checks++;console.log(`Segment 10 dialogs: ${checks} checks (category/order/customer, long titles, four widths/both themes and accessible close controls)`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
