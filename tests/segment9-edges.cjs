const {chromium,request}=require('playwright');const assert=require('node:assert/strict');
const baseURL=process.env.ONES_TEST_URL;
if(!baseURL||new URL(baseURL).hostname!=='127.0.0.1'||process.env.ONES_DISPOSABLE_TEST!=='1')throw Error('Disposable fixture required');
let checks=0;
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api.php?action=customer-status',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,loggedIn:true,user:{name:'Navigation test'}})}));
  // An unexpected external navigation fails locally; no remote endpoint is contacted.
  let external=0;await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname.endsWith('.invalid')){external++;return r.abort();}return r.fallback();});
  for(const next of ['https://evil.invalid/','//evil.invalid/','javascript:alert(1)',baseURL+'//evil.invalid/',baseURL+'/login.html?next=login.html',baseURL+'/api.php?action=customer-logout',baseURL.replace('://','://user:password@')+'/cart.html']){
   await page.goto(baseURL+'/login.html?next='+encodeURIComponent(next));await page.waitForURL(baseURL+'/');checks++;
  }
  assert.equal(external,0);checks++;
  await page.goto(baseURL+'/login.html?next='+encodeURIComponent('/product.html?id=scooter-f3&x=1#details'));
  await page.waitForURL(baseURL+'/product.html?id=scooter-f3&x=1#details');checks++;
  // Legacy invalid contact data must not create an empty href or a malformed conversation URL.
  const c=await request.newContext();const publicCms=(await(await c.get(baseURL+'/api.php?action=cms')).json()).cms;
  const visible={...publicCms,contact:{...publicCms.contact,whatsapp:'invalid',viber:'++123'},products:[{id:'safe-product',name:'Test proizvod',category:'Test',badge:'-',specs:{},gallery:[]}],categories:[{name:'Test'}]};
  await page.route('**/api.php?action=cms',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,cms:visible})}));
  await page.goto(baseURL+'/product.html?id=safe-product');await page.locator('#detailInquiryBtn').click();
  assert.equal(await page.locator('#inquiryModal a[href^="https://wa.me/"]').count(),0);assert.equal(await page.locator('#inquiryModal a[href^="viber://"]').count(),0);checks+=2;
  assert.equal(await page.locator('#inquiryModal a[hidden]').count(),2);assert.equal(await page.locator('#inquiryModal a[href^="mailto:"]').isVisible(),true);checks+=2;
  await page.goto(baseURL+'/');await page.waitForFunction(()=>cms.contact.whatsapp==='invalid');
  assert.equal(await page.locator('#whatsappBottom').isHidden(),true);assert.equal(await page.locator('#viberBottom').isHidden(),true);checks+=2;
  assert.deepEqual(errors,[]);checks++;await c.dispose();
  console.log(`Segment 9 edges: ${checks} checks (real browser redirects, invalid legacy contacts, no external navigation)`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
