const {chromium,request}=require('playwright');
const assert=require('node:assert/strict');
const {activateCustomer}=require('./mail-helper.cjs');
const {withCartVersion}=require('./cart-helper.cjs');
const baseURL=process.env.ONES_TEST_URL;
if(process.env.ONES_DISPOSABLE_TEST!=='1'||new URL(baseURL).hostname!=='127.0.0.1')throw Error('Disposable loopback server required');
let checks=0;
async function get(c,a){const r=await c.get(baseURL+'/api.php?action='+a);assert.equal(r.status(),200,await r.text());return r.json()}
async function post(c,a,data){data=await withCartVersion(c,baseURL,a,data);return c.post(baseURL+'/api.php?action='+a,{data,headers:{'X-CSRF-Token':(await get(c,'csrf-token')).csrfToken}})}
(async()=>{
 const admin=await request.newContext({extraHTTPHeaders:{'CF-Connecting-IP':'198.51.100.161'}}),customer=await request.newContext({extraHTTPHeaders:{'CF-Connecting-IP':'198.51.100.162'}});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  assert.equal((await post(admin,'admin-login',{password:'Segment one admin password 2026!'})).status(),200);
  let current=await get(admin,'admin-cms');let cms=structuredClone(current.cms),product=cms.products[0],id=product.id;
  cms.categories[0].attributes=[{name:'Boja',values:['Crna','Bijela']}];
  cms.categories[0].badge=cms.badges[0].name;cms.badges[0].applyCategory=cms.categories[0].name;
  product.badge=cms.badges[0].name;product.specs={};product.attributes={};product.gallery=[];
  cms.manuals=[{title:'Povezano uputstvo',relatedProductId:id,category:product.category,visibility:'Javno',file:'assets/ones-logo.webp'}];
  assert.equal((await post(admin,'save-cms',{cms,revision:current.revision})).status(),200);
  current=await get(admin,'admin-cms');
  assert.equal(Array.isArray(current.cms.products[0].specs),false);assert.equal(Array.isArray(current.cms.products[0].attributes),false);checks+=2;
  async function rejected(candidate,path,deletedProductIds=[]){
   const r=await post(admin,'save-cms',{cms:candidate,revision:current.revision,deletedProductIds});
   assert.equal(r.status(),422,await r.text());const data=await r.json();assert.ok(data.errors.some(e=>e.includes(path)),JSON.stringify(data));
   const after=await get(admin,'admin-cms');assert.deepEqual(after.cms,current.cms);assert.equal(after.revision,current.revision);checks+=4;
  }
  for(const collection of ['launchChecklist','categories','badges','products','comingSoon','parts','manuals','locations','blogs','faq'])for(const bad of [{},{0:{}},{named:{}},null,'bad',[null]]){
   const c=structuredClone(current.cms);c[collection]=bad;await rejected(c,collection);
  }
  for(const path of [['products',0,'gallery'],['categories',0,'attributes'],['categories',0,'attributes',0,'values']])for(const bad of [{},{named:'Crna'},null]){
   const c=structuredClone(current.cms);let t=c;for(const p of path.slice(0,-1))t=t[p];t[path.at(-1)]=bad;await rejected(c,path.join('.'));
  }
  for(const [collection,field] of [['products','category'],['products','badge'],['categories','badge'],['badges','applyCategory'],['manuals','relatedProductId'],['manuals','category']]){
   const c=structuredClone(current.cms);c[collection][0][field]=' '+c[collection][0][field].toUpperCase()+' ';await rejected(c,collection+'.0.'+field);
  }
  const changed=structuredClone(current.cms);changed.products[0].id='renamed-id';changed.manuals[0].relatedProductId='renamed-id';await rejected(changed,'products.0.id',[id]);
  const missing=structuredClone(current.cms);delete missing.products[0]._identity;await rejected(missing,'products.0.id');
  for(const bad of [{},{0:id},null,'bad'])await rejected(structuredClone(current.cms),'deletedProductIds',bad);
  const email='s6-'+Date.now()+'@example.invalid',password='Segment six customer 2026!';
  assert.equal((await post(customer,'customer-register',{name:'Reference test',email,acceptedPrivacy:true})).status(),200);await activateCustomer(customer,baseURL,email,password);
  assert.equal((await post(customer,'cart-add',{productId:id,quantity:2})).status(),200);await post(customer,'favorite-toggle',{productId:id});
  for(const width of [320,360,390,768,820,1024,1440])for(const dark of [false,true]){
   const ctx=await browser.newContext({viewport:{width,height:1000},hasTouch:width<=1024,extraHTTPHeaders:{'CF-Connecting-IP':'198.51.100.163'}});
   try{
    await ctx.addInitScript(dark=>localStorage.setItem('onesTheme:admin',dark?'dark':'light'),dark);
    assert.equal((await post(ctx.request,'admin-login',{password:'Segment one admin password 2026!'})).status(),200);
    const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(baseURL+'/admin.html?panel=products');await page.locator('[data-edit-product]').first().click();
    const modal=page.locator('#productEditModal'),identity=modal.getByLabel('ID',{exact:true});
    assert.equal(await identity.inputValue(),id);assert.equal(await identity.evaluate(e=>e.readOnly),true);checks+=2;
    const title='Naziv '+width+' '+dark;await modal.getByLabel('Naziv',{exact:true}).fill(title);
    const color=modal.getByLabel(/^Boja-/);await color.selectOption('Bijela');
    const response=page.waitForResponse(r=>r.url().includes('action=save-cms'));await page.locator('#saveProductCmsBtn').click();assert.equal((await response).status(),200);await page.waitForFunction(()=>!cmsSaving);checks++;
    const saved=(await get(ctx.request,'admin-cms')).cms.products.find(p=>p.id===id);
    assert.equal(saved.name,title);assert.equal(saved.attributes.Boja,'Bijela');assert.equal(saved.specs.Boja,'Bijela');checks+=3;
    const cart=(await get(customer,'cart')).cart;assert.equal(cart.items[0].productId,id);assert.equal(cart.items[0].product.name,title);assert.equal(cart.count,2);checks+=3;
    assert.equal((await get(customer,'customer-profile')).favoriteProducts[0].id,id);checks++;
    await page.locator('#closeProductEditorBtn').click();
    const beforeCount=await page.evaluate(()=>cms.products.length);await page.locator('#addProductBtn').click();
    const newId=await page.locator('#productEditModal').getByLabel('ID',{exact:true}).inputValue();assert.match(newId,/^product-[0-9a-f-]{36}$/);checks++;
    assert.equal(await page.locator('#productEditModal').getByLabel('ID',{exact:true}).evaluate(e=>e.readOnly),true);checks++;
    await page.locator('#deleteProductBtn').click();assert.equal(await page.evaluate(()=>cms.products.length),beforeCount);checks++;
    await page.goto(baseURL+'/product.html?id='+encodeURIComponent(id));await page.waitForFunction(()=>product?.id);
    assert.equal(await page.evaluate(()=>product.id),id);assert.ok((await page.locator('body').textContent()).includes('Povezano uputstvo'));checks+=2;
    assert.deepEqual(errors,[]);checks++;
   }finally{await ctx.close()}
  }
  const pub=(await get(admin,'cms')).cms;assert.equal(JSON.stringify(pub).includes('_identity'),false);checks++;
  const backup=await get(admin,'backup-download');assert.equal(JSON.stringify(backup).includes('_identity'),false);checks++;
  console.log(`Segment 6 HTTP/browser checks: ${checks} (7 widths, 2 themes; containers, references, immutable IDs and attribute persistence)`);
 }finally{await browser.close();await admin.dispose();await customer.dispose()}
})().catch(e=>{console.error(e);process.exitCode=1});
