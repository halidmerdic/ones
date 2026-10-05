const {chromium,request}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {activateCustomer}=require('./mail-helper.cjs'),{withCartVersion}=require('./cart-helper.cjs');
const baseURL=process.env.ONES_TEST_URL;
if(!baseURL||new URL(baseURL).hostname!=='127.0.0.1'||process.env.ONES_DISPOSABLE_TEST!=='1')throw Error('Disposable loopback required');
let checks=0;
async function get(c,a){return(await c.get(baseURL+'/api.php?action='+a)).json();}
async function post(c,a,data){data=await withCartVersion(c,baseURL,a,data);const r=await c.post(baseURL+'/api.php?action='+a,{data,headers:{'X-CSRF-Token':(await get(c,'csrf-token')).csrfToken}});assert.equal(r.status(),200,await r.text());return r.json();}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),admin=await request.newContext();
 const failures=[];
 try{
  await post(admin,'admin-login',{password:'Segment one admin password 2026!'});
  let state=await get(admin,'admin-cms');await post(admin,'reset-cms',{revision:state.revision});state=await get(admin,'admin-cms');
  state.cms.products[0].name='DugačakNaziv'.repeat(10);await post(admin,'save-cms',{cms:state.cms,revision:state.revision});
  const c=await browser.newContext({viewport:{width:1024,height:900},hasTouch:true});
  const email='tablet-'+Date.now()+'@example.invalid';
  await post(c.request,'customer-register',{name:'Tablet kupac',email,acceptedPrivacy:true});await activateCustomer(c.request,baseURL,email,'Tablet customer password 2026!');
  await post(c.request,'cart-add',{productId:state.cms.products[0].id,quantity:1});await post(c.request,'order-submit',{phone:'061123456',note:'DugaNapomena'.repeat(30)});
  await post(c.request,'admin-login',{password:'Segment one admin password 2026!'});
  const page=await c.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/admin-responsive.css*',r=>r.fulfill({contentType:'text/css',body:''}));
  await page.goto(baseURL+'/admin.html?panel=products');await page.locator('[data-edit-product]').first().waitFor();
  const before=await page.evaluate(()=>document.documentElement.scrollWidth);assert.ok(before>1024,'Baseline must reproduce overflow');checks++;
  console.log('Baseline without responsive fix: 1024 viewport / '+before+' scrollWidth');
  await page.unroute('**/admin-responsive.css*');await page.reload();await page.locator('[data-edit-product]').first().waitFor();
  const widths=[320,360,390,640,768,820,920,921,1024,1100,1200,1201,1280,1366,1440,1920];
  for(const width of widths)for(const dark of [false,true]){
   await page.setViewportSize({width,height:1000});await page.evaluate(dark=>onesTheme.apply(dark?'dark':'light'),dark);
   const panels=await page.evaluate(()=>Array.from(document.querySelectorAll('[data-panel-btn]'),e=>e.dataset.panelBtn));
   for(const panel of panels){
    await page.evaluate(key=>activatePanel(key),panel);
    const dimensions=await page.evaluate(()=>{
     const main=document.querySelector('.admin-main'),panel=document.querySelector('.admin-panel:not([hidden])');
     const out=[...panel.querySelectorAll('*')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left< -1);}).slice(0,5).map(e=>({tag:e.tagName,cls:e.className,id:e.id}));
     return{width:innerWidth,doc:document.documentElement.scrollWidth,main:main.scrollWidth,panel:panel.scrollWidth,client:panel.clientWidth,out};
    });
    if(dimensions.doc>width+1||dimensions.panel>dimensions.client+1||dimensions.out.length)failures.push({width,dark,panel,...dimensions});
    checks++;
   }
   await page.evaluate(()=>activatePanel('products'));
   // Every product action is within horizontal bounds and remains clickable.
   await page.locator('[data-edit-product]').first().click();await page.locator('#productEditModal').waitFor();checks++;
   const modalFits=await page.locator('.product-edit-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1);
   if(!modalFits)failures.push({width,dark,panel:'product-modal'});
   await page.locator('#closeProductEditorBtn').click();
   if([320,1024,1440].includes(width)&&process.env.ONES_TEST_SCREENSHOTS)await page.screenshot({path:path.join(process.env.ONES_TEST_SCREENSHOTS,`admin-products-${width}-${dark?'dark':'light'}.png`)});
  }
  assert.deepEqual(errors,[]);checks++;
  if(failures.length){console.log(JSON.stringify(failures,null,2));throw Error(failures.length+' layout failures');}
  console.log(`Segment 10 layout: ${checks} checks (16 widths, both themes, all CMS panels, product actions/modals, 640 CSS px zoom-equivalent viewport)`);
 }finally{await admin.dispose();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
