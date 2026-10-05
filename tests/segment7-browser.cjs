const {chromium,request}=require('playwright');
const assert=require('node:assert/strict'),path=require('node:path');
const {activateCustomer}=require('./mail-helper.cjs'),{withCartVersion}=require('./cart-helper.cjs');
const baseURL=process.env.ONES_TEST_URL;
if(!baseURL||process.env.ONES_DISPOSABLE_TEST!=='1'||new URL(baseURL).hostname!=='127.0.0.1')throw Error('Disposable loopback server required');
let checks=0;
async function get(c,a){const r=await c.get(baseURL+'/api.php?action='+a);assert.equal(r.status(),200,await r.text());return r.json()}
async function post(c,a,data){data=await withCartVersion(c,baseURL,a,data);return c.post(baseURL+'/api.php?action='+a,{data,headers:{'X-CSRF-Token':(await get(c,'csrf-token')).csrfToken}})}
async function ok(response){assert.equal(response.status(),200,await response.text());return response.json()}
async function save(page){const pending=page.waitForResponse(r=>r.url().includes('action=save-cms'));await page.locator('#saveBtn').click();await ok(await pending);await page.waitForFunction(()=>!cmsSaving);checks++}
async function confirm(page){await page.locator('#cmsRelationDialog button[type=submit]').click();await page.locator('#cmsRelationDialog').waitFor({state:'detached'})}
(async()=>{
 const admin=await request.newContext({extraHTTPHeaders:{'CF-Connecting-IP':'198.51.100.171'}}),customer=await request.newContext({extraHTTPHeaders:{'CF-Connecting-IP':'198.51.100.172'}});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  await ok(await post(admin,'admin-login',{password:'Segment one admin password 2026!'}));
  const state=await get(admin,'admin-cms');
  for(const referenceChanges of [[],null,'bad',{unknown:[]},{categories:{}},{badges:{}},{categories:[[]]},{categories:[{from:'x'}]},{categories:[{from:'x',to:[]} ]},{badges:[{}]}]){
   const r=await post(admin,'save-cms',{cms:state.cms,revision:state.revision,referenceChanges});assert.equal(r.status(),422,await r.text());
   assert.equal((await get(admin,'admin-cms')).revision,state.revision);checks+=2;
  }
  const email='s7-'+Date.now()+'@example.invalid',password='Segment seven customer 2026!';
  await ok(await post(customer,'customer-register',{name:'Relation customer',email,acceptedPrivacy:true}));await activateCustomer(customer,baseURL,email,password);
  for(const width of [320,360,390,768,820,1024,1440])for(const dark of [false,true]){
   let current=await get(admin,'admin-cms');await ok(await post(admin,'reset-cms',{revision:current.revision}));current=await get(admin,'admin-cms');
   const cms=current.cms,id=cms.products[0].id,source=cms.categories[0].name,target=cms.categories[1].name,badge=cms.badges.find(b=>b.name!=='-').name;
   cms.products[0].badge=badge;cms.products[0].badgeUntil='2030-01-01';cms.products[0].specs={Original:'Sačuvano'};
   cms.categories[0].badge=badge;cms.categories[0].badgeUntil='2030-01-02';
   cms.badges.push({name:'Scoped marker',enabled:true,applyCategory:source});
   const second=structuredClone(cms.products[0]);delete second._identity;second.id='other-product';second.name='Drugi proizvod';second.category=target;second.badge='-';cms.products.push(second);
   cms.manuals=[{title:'Product manual',relatedProductId:id,category:source,visibility:'Javno',file:'assets/ones-logo.webp'},{title:'General manual',relatedProductId:'',category:source,visibility:'Javno',file:'assets/ones-logo.webp'}];
   await ok(await post(admin,'save-cms',{cms,revision:current.revision}));
   await ok(await post(customer,'cart-add',{productId:id,quantity:2}));await ok(await post(customer,'cart-add',{productId:second.id,quantity:1}));await ok(await post(customer,'favorite-toggle',{productId:id}));
   const ctx=await browser.newContext({viewport:{width,height:1000},hasTouch:width<=1024,extraHTTPHeaders:{'CF-Connecting-IP':'198.51.100.173'}});
   try{
    await ctx.addInitScript(dark=>localStorage.setItem('onesTheme:admin',dark?'dark':'light'),dark);
    await ok(await post(ctx.request,'admin-login',{password:'Segment one admin password 2026!'}));
    const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(baseURL+'/admin.html?panel=badges');
    let card=page.locator('[data-panel="badges"] .admin-card').filter({has:page.getByRole('heading',{name:badge,exact:true})});
    const renamed='Oznaka '+width+' '+dark;await card.getByLabel('Naziv badgea',{exact:true}).fill(renamed);await card.getByLabel('Naziv badgea',{exact:true}).press('Tab');await save(page);
    let saved=(await get(admin,'admin-cms')).cms;
    assert.equal(saved.products[0].badge,renamed);assert.equal(saved.categories[0].badge,renamed);assert.equal(saved.products[0].badgeUntil,'2030-01-01');assert.equal(saved.categories.length,3);checks+=4;
    card=page.locator('[data-panel="badges"] .admin-card').filter({has:page.getByRole('heading',{name:renamed,exact:true})});
    await card.getByRole('button',{name:'Obriši',exact:true}).click();
    const draft=await page.evaluate(()=>JSON.stringify(cms));await page.locator('#cmsRelationDialog').getByRole('button',{name:'Odustani'}).click();assert.equal(await page.evaluate(()=>JSON.stringify(cms)),draft);checks++;
    await card.getByRole('button',{name:'Obriši',exact:true}).click();await confirm(page);await save(page);
    saved=(await get(admin,'admin-cms')).cms;
    assert.equal(saved.products[0].badge,'-');assert.equal(saved.categories[0].badge,'-');assert.equal(saved.products[0].badgeUntil,'');assert.equal(saved.categories[0].badgeUntil,'');checks+=4;
    await page.goto(baseURL+'/admin.html?panel=categories');await page.locator('[data-edit-category="0"]').click();await page.locator('#deleteCategoryBtn').click();
    await page.locator('#cmsRelationDialog button[type=submit]').click();assert.equal(await page.locator('#cmsRelationDialog').isVisible(),true);checks++;
    await page.keyboard.press('Escape');await page.locator('#cmsRelationDialog').waitFor({state:'detached'});assert.equal(await page.locator('#categoryEditModal').isVisible(),true);assert.equal(await page.locator('#cmsRelationDialog').count(),0);checks+=2;
    await page.locator('#deleteCategoryBtn').click();await page.locator('#cmsRelationTarget').selectOption(target);
    if(process.env.ONES_TEST_SCREENSHOTS&&[320,820,1440].includes(width))await page.screenshot({path:path.join(process.env.ONES_TEST_SCREENSHOTS,`category-${width}-${dark?'dark':'light'}.png`)});
    const bounds=await page.locator('#cmsRelationDialog').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1);checks++;
    await confirm(page);await save(page);saved=(await get(admin,'admin-cms')).cms;
    assert.equal(saved.categories.some(c=>c.name===source),false);assert.equal(saved.products[0].category,target);assert.equal(saved.manuals[0].category,target);assert.equal(saved.badges.find(b=>b.name==='Scoped marker').applyCategory,target);assert.equal(saved.products[0].specs.Original,'Sačuvano');checks+=5;
    await page.locator('#addCategoryBtn').click();const empty='Prazna '+width+' '+dark;
    await page.locator('#categoryEditModal').getByLabel('Naziv',{exact:true}).fill(empty);await page.locator('#closeCategoryEditorBtn').click();await save(page);await page.reload();
    assert.ok((await get(admin,'admin-cms')).cms.categories.some(c=>c.name===empty));checks++;
    await page.goto(baseURL+'/admin.html?panel=products');await page.locator(`[data-edit-product="${id}"]`).click();await page.locator('#deleteProductBtn').click();
    await page.locator('#cmsRelationDialog').getByRole('button',{name:'Odustani'}).click();assert.equal(await page.locator('#productEditModal').isVisible(),true);checks++;
    const beforeCart=(await get(customer,'cart')).cart;
    await page.locator('#deleteProductBtn').click();await confirm(page);await save(page);
    saved=(await get(admin,'admin-cms')).cms;const cartAfter=(await get(customer,'cart')).cart;
    assert.equal(saved.products.some(p=>p.id===id),false);assert.deepEqual(saved.manuals.map(m=>m.title),['General manual']);
    assert.equal(cartAfter.count,1);assert.equal(cartAfter.items[0].productId,'other-product');assert.equal(cartAfter.revision,beforeCart.revision+1);assert.deepEqual((await get(customer,'favorites')).favorites,[]);checks+=6;
    assert.equal((await post(customer,'cart-add',{productId:id,quantity:1})).status(),409);assert.equal((await post(customer,'favorite-toggle',{productId:id})).status(),409);checks+=2;
    assert.deepEqual(errors,[]);checks++;
   }finally{await ctx.close()}
  }
  console.log(`Segment 7 HTTP/browser checks: ${checks} (7 widths, 2 themes; category replacement, badge rename/delete, product deletion, empty category retention)`);
 }finally{await browser.close();await admin.dispose();await customer.dispose()}
})().catch(e=>{console.error(e);process.exitCode=1});
