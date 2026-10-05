const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const {activateCustomer} = require('./mail-helper.cjs');
const {withCartVersion} = require('./cart-helper.cjs');
const baseURL = process.env.ONES_TEST_URL;
if (!baseURL || new URL(baseURL).hostname !== '127.0.0.1' || process.env.ONES_DISPOSABLE_TEST !== '1') throw Error('Disposable loopback fixture required');
let checks = 0;
function ok(value, message) { assert.ok(value, message); checks++; }
async function post(ctx, action, data) {
  const token = await (await ctx.get(baseURL + '/api.php?action=csrf-token')).json();
  const response = await ctx.post(baseURL + '/api.php?action=' + action, {
    data: await withCartVersion(ctx, baseURL, action, data), headers: {'X-CSRF-Token':token.csrfToken},
  });
  assert.equal(response.status(), 200, await response.text());
  return response.json();
}
async function active(page, selector) { return page.evaluate(s => document.activeElement.matches(s), selector); }
async function trap(page, root) {
  const edges = await page.locator(root).evaluate(e => {
    const items = [...e.querySelectorAll('a[href],button,input,select,textarea,[tabindex],[contenteditable="true"]')]
      .filter(x => !x.matches(':disabled') && !x.closest('[hidden],[inert]') && x.getClientRects().length &&
        getComputedStyle(x).visibility !== 'hidden' && (x.tabIndex >= 0 || x.isContentEditable));
    items.forEach((x,i) => x.dataset.testFocusIndex = String(i));
    return [0,items.length-1];
  });
  assert.ok(edges[1] >= 0);
  await page.locator(root + ` [data-test-focus-index="${edges[1]}"]`).focus();
  await page.keyboard.press('Tab');
  ok(await active(page,root+` [data-test-focus-index="${edges[0]}"]`),'Tab wraps inside '+root);
  await page.keyboard.press('Shift+Tab');
  ok(await active(page,root+` [data-test-focus-index="${edges[1]}"]`),'Shift+Tab wraps inside '+root);
}
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const context = await browser.newContext({viewport:{width:1440,height:1000},extraHTTPHeaders:{'CF-Connecting-IP':`198.51.100.${1+Date.now()%200}`}});
  try {
    const email = `focus-${Date.now()}@example.invalid`;
    await post(context.request,'customer-register',{name:'Focus kupac',email,acceptedPrivacy:true});
    await activateCustomer(context.request,baseURL,email,'Focus customer password 2026!');
    const data = await (await context.request.get(baseURL+'/api.php?action=cms')).json();
    await post(context.request,'cart-add',{productId:data.cms.products[0].id,quantity:1});
    await post(context.request,'order-submit',{phone:'061123456',note:'Focus test',acceptedPrivacy:true});
    await post(context.request,'admin-login',{password:'Segment one admin password 2026!'});
    const page = await context.newPage(), errors = [];
    page.on('pageerror',e => errors.push(e.message));
    await page.goto(baseURL+'/admin.html?panel=products');
    await page.locator('[data-edit-product]').first().waitFor();
    const cases = [
      ['products','[data-edit-product]','#productEditModal','#closeProductEditorBtn'],
      ['categories','[data-edit-category]','#categoryEditModal','#closeCategoryEditorBtn'],
      ['orders','[data-order-detail]','#orderDetailModal','#closeOrderDetailBtn'],
      ['customers','[data-customer-detail]','#customerDetailModal','#closeCustomerDetailBtn'],
    ];
    for (const width of [320,390,768,820,920,921,1024,1440]) for (const dark of [false,true]) {
      await page.setViewportSize({width,height:1000});
      await page.evaluate(d => onesTheme.apply(d?'dark':'light'),dark);
      for (const [panel,trigger,root,close] of cases) {
        await page.evaluate(p => activatePanel(p),panel);
        const original = await page.locator(trigger).first().getAttribute(trigger.slice(1,-1));
        await page.locator(trigger).first().click();
        ok(await active(page,close),`${panel}/${width}: initial focus`);
        ok(await page.locator('.admin-shell').evaluate(e=>e.inert),'Background inert');
        await page.evaluate(()=>document.querySelector('[data-theme-toggle]').focus());
        ok(await page.evaluate(s=>document.querySelector(s).contains(document.activeElement),root),'Focus stays inside');
        await trap(page,root);
        await page.keyboard.press('Escape');
        ok(await page.locator(root).count()===0,'Escape closes '+panel);
        ok(await page.evaluate(({trigger,original})=>document.activeElement.matches(trigger) && document.activeElement.getAttribute(trigger.slice(1,-1))===original,{trigger,original}),'Return to same record');
        ok(!await page.locator('.admin-shell').evaluate(e=>e.inert),'Background restored');
        // Pointer close and a second opening must not retain a stale focus scope.
        await page.locator(trigger).first().click(); await page.locator(close).click();
        ok(await active(page,trigger),'Button close restores trigger');
      }
      if (width <= 920) {
        ok(await page.locator('#adminSidebar').evaluate(e=>e.inert&&e.getAttribute('aria-hidden')==='true'),'Closed sidebar unavailable');
        await page.locator('#adminMenuToggle').focus();
        for (let n=0;n<8;n++) { await page.keyboard.press('Tab'); ok(!await page.evaluate(()=>document.querySelector('#adminSidebar').contains(document.activeElement)),'Closed menu absent from Tab order'); }
        await page.locator('#adminMenuToggle').click();
        ok(await active(page,'#adminMenuClose'),'Menu initial focus');
        ok(await page.locator('.admin-main').evaluate(e=>e.inert),'Open menu isolates content');
        ok(await page.locator('#adminSidebar').getAttribute('aria-modal')==='true','Menu dialog semantics');
        await trap(page,'#adminSidebar');
        await page.keyboard.press('Escape');
        ok(await active(page,'#adminMenuToggle'),'Escape returns to menu toggle');
        await page.locator('#adminMenuToggle').click(); await page.locator('#adminMenuClose').click();
        ok(await active(page,'#adminMenuToggle'),'Menu close returns toggle');
        await page.locator('#adminMenuToggle').click();
        await page.locator('#adminMenuBackdrop').click({position:{x:width-2,y:500}});
        ok(await active(page,'#adminMenuToggle'),'Menu backdrop returns toggle');
        await page.locator('#adminMenuToggle').click();
        await page.locator('[data-panel-btn="products"]').click();
        await page.locator('[data-edit-product]').first().waitFor();
        ok(await active(page,'#adminMenuToggle'),'Section selection returns toggle');
        ok(await page.locator('#adminSidebar').evaluate(e=>e.inert),'Selection closes menu');
      } else {
        ok(await page.locator('#adminSidebar').evaluate(e=>!e.inert&&!e.hasAttribute('aria-hidden')&&!e.hasAttribute('aria-modal')),'Desktop navigation accessible');
      }
    }

    // Rerender, nested native confirmation and deleted opener.
    await page.setViewportSize({width:1024,height:1000});
    await page.evaluate(()=>activatePanel('products')); await page.locator('[data-edit-product]').first().click();
    await page.locator('#deleteProductBtn').click();
    ok(await page.locator('#cmsRelationDialog').evaluate(e=>e.contains(document.activeElement)),'Native confirmation receives focus');
    await trap(page,'#cmsRelationDialog'); await page.keyboard.press('Escape');
    await page.locator('#cmsRelationDialog').waitFor({state:'detached'});
    ok(await active(page,'#deleteProductBtn'),'Cancel nested confirmation restores delete trigger');
    ok(await page.locator('#productEditModal').count()===1,'Parent remains open');
    await page.locator('#saveProductCmsBtn').click();
    await page.locator('.admin-toast').filter({hasText:'CMS je sacuvan'}).waitFor();
    ok(await page.locator('#productEditModal').evaluate(e=>e.contains(document.activeElement)),'Save rerender keeps focus in modal');
    await trap(page,'#productEditModal'); await page.keyboard.press('Escape');
    ok(await active(page,'[data-edit-product]'),'Return after save rerender');
    await page.locator('#addProductBtn').click(); await page.locator('#deleteProductBtn').click();
    await page.locator('#cmsRelationDialog button[type="submit"]').click();
    await page.locator('#productEditModal').waitFor({state:'detached'});
    ok(await active(page,'#addProductBtn'),'Deleted newly added product returns to Add');

    await page.evaluate(()=>activatePanel('categories')); await page.locator('[data-edit-category]').first().click();
    await page.locator('.attribute-add-button').click();
    ok(await page.locator('#categoryEditModal').evaluate(e=>e.contains(document.activeElement)),'Adding attribute retains modal focus');
    await page.locator('[data-edit-attribute]').last().click();
    ok(await active(page,'[data-edit-attribute]'),'Attribute toggle focus survives rerender');
    await page.keyboard.press('Escape');
    ok(await active(page,'[data-edit-category]'),'Category return after rerender');

    await page.evaluate(()=>activatePanel('orders')); await page.locator('[data-order-detail]').first().click();
    await page.locator('#orderDetailNote').fill('Unsaved focus draft');
    await page.locator('#orderDetailNote').evaluate(e=>e.setSelectionRange(3,7));
    await page.evaluate(()=>renderOrderDetailModal(Number(document.querySelector('#orderDetailModal').dataset.orderId)));
    ok(await page.locator('#orderDetailNote').evaluate(e=>document.activeElement===e&&e.selectionStart===3&&e.selectionEnd===7),'Draft caret preserved');
    page.once('dialog',d=>d.dismiss()); await page.keyboard.press('Escape');
    ok(await page.locator('#orderDetailModal').evaluate(e=>e.contains(document.activeElement)),'Cancelled unsaved-note close stays trapped');
    page.once('dialog',d=>d.accept()); await page.keyboard.press('Escape');
    ok(await active(page,'[data-order-detail]'),'Accepted unsaved-note close returns trigger');
    await page.locator('[data-order-detail]').first().click();
    await page.locator('#saveOrderDetailNoteBtn').click();
    await page.waitForFunction(()=>!orderMutationPending&&!orderNoteDrafts.size);
    await page.keyboard.press('Escape');

    await page.evaluate(()=>activatePanel('customers')); await page.locator('[data-customer-detail]').first().click();
    await page.locator('[data-customer-order]').first().click(); await page.locator('#orderDetailModal').waitFor();
    ok(await active(page,'#closeOrderDetailBtn'),'Customer to order transition sets new scope');
    await page.keyboard.press('Escape'); ok(await active(page,'[data-order-detail]'),'Transition returns to order list');

    // Crossing the exact drawer breakpoint in both directions, with and without a modal.
    await page.setViewportSize({width:920,height:1000}); await page.locator('#adminMenuToggle').click();
    await page.setViewportSize({width:921,height:1000});
    await page.waitForFunction(()=>!document.body.classList.contains('admin-menu-open'));
    ok(await page.locator('#adminSidebar').evaluate(e=>!e.inert&&!e.hasAttribute('aria-modal')),'Resize releases mobile scope');
    ok(!await page.locator('.admin-main').evaluate(e=>e.inert),'Resize releases content');
    await page.locator('[data-panel-btn="settings"]').focus(); await page.setViewportSize({width:820,height:1000});
    await page.waitForFunction(()=>document.querySelector('#adminSidebar').inert);
    ok(await active(page,'#adminMenuToggle'),'Resize moves focus out of hidden sidebar');
    await page.evaluate(()=>activatePanel('products')); await page.locator('[data-edit-product]').first().click();
    await page.setViewportSize({width:1440,height:1000}); await page.setViewportSize({width:390,height:1000});
    await trap(page,'#productEditModal'); await page.keyboard.press('Escape');
    ok(await page.locator('#adminSidebar').evaluate(e=>e.inert),'Modal resize keeps closed sidebar inert');

    // Logout must remove all private overlays and release the login form.
    await page.locator('[data-edit-product]').first().click();
    await page.evaluate(()=>adminLogout()); await page.locator('#loginPanel').waitFor();
    ok(await active(page,'#passwordInput'),'Logout focuses login');
    ok(!await page.locator('.admin-shell').evaluate(e=>e.inert),'Logout releases background');
    ok(await page.locator('.product-edit-modal').count()===0,'Logout clears overlays');
    assert.deepEqual(errors,[]); checks++;

    const touch = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,storageState:await context.storageState()});
    await post(touch.request,'admin-login',{password:'Segment one admin password 2026!'});
    const mobile = await touch.newPage(); await mobile.goto(baseURL+'/admin.html?panel=products');
    await mobile.locator('[data-edit-product]').first().waitFor();
    await mobile.locator('#adminMenuToggle').tap(); await mobile.locator('#adminMenuClose').tap();
    ok(await active(mobile,'#adminMenuToggle'),'Touch menu close returns focus');
    await mobile.locator('[data-edit-product]').first().tap(); await mobile.locator('#closeProductEditorBtn').tap();
    ok(await active(mobile,'[data-edit-product]'),'Touch modal close returns focus');
    await touch.close();
    console.log(`CMS focus: ${checks} checks; 8 widths x 2 themes, four dialogs, menu, rerenders, native confirmation, draft, resize, logout and touch`);
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
