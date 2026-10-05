const {chromium}=require('playwright'),assert=require('node:assert/strict');
const baseURL=process.env.ONES_TEST_URL;
if(!baseURL||process.env.ONES_DISPOSABLE_TEST!=='1'||new URL(baseURL).hostname!=='127.0.0.1')throw Error('Disposable loopback server required');
let checks=0;
async function get(c,a){const r=await c.get(baseURL+'/api.php?action='+a);assert.equal(r.status(),200,await r.text());return r.json()}
async function post(c,a,data){const r=await c.post(baseURL+'/api.php?action='+a,{data,headers:{'X-CSRF-Token':(await get(c,'csrf-token')).csrfToken}});assert.equal(r.status(),200,await r.text());return r.json()}
async function save(page){const pending=page.waitForResponse(r=>r.url().includes('action=save-cms'));await page.locator('#saveBtn').click();const r=await pending;assert.equal(r.status(),200,await r.text());await page.waitForFunction(()=>!cmsSaving);checks++}
async function removeCategory(page,to){await page.locator('#deleteCategoryBtn').click();await page.locator('#cmsRelationTarget').selectOption(to);await page.locator('#cmsRelationDialog button[type=submit]').click();await page.locator('#cmsRelationDialog').waitFor({state:'detached'});}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const width of [320,820,1440]) {
  const ctx=await browser.newContext({viewport:{width,height:1000},hasTouch:width<=1024});
  await post(ctx.request,'admin-login',{password:'Segment one admin password 2026!'});
  let current=await get(ctx.request,'admin-cms');current=await post(ctx.request,'reset-cms',{revision:current.revision});
  const cms=current.cms,id=cms.products[0].id,[a,b,c]=cms.categories.map(x=>x.name),badge=cms.badges[1].name;
  cms.products[0].badge=badge;cms.categories[2].badge=badge;cms.categories[2].badgeUntil='2030-01-01';cms.badges[1].applyCategory=a;
  cms.manuals=[{title:'Chain manual',relatedProductId:id,category:a,visibility:'Javno',file:'assets/ones-logo.webp'}];
  await post(ctx.request,'save-cms',{cms,revision:current.revision});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(baseURL+'/admin.html?panel=categories');
  await page.locator('[data-edit-category="0"]').click();await page.locator('#categoryEditModal').getByLabel('Naziv',{exact:true}).fill('Temporary name');await removeCategory(page,b);
  await page.locator('[data-edit-category="0"]').click();await removeCategory(page,c);
  await page.locator('[data-edit-category="0"]').click();const categoryName=page.locator('#categoryEditModal').getByLabel('Naziv',{exact:true});await categoryName.fill('');await categoryName.pressSequentially('Final destination');assert.equal(await categoryName.inputValue(),'Final destination');checks++;await page.keyboard.press('Escape');await page.locator('#categoryEditModal').waitFor({state:'detached'});
  const payloads=[];page.on('request',r=>{if(r.url().includes('action=save-cms'))payloads.push(r.postDataJSON())});
  await save(page);
  assert.deepEqual(payloads[0].referenceChanges.categories,[{from:a,to:'Final destination'},{from:b,to:'Final destination'}]);checks++;
  current=await get(ctx.request,'admin-cms');assert.deepEqual(current.cms.categories.map(c=>c.name),['Final destination']);
  assert.equal(current.cms.products[0].category,'Final destination');assert.equal(current.cms.manuals[0].category,'Final destination');assert.equal(current.cms.badges[1].applyCategory,'Final destination');assert.equal(current.cms.products[0].id,id);checks+=5;
  await page.locator('[data-edit-category="0"]').click();const before=await page.evaluate(()=>JSON.stringify(cms));await page.locator('#deleteCategoryBtn').click();
  assert.equal(await page.locator('#cmsRelationDialog').count(),0);assert.equal(await page.evaluate(()=>JSON.stringify(cms)),before);assert.ok((await page.locator('.admin-toast').allTextContents()).some(t=>t.includes('zamjensku kategoriju')));checks+=3;
  await page.locator('#closeCategoryEditorBtn').click();await page.goto(baseURL+'/admin.html?panel=badges');
  const card=page.locator('[data-panel="badges"] .admin-card').filter({has:page.getByRole('heading',{name:badge,exact:true})}),name=card.getByLabel('Naziv badgea',{exact:true});
  await name.fill('Temporary badge');await name.press('Tab');await name.fill('Final badge');
  assert.equal(await page.locator('#saveBtn').evaluate(e=>e.classList.contains('has-unsaved')),true);checks++;
  const pending=page.waitForResponse(r=>r.url().includes('action=save-cms'));await page.evaluate(()=>saveCms());assert.equal((await pending).status(),200);await page.waitForFunction(()=>!cmsSaving);checks++;
  current=await get(ctx.request,'admin-cms');assert.equal(current.cms.products[0].badge,'Final badge');assert.equal(current.cms.categories[0].badge,'Final badge');assert.equal(current.cms.categories[0].badgeUntil,'2030-01-01');checks+=3;
  const finalCard=page.locator('[data-panel="badges"] .admin-card').filter({has:page.getByRole('heading',{name:'Final badge',exact:true})});
  await finalCard.getByLabel('Naziv badgea',{exact:true}).fill('');assert.equal(await finalCard.getByLabel('Naziv badgea',{exact:true}).getAttribute('aria-invalid'),'true');
  assert.equal(await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented}),true);checks+=2;
  await finalCard.getByLabel('Naziv badgea',{exact:true}).fill('Final badge');
  assert.deepEqual(errors,[]);checks++;await ctx.close();
  }
  console.log(`Draft relation chain checks: ${checks} (320/820/1440; chained edits, typing spaces, pending names, last-category guard)`);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
