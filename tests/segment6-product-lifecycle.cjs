const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const baseURL=process.env.ONES_TEST_URL;
if(!baseURL||process.env.ONES_DISPOSABLE_TEST!=='1'||new URL(baseURL).hostname!=='127.0.0.1')throw Error('Disposable loopback server required');
let checks=0;
async function get(c,a){const r=await c.get(baseURL+'/api.php?action='+a);assert.equal(r.status(),200,await r.text());return r.json()}
async function save(page,selector){
 const pending=page.waitForResponse(r=>r.url().includes('action=save-cms'));
 await page.locator(selector).click();const response=await pending;
 assert.equal(response.status(),200,await response.text());await page.waitForFunction(()=>!cmsSaving);checks++;
}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const width of [320,820,1440]){
   const ctx=await browser.newContext({viewport:{width,height:1000},hasTouch:width<=1024});
   try{
    const csrf=(await get(ctx.request,'csrf-token')).csrfToken;
    assert.equal((await ctx.request.post(baseURL+'/api.php?action=admin-login',{data:{password:'Segment one admin password 2026!'},headers:{'X-CSRF-Token':csrf}})).status(),200);
    const baseline=await get(ctx.request,'admin-cms');
    const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(baseURL+'/admin.html?panel=products');await page.locator('#addProductBtn').click();
    const modal=page.locator('#productEditModal');
    const id=await modal.getByLabel('ID',{exact:true}).inputValue();
    await modal.getByLabel('Naziv',{exact:true}).fill('Proba 2026 '+width);
    await save(page,'#saveProductCmsBtn');
    let state=await get(ctx.request,'admin-cms');
    assert.equal(state.cms.products.length,baseline.cms.products.length+1);
    assert.ok(state.cms.products.some(p=>p.id===id&&typeof p._identity==='string'));checks+=2;
    await page.reload();await page.locator(`[data-edit-product="${id}"]`).click();
    const identity=page.locator('#productEditModal').getByLabel('ID',{exact:true});
    assert.equal(await identity.inputValue(),id);assert.equal(await identity.evaluate(e=>e.readOnly),true);checks+=2;
    if(process.env.ONES_TEST_SCREENSHOTS)await page.screenshot({path:path.join(process.env.ONES_TEST_SCREENSHOTS,`identity-${width}.png`)});
    const sitemap=await ctx.request.get(baseURL+'/sitemap.php');assert.equal(sitemap.status(),200);
    const xml=await sitemap.text();assert.ok(xml.includes('product.html?id='+id));
    assert.equal(await page.evaluate(xml=>new DOMParser().parseFromString(xml,'application/xml').documentElement.nodeName,xml),'urlset');checks+=3;
    // Removing a newly saved record must send its explicit ID after a reload.
    await page.locator('#deleteProductBtn').click();await page.locator('#cmsRelationDialog').getByRole('button',{name:'Obriši',exact:true}).click();await page.locator('#cmsRelationDialog').waitFor({state:'detached'});await save(page,'#saveBtn');
    state=await get(ctx.request,'admin-cms');
    assert.equal(state.cms.products.length,baseline.cms.products.length);
    assert.equal(state.cms.products.some(p=>p.id===id),false);
    assert.deepEqual(errors,[]);checks+=3;
   }finally{await ctx.close()}
  }
  console.log(`Product lifecycle checks: ${checks} (320/820/1440 px; create, reload, immutable ID, explicit delete, numeric-name sitemap)`);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
