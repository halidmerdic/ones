const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const baseURL = process.env.ONES_TEST_URL;
if (!baseURL || new URL(baseURL).hostname !== '127.0.0.1' || process.env.ONES_DISPOSABLE_TEST !== '1') throw Error('Disposable loopback fixture required');
let checks=0;
function ok(value,message) { assert.ok(value,message);checks++; }
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    const cdp=await page.context().newCDPSession(page);
    const accessibleNodes=async()=> (await cdp.send('Accessibility.getFullAXTree')).nodes.filter(node=>!node.ignored);
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(baseURL+'/admin.html?panel=products');
    await page.locator('#passwordInput').fill('Segment one admin password 2026!'); await page.locator('#loginBtn').click();
    await page.locator('[data-edit-product]').first().waitFor();
    const productId=await page.locator('[data-edit-product]').first().getAttribute('data-edit-product');
    await page.goto(baseURL+'/admin.html?panel=products&product='+encodeURIComponent(productId));
    await page.locator('#productEditModal').waitFor();
    ok(await page.locator('#closeProductEditorBtn').evaluate(e=>e===document.activeElement),'Deep link initial focus');
    await page.keyboard.press('Escape');
    ok(await page.locator(`[data-edit-product="${productId}"]`).evaluate(e=>e===document.activeElement),'Deep link return to product row');
    for (const [panel,trigger,root] of [
      ['products','[data-edit-product]','#productEditModal'],['categories','[data-edit-category]','#categoryEditModal'],
      ['orders','[data-order-detail]','#orderDetailModal'],['customers','[data-customer-detail]','#customerDetailModal'],
    ]) {
      await page.evaluate(p=>activatePanel(p),panel); await page.locator(trigger).first().click();
      await page.locator(root).click({position:{x:1,y:1}});
      ok(await page.locator(root).count()===0,'Backdrop closes '+panel);
      ok(await page.evaluate(s=>document.activeElement.matches(s),trigger),'Backdrop returns trigger '+panel);
    }

    await page.evaluate(()=>activatePanel('products')); await page.locator('[data-edit-product]').first().click();
    await page.route('**/api.php?action=save-cms',route=>route.fulfill({status:500,contentType:'application/json',body:'{"ok":false,"message":"Test failure"}'}));
    await page.locator('#saveProductCmsBtn').click(); await page.waitForFunction(()=>!cmsSaving);
    ok(await page.locator('#productEditModal').evaluate(e=>!e.inert&&e.contains(document.activeElement)),'Failed save unlocks and retains focus');
    await page.unroute('**/api.php?action=save-cms');
    await page.evaluate(()=>{const x=document.createElement('button');x.id='lateBackgroundButton';x.textContent='Background';document.body.append(x);});
    await page.waitForFunction(()=>document.querySelector('#lateBackgroundButton').inert);
    ok(await page.locator('#lateBackgroundButton').evaluate(e=>e.inert),'New background nodes isolated');
    await page.keyboard.press('Escape');
    ok(!await page.locator('#lateBackgroundButton').evaluate(e=>e.inert),'New background restored');
    await page.locator('#lateBackgroundButton').evaluate(e=>e.remove());

    // Deletion removes the original opener; a visible Add control is the fallback.
    await page.locator('[data-edit-product]').last().click(); await page.locator('#deleteProductBtn').click();
    await page.locator('#cmsRelationDialog button[type="submit"]').click();
    await page.locator('#productEditModal').waitFor({state:'detached'});
    ok(await page.locator('#addProductBtn').evaluate(e=>e===document.activeElement),'Deleted record fallback');
    await page.evaluate(()=>activatePanel('categories')); await page.locator('[data-edit-category]').first().click();
    const duplicate=await page.evaluate(()=>cms.categories[1].name);
    await page.locator('#categoryEditBody input[data-cms-entity-name]').fill(duplicate);
    await page.keyboard.press('Escape');
    ok(await page.locator('#categoryEditModal').evaluate(e=>e.contains(document.activeElement)),'Rejected duplicate name keeps focus inside category');
    await page.locator('#categoryEditBody input[data-cms-entity-name]').fill(await page.evaluate(()=>cms.categories[0].name));
    await page.keyboard.press('Escape');
    // Discard this suite's local deletion before the visual checks (fixtures may have only one product).
    await page.evaluate(()=>loadCms());

    for (const width of [390,820,1440]) for (const dark of [false,true]) {
      await page.setViewportSize({width,height:1000}); await page.evaluate(d=>onesTheme.apply(d?'dark':'light'),dark);
      await page.evaluate(()=>activatePanel('products'));
      if (width<=920) {
        const closedTree=await accessibleNodes();
        ok(!closedTree.some(n=>n.role?.value==='button'&&n.name?.value==='Postavke'),'Closed drawer absent from accessibility tree');
        await page.locator('#adminMenuToggle').click();
        await page.waitForFunction(()=>Math.abs(document.querySelector('#adminSidebar').getBoundingClientRect().x)<1);
        const openTree=await accessibleNodes();
        ok(openTree.some(n=>n.role?.value==='dialog'&&n.name?.value==='CMS meni') &&
          !openTree.some(n=>n.role?.value==='button'&&n.name?.value.startsWith('Sačuvaj')),'Drawer exposes itself and excludes background');
        await page.keyboard.press('Tab');
        if(process.env.ONES_TEST_SCREENSHOTS&&width===390) {
          fs.mkdirSync(process.env.ONES_TEST_SCREENSHOTS,{recursive:true});
          await page.screenshot({path:path.join(process.env.ONES_TEST_SCREENSHOTS,`menu-${width}-${dark?'dark':'light'}.png`)});
        }
        await page.keyboard.press('Escape');
      }
      await page.locator('[data-edit-product]').first().click();
      const tree=await accessibleNodes();
      ok(tree.some(n=>n.role?.value==='dialog'&&n.name?.value==='Uredi proizvod')&&
        !tree.some(n=>n.role?.value==='navigation'&&n.name?.value==='CMS sekcije'),`Modal accessibility tree excludes navigation (${width}/${dark})`);
      await page.keyboard.press('Shift+Tab');
      if(process.env.ONES_TEST_SCREENSHOTS&&width!==390) {
        fs.mkdirSync(process.env.ONES_TEST_SCREENSHOTS,{recursive:true});
        await page.screenshot({path:path.join(process.env.ONES_TEST_SCREENSHOTS,`modal-${width}-${dark?'dark':'light'}.png`)});
      }
      await page.keyboard.press('Escape');
    }
    assert.deepEqual(errors,[]);checks++;
    console.log(`CMS focus edges: ${checks} checks (deep link, backdrop, failed save, DOM changes, deletion, validation and accessibility tree)`);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
