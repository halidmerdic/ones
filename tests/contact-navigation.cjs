const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const window={location:{href:'https://ones.ba/login.html'},addEventListener(){},dispatchEvent(){}};
const context=vm.createContext({window,URL,URLSearchParams,TextEncoder,Event,setTimeout(){},clearTimeout(){}});
vm.runInContext(fs.readFileSync('api-client.js','utf8'),context);
const cases=JSON.parse(fs.readFileSync('tests/phone-cases.json','utf8'));
let checks=0;
const results=cases.map(([value,expected])=>{assert.equal(window.onesPhone(value),expected);checks++;return window.onesPhone(value);});
const php=process.env.PHP_BINARY||'php';
assert.deepEqual(results,JSON.parse(execFileSync(php,['tests/phone.php','--json'],{encoding:'utf8'})));checks++;
for(const value of [null,[],{},123]){assert.equal(window.onesPhone(value),'');checks++;}
assert.equal(window.onesPhoneUrl('061 123 456','whatsapp','a & b'),'https://wa.me/38761123456?text=a%20%26%20b');checks++;
assert.equal(window.onesPhoneUrl('0038761123456','viber','ž'),'viber://chat?number=%2B38761123456&text=%C5%BE');checks++;
assert.equal(window.onesPhoneUrl('invalid','whatsapp'),'');checks++;
for(const root of ['https://ones.ba/','https://ones.ba/shop/']) {
 window.location.href=root+'login.html';
 for(const input of ['cart.html','./cart.html?x=1#upit',root+'product.html?id=a%2Fb#details',root,root+'index.html']) {
  assert.equal(window.onesSafeReturnUrl(input),new URL(input,root).href);checks++;
 }
 for(const input of ['https://evil.invalid/cart.html','//evil.invalid/cart.html','javascript:alert(1)','data:text/html,test','https://user:pass@ones.ba/cart.html',root+'//evil.invalid','login.html?next=login.html','verify.html#token=test','api.php?action=customer-logout','admin.html','%2f%2fevil.invalid','\\\\evil.invalid/cart.html']) {
  assert.equal(window.onesSafeReturnUrl(input),root,input);checks++;
 }
 const login=new URL(window.onesLoginUrl('product.html?id=f3#details',true));
 assert.equal(login.pathname,new URL(root).pathname+'login.html');checks++;
 assert.equal(login.searchParams.get('next'),root+'product.html?id=f3&cartPending=1#details');checks++;
}
console.log(`Contact/navigation: ${checks} checks (PHP/JS phone parity, channel encoding, redirect allowlist, subdirectory and pending cart)`);
