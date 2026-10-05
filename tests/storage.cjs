const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('storage.js','utf8');
let checks=0;
function setup(){
 const flags={};const data=new Map();
 const native={getItem(k){if(flags.get)throw Error('denied');return data.get(k)??null;},setItem(k,v){if(flags.set)throw Error('quota');data.set(k,String(v));},removeItem(k){if(flags.remove)throw Error('denied');data.delete(k);},key(i){if(flags.key)throw Error('denied');return [...data.keys()][i]??null;},get length(){if(flags.length)throw Error('denied');return data.size;}};
 const window={location:{pathname:'/index.html'},matchMedia:()=>({matches:false})};
 for(const name of ['localStorage','sessionStorage'])Object.defineProperty(window,name,{get(){if(flags.property)throw Error('SecurityError');return native;}});
 vm.runInNewContext(source,{window});return {window,store:window.onesStorage.local,flags,data};
}
for(const mode of ['property','get','set','remove','key','length']){
 const {store,flags,data}=setup();store.setItem('cart','3');flags[mode]=true;
 assert.doesNotThrow(()=>{store.getItem('cart');store.setItem('cart','4');store.keys();store.removeItem('cart');store.keys();});checks++;
 assert.equal(store.getItem('cart'),null);checks++;
 flags[mode]=false;assert.equal(store.getItem('cart'),null);assert.equal(data.has('cart'),false);checks+=2;
 store.setItem('cart','5');assert.equal(data.get('cart'),'5');checks++;
}
{
 const {store,flags,data}=setup();store.setItem('theme','light');flags.set=true;store.setItem('theme','dark');
 assert.equal(store.getItem('theme'),'dark');assert.equal(data.get('theme'),'light');checks+=2;
 flags.set=false;assert.equal(store.getItem('theme'),'dark');assert.equal(data.get('theme'),'dark');checks+=2;
 data.set('theme','light');assert.equal(store.getItem('theme'),'light');checks++;
 flags.get=true;assert.equal(store.getItem('theme'),'light');checks++;
}
{
 const {window,store,flags,data}=setup();data.set('onesTheme:customer:test@example.invalid','dark');data.set('onesTheme:store:last','light');data.set('unrelated','keep');
 flags.remove=true;window.onesCleanLegacyStorage();assert.equal(store.getItem('onesTheme:customer:test@example.invalid'),null);checks++;
 flags.remove=false;window.onesCleanLegacyStorage();assert.equal(data.has('onesTheme:customer:test@example.invalid'),false);checks++;
 assert.equal(data.get('unrelated'),'keep');assert.equal(window.onesStoredTheme(),'light');checks+=2;
 data.set('onesTheme:customer:old@example.invalid','dark');flags.length=true;assert.doesNotThrow(()=>window.onesCleanLegacyStorage());checks++;
 flags.length=false;window.onesCleanLegacyStorage();assert.equal(data.has('onesTheme:customer:old@example.invalid'),false);checks++;
 window.location.pathname='/admin.html';store.setItem('onesTheme:admin','dark');assert.equal(window.onesStoredTheme(),'dark');checks++;
}
// No runtime consumer can bypass the wrapper. Historical deployment folders are excluded.
const html=['index','admin','blog','cart','login','privacy','product','profile','terms','verify'];
for(const page of html){const s=fs.readFileSync(page+'.html','utf8');assert.ok(s.indexOf('storage.js?')<s.indexOf('theme.js?'));assert.ok(!/\b(localStorage|sessionStorage)\./.test(s));checks+=2;}
for(const file of ['admin','app','api-client','blog','cart','login','product','profile','theme']){assert.ok(!/\b(localStorage|sessionStorage)\./.test(fs.readFileSync(file+'.js','utf8')));checks++;}
console.log(`Storage: ${checks} checks (denied getters/methods/enumeration, quota, stale removal, recovery, migration and consumer coverage)`);
