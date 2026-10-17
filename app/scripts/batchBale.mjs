import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { findChromium, start } from './browserKit.mjs';
import { findWrappedText, zoomText } from './textAudit.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const out=path.join(root,'docs/screenshots/batch-bale');
fs.mkdirSync(out,{recursive:true});
const api='http://localhost:14002/api/v1';
const mock=start('mock',['run','start','-w','@ecocycle/mock-server'],root,{PORT:'14002',CORS_ORIGINS:'http://localhost:15202'},'[mock-server]');
const app=start('app',['run','dev','-w','@ecocycle/app','--','--port','15202','--strictPort'],root,{VITE_API_BASE:api,VITE_WS_BASE:'ws://localhost:14002/ws/v1/stream',VITE_USE_MOCK:'true'},'Local:');
let browser;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try {
 await Promise.all([mock.ready,app.ready]);
 const login=async(role)=>(await (await fetch(`${api}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:role,password:`mock-${role}`})})).json()).accessToken;
 const token=await login('admin');
 const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
 const get=async(p)=>{const r=await fetch(api+p,{headers});assert.equal(r.status,200,p);return r.json();};
 const post=async(body,key=crypto.randomUUID(),auth=headers)=>fetch(`${api}/devices/compressor-1/commands`,{method:'POST',headers:{...auth,'Idempotency-Key':key},body:JSON.stringify(body)});
 const command=async(body,expected='completed')=>{
   const r=await post({...body,confirm:true});assert.equal(r.status,202);const accepted=await r.json();
   let result;for(let i=0;i<40;i++){result=await get(`/commands/${accepted.commandId}`);if(result.status!=='accepted')break;await pause(100);}
   assert.equal(result.status,expected,JSON.stringify(result));return result;
 };
 let state;for(let i=0;i<60;i++){state=await get('/batches/control');if(state.current && state.next)break;await pause(200);}
 assert.ok(state.current && state.next);
 const batchId=state.current.batch.id;
 await command({type:'pause_batch',batchId});
 await command({type:'pause_batch',batchId},'rejected');
 // A paused current batch keeps the planned next batch editable.
 const nextId=state.next.batch.id;
 const mix=[{sectorId:'tank-a1',percent:40},{sectorId:'tank-a2',percent:30},{sectorId:'tank-b1',percent:20},{sectorId:'tank-b2',percent:10}];
 await command({type:'set_batch_mix',batchId:nextId,mix});
 await command({type:'set_batch_mix',batchId:nextId,mix:[{sectorId:'tank-a1',percent:99}]},'rejected');
 await command({type:'set_batch_pressure',batchId:nextId,targetPressureMpa:29});
 await command({type:'set_batch_pressure',batchId:nextId,targetPressureMpa:100},'rejected');
 await command({type:'resume_batch',batchId:nextId},'rejected');
 assert.equal((await post({type:'skip_batch',batchId:nextId,confirm:true,reason:' '})).status,422);
 assert.equal((await post({type:'pause_batch',batchId})).status,422);
 for(const role of ['operator','viewer']){
   const forbiddenHeaders={...headers,Authorization:`Bearer ${await login(role)}`};
   for(const type of ['set_batch_mix','set_batch_pressure','pause_batch','resume_batch','skip_batch']) assert.equal((await post({type,batchId,confirm:true},crypto.randomUUID(),forbiddenHeaders)).status,403);
 }
 const idem=crypto.randomUUID();const body={type:'set_batch_pressure',batchId:nextId,targetPressureMpa:28.5,confirm:true};
 const a=await (await post(body,idem)).json();const b=await (await post(body,idem)).json();assert.equal(a.commandId,b.commandId);
 assert.equal((await post({...body,targetPressureMpa:28},idem)).status,422);
 await pause(1400);
 state=await get('/batches/control');assert.equal(state.next.batch.targetPressureMpa,28.5);assert.deepEqual(state.next.batch.mix,mix);
 browser=await chromium.launch({executablePath:findChromium(),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const go=async(page,route)=>{await page.evaluate(r=>{history.pushState({},'',r);dispatchEvent(new PopStateEvent('popstate'));},route);};
 const audit=async(page,name,zoom)=>{
   if(zoom!==1)await page.evaluate(zoomText,zoom);
   const wrapped=await page.evaluate(findWrappedText);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
   if(wrapped.length||overflow){await page.screenshot({path:path.join(out,`failure-${name}.png`)});throw Error(JSON.stringify({name,wrapped,overflow}));}
 };
 for(const [width,height] of [[390,844],[820,1180]]){
  for(const zoom of [1,1.3]){
   const context=await browser.newContext({viewport:{width,height},locale:'ko-KR',timezoneId:'Asia/Seoul'});
   await context.addInitScript(()=>localStorage.setItem('ecocycle.homeMode','dashboard'));
   const page=await context.newPage();await page.goto('http://localhost:15202/login');
   await page.getByLabel('아이디').fill('admin');await page.getByLabel('비밀번호').fill('1234');await page.getByRole('button',{name:'로그인'}).click();await page.waitForURL(u=>u.pathname==='/');
   await go(page,'/records/batches');await page.getByLabel('A1 (%)',{exact:true}).waitFor();await pause(400);
   const shot=async(name)=>{await audit(page,`${width}-${zoom}-${name}`,zoom);if(zoom===1)await page.screenshot({path:path.join(out,`${width}x${height}-${name}.png`)});};
   await shot('1-current');
   await page.getByRole('button',{name:'다음 배치',exact:true}).click();
   await page.getByLabel('A1 (%)',{exact:true}).fill('10');
   await page.getByRole('region',{name:'수동 제어',exact:true}).evaluate(el=>el.scrollIntoView({block:'start'}));await shot('2-mix-validation');
   assert.equal(await page.getByRole('button',{name:'배합 변경',exact:true}).isDisabled(),true);
   await page.getByLabel('A1 (%)',{exact:true}).fill('40');
   await page.getByRole('button',{name:'배합 변경',exact:true}).click();await shot('3-confirm');
   await page.getByRole('button',{name:'취소',exact:true}).click();
   await page.getByRole('region',{name:'배치·베일 사건 기록',exact:true}).first().evaluate(el=>el.scrollIntoView({block:'start'}));await pause(300);await shot('4-records');
   // 실제 화면의 승인·거부 결과 및 확정값 비낙관 갱신.
   if(width===390 && zoom===1){
     await page.getByLabel('목표 압력 (MPa)',{exact:true}).fill('28');
     await page.getByRole('button',{name:'압력 변경',exact:true}).click();
     const reply=page.waitForResponse(r=>r.url().includes('/commands') && r.request().method()==='POST');
     await page.getByRole('dialog').getByRole('button',{name:'확인',exact:true}).click();await reply;
     assert.ok((await page.getByText('서버 확정 목표: 28.5 MPa',{exact:true}).count())>0);
     await page.getByText('압력 변경 · 적용됨',{exact:true}).waitFor();
     await page.getByText('서버 확정 목표: 28 MPa',{exact:true}).waitFor();
     await page.getByRole('button',{name:'현재 배치',exact:true}).click();
     await page.getByRole('button',{name:'배치 재개',exact:true}).click();
     await page.getByRole('dialog').getByRole('button',{name:'확인',exact:true}).click();
     await page.getByText('배치 재개 · 적용됨',{exact:true}).waitFor();
     await command({type:'pause_batch',batchId});
   }
   const bale=(await get('/process/state')).bales[0];assert.ok(bale);
   await go(page,`/records/bales/${bale.id}`);await page.getByText('베일 상세',{exact:true}).waitFor();await shot('5-bale-detail');
   await context.close();
  }
 }
 await command({type:'skip_batch',batchId:nextId,reason:'품질 재점검'});
 await command({type:'resume_batch',batchId});
 const end=Date.now()+1000;
 const events=await get(`/batches/events/records?from=${new Date(end-86400000).toISOString()}&to=${new Date(end).toISOString()}&page=1&pageSize=10`);
 for(const type of ['mix_changed','pressure_changed','paused','resumed','skipped']) assert.ok(events.items.some(e=>e.type===type),type);
 console.log('PASS: command acceptance/rejection, permissions, confirmation, idempotency, persisted snapshots, events; 2 sizes × 2 text scales.');
 fs.writeFileSync(path.join(out,'validation.txt'),'PASS: 390×844, 820×1180; text 100%, 130%; commands, permissions, idempotency, events.\n');
} finally {await browser?.close();app.stop();mock.stop();}
