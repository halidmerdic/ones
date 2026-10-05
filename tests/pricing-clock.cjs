const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let checks=0,offline=false,timerId=0;
const timers=new Map(),events=[];
let clock={date:'2026-10-04',zone:'Europe/Sarajevo',asOf:1791151200,refreshAfterMs:1000};
const window={addEventListener(){},dispatchEvent(e){events.push(e.type)}};
const context=vm.createContext({window,document:{addEventListener(){}},Event,URL,TextEncoder,
 setTimeout(fn,delay){timers.set(++timerId,{fn,delay});return timerId},clearTimeout(id){timers.delete(id)},
 fetch:async()=>{if(offline)throw Error('Offline');return {ok:true,status:200,json:async()=>({ok:true,pricingClock:{...clock}})}}});
vm.runInContext(fs.readFileSync('api-client.js','utf8'),context);
const product={mpcPrice:'100',discountPrice:'90',salePrice:'80',saleUntil:'2026-10-04',effectivePrice:{date:'2026-10-04',type:'sale',label:'80'}};
(async()=>{
 assert.equal(window.onesActivePrice(product).type,'inquiry');checks++;
 await window.onesApi('cms');assert.equal(window.onesActivePrice(product).label,'80');checks++;
 const consumers={};
 for(const [file,name] of [['app.js','activePrice'],['product.js','activePrice'],['cart.js','priceText'],['profile.js','profilePrice']]){
  const match=fs.readFileSync(file,'utf8').match(new RegExp('function '+name+'\\(product\\) \\{[\\s\\S]*?\\n\\}'))[0];
  consumers[file]=vm.runInContext('('+match+')',context);
 }
 function allPrices(price){for(const [file,fn] of Object.entries(consumers)){const result=fn(product);assert.equal(typeof result==='object'?result.label:result,price+(file==='profile.js'?' KM':''),file);checks++}}
 allPrices('80');
 clock={...clock,date:'2026-10-05',asOf:clock.asOf+1,refreshAfterMs:86400000};
 const timer=[...timers.values()].at(-1);assert.equal(timer.delay,1000);checks++;
 await timer.fn();allPrices('90');
 clock={...clock,date:'2026-10-04',asOf:clock.asOf-10};await window.onesApi('cms');allPrices('90');
 // At the next expiry, failed clock refresh must not prolong yesterday's sale.
 offline=true;await [...timers.values()].at(-1).fn();
 assert.equal(window.onesActivePrice(product).type,'inquiry');assert.equal([...timers.values()].at(-1).delay,30000);checks+=2;
 offline=false;clock={date:'2026-10-05',zone:'Europe/Sarajevo',asOf:1791151202,refreshAfterMs:1000};
 await [...timers.values()].at(-1).fn();allPrices('90');
 assert.ok(events.includes('ones-pricing-date'));checks++;
 console.log('Pricing clock: '+checks+' checks (midnight timer, stale response, offline recovery, four price consumers)');
})().catch(e=>{console.error(e);process.exitCode=1});
