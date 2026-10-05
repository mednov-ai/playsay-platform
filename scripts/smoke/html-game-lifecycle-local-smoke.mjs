import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const web=path.join(repo,'frontend/web-app');
const requireWeb=createRequire(path.join(repo,'frontend/package.json'));
const requireCollab=createRequire(path.join(repo,'collaboration-service/package.json'));
const tools=createRequire(path.join(process.env.PLAYWRIGHT_PACKAGE_DIR || path.join(os.homedir(),'.codex/tools/playwright'),'package.json'));
const {chromium,webkit}=tools('playwright');
const {SignJWT}=await import(pathToFileURL(requireCollab.resolve('jose')).href);
const secret='synthetic-local-game-lifecycle-secret-123456789';
const saved=new Map();
const api=http.createServer(async(req,res)=>{
 const key=req.url;
 if(req.method==='GET') { const snapshot=saved.get(key);res.writeHead(snapshot?200:404,{'content-type':'application/json'});res.end(JSON.stringify(snapshot?{snapshot}:{})); }
 else {let body='';for await(const chunk of req)body+=chunk;try{saved.set(key,JSON.parse(body).snapshot);}catch{}res.writeHead(200,{'content-type':'application/json'});res.end('{}');}
});
await new Promise(resolve=>api.listen(0,'127.0.0.1',resolve));
const reservation=net.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
const collabPort=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
const child=spawn(process.execPath,['dist/server.js'],{cwd:path.join(repo,'collaboration-service'),env:{...process.env,PORT:String(collabPort),PLAYSAY_API_BASE_URL:`http://127.0.0.1:${api.address().port}`,COLLABORATION_SERVICE_TOKEN:'synthetic-local-service',COLLABORATION_TOKEN_SECRET:secret,GAME_REALTIME_MODE:'off'},stdio:['ignore','pipe','pipe']});
let childErrors='';child.stderr.on('data',data=>childErrors+=data);
let vite,fixtureDir;
const screenshots=process.env.GAME_STOP_SMOKE_SCREENSHOTS;
const results=[];
try {
 await new Promise((resolve,reject)=>{child.stdout.on('data',data=>{if(String(data).includes('listening'))resolve();});child.once('exit',code=>reject(new Error(`collaboration exited ${code}: ${childErrors}`)));setTimeout(()=>reject(new Error('collaboration startup timeout')),10000).unref();});
 fixtureDir=fs.mkdtempSync(path.join(web,'.html-game-lifecycle-smoke-'));
 fs.cpSync(path.join(repo,'scripts/smoke/fixtures/html-game-lifecycle'),fixtureDir,{recursive:true});
 const {createServer}=await import(pathToFileURL(requireWeb.resolve('vite')).href);
 process.chdir(web);
 vite=await createServer({root:web,configFile:path.join(web,'vite.config.ts'),server:{host:'127.0.0.1',port:0,hmr:false},optimizeDeps:{entries:[path.join(fixtureDir,'index.html')]},logLevel:'error'});
 await vite.listen();const origin=`http://127.0.0.1:${vite.httpServer.address().port}`;
 const {WebSocket}=requireCollab('ws');
 const denied=await new Promise((resolve,reject)=>{const client=new WebSocket(`ws://127.0.0.1:${collabPort}/?room=unauthorized&token=invalid-synthetic`);client.on('unexpected-response',(_req,res)=>{resolve(res.statusCode);res.resume();client.terminate();});client.on('open',()=>{client.close();reject(new Error('unauthorized collaboration accepted'));});client.on('error',()=>{});});
 assert.equal(denied,403);
 const manifest={protocol:'playsay-game-sync/v1',gameId:'synthetic',stateVersion:'1',reducerVersion:'1',buildHash:'smoke'};
 const sdk=fs.readFileSync(path.join(repo,'frontend/game-sync-sdk/dist/game-sync.iife.js'),'utf8');
 const timer="setInterval(()=>window.parent.postMessage({smokeTick:true},'*'),40);";
 const legacy=`<html><body><button id='step'>Step</button><output id='count'>0</output><script>let count=0;document.getElementById('step').onclick=()=>document.getElementById('count').textContent=++count;${timer}</script></body></html>`;
 const sdkHtml=`<html><head><script type='application/playsay-game+json'>${JSON.stringify(manifest)}</script></head><body><button id='step'>Step</button><output id='count'>0</output><script>${sdk}</script><script>const game=PlaySayGameSync.defineGame({manifest:${JSON.stringify(manifest)},initialState:{count:0},reduce:(state)=>({count:state.count+1}),onState:(state)=>{document.getElementById('count').textContent=state.count;}});document.getElementById('step').onclick=()=>game.dispatch('STEP',{});${timer}</script></body></html>`;
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
  const browser=await engine.launch({headless:true});
  try {
   for(const [layout,viewport] of [['desktop',{width:1365,height:900}],['mobile',{width:390,height:844}]]) {
    for(const mode of ['legacy','sdk']) {
     const context=await browser.newContext({viewport});
     const errors=[];const room=`${name}-${layout}-${mode}-${Date.now()}`;
     const yjsDocumentId=`lesson:synthetic:material:${room}:group:kind:MATERIAL`;
     await context.route(url=>url.pathname.startsWith('/api/'),async route=>{
      const requestUrl=new URL(route.request().url());
      if(requestUrl.pathname.endsWith('/token')) {
       const actor=new URL(route.request().frame().url()).searchParams.get('actor') || 'Teacher';
       const token=await new SignJWT({documentId:room,lessonId:'synthetic',materialId:room,documentKind:'MATERIAL',scope:'GROUP',yjsDocumentId,canPublishMaterialViewport:actor!=='Student'}).setProtectedHeader({alg:'HS256'}).setSubject(actor).setIssuer('playsay-api-gateway').setExpirationTime('1h').sign(new TextEncoder().encode(secret));
       await route.fulfill({json:{token,yjsDocumentId,websocketUrl:`ws://127.0.0.1:${collabPort}`}});
      } else if(requestUrl.pathname.endsWith('/assets')) await route.fulfill({json:[{id:'asset',materialId:'game',kind:'HTML_GAME',contentUrl:'/api/materials/game/assets/asset/content',metadata:{},createdAt:''}]});
      else if(requestUrl.pathname.endsWith('/content')) await route.fulfill({contentType:'text/html',body:mode==='sdk'?sdkHtml:legacy});
      else await route.fulfill({json:[]});
     });
     const teacher=await context.newPage(),student=await context.newPage();
     for(const page of [teacher,student])page.on('pageerror',error=>errors.push(error.message));
     const url=`${origin}/${path.basename(fixtureDir)}/index.html?room=${room}`;
     await teacher.goto(url);await student.goto(url+'&actor=Student');
     await Promise.all([teacher,student].map(page=>page.waitForFunction(()=>window.smoke?.connected)));
     const start=async()=>{
      await teacher.getByTestId('html-game-launch-game-block').click();
      for(const page of [teacher,student]) {
       await page.locator('iframe').waitFor();
       await page.getByTestId('material-game-stop').waitFor();
       try { await page.waitForFunction(()=>document.querySelector('[data-testid="material-game-stop"]')?.disabled===false, null, {timeout:5000}); }
       catch(error) {console.log('DIAGNOSTIC', await page.evaluate(()=>({connected:window.smoke.connected,sync:window.smoke.sync,iframe:document.querySelector('iframe')?.getAttribute('srcdoc')?.slice(0,100)})),errors);throw error;}
      }
     };
     const stopped=async()=>{for(const page of [teacher,student]){await page.locator('iframe').waitFor({state:'detached'});await page.waitForFunction(()=>window.smoke.sync.presentedBlockId===null&&Object.keys(window.smoke.sync.lifecycle.requests).length===0);}};
     await start();
     const step=teacher.frameLocator('iframe').locator('#step');await step.click();
     await teacher.frameLocator('iframe').locator('#count').filter({hasText:'1'}).waitFor();
     await teacher.getByTestId('material-focus-close').click();
     await teacher.evaluate(()=>window.smoke.refresh());
     await teacher.waitForFunction(()=>document.querySelector('.playsay-material-focus-stack')?.getAttribute('data-active')==='false');
     assert.equal(await teacher.locator('iframe').count(),1);
     await teacher.getByTestId('html-game-launch-game-block').click();
     await teacher.frameLocator('iframe').locator('#count').filter({hasText:'1'}).waitFor();
     const hit=await student.getByTestId('material-game-stop').evaluate(element=>{const r=element.getBoundingClientRect();return r.width>=40&&r.height>=40&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});
     assert.ok(hit,`${name}/${layout}/${mode}: exit hit testing`);
     if(screenshots){fs.mkdirSync(screenshots,{recursive:true});await student.screenshot({path:path.join(screenshots,`${name}-${layout}-${mode}.png`)});}
     await student.getByTestId('material-game-stop').click();await stopped();
     const ticks=await teacher.evaluate(()=>window.ticks);await teacher.waitForTimeout(180);assert.equal(await teacher.evaluate(()=>window.ticks),ticks);
     await start();await teacher.getByTestId('material-game-stop').click();await stopped();
     await start();await teacher.getByTestId('material-focus-close').click();await teacher.locator('.playsay-material-minimized-stop').click();await stopped();
     await start();await teacher.evaluate(()=>window.smoke.holdStops(true));await teacher.getByTestId('material-game-stop').click();
     await teacher.locator('iframe').waitFor({state:'detached'});assert.equal(await student.evaluate(()=>window.smoke.sync.presentedBlockId),'game-block');
     assert.equal(await teacher.evaluate(()=>window.smoke.sync.lifecycle.requests['game-block']?.phase),'pending');
     await teacher.locator('.playsay-material-game-stop-status').waitFor();await teacher.evaluate(()=>window.smoke.reconnect());await stopped();
     await start();await Promise.all([teacher,student].map(page=>page.getByTestId('material-game-stop').click().catch(()=>{})));await stopped();
     await student.reload();await student.waitForFunction(()=>window.smoke?.connected);assert.equal(await student.locator('iframe').count(),0);
     assert.deepEqual(errors,[],`${name}/${layout}/${mode}: browser errors`);
     results.push({engine:name,layout,mode,learnerStop:true,teacherStop:true,minimizeReopen:true,minimizedStop:true,concurrentStop:true,reconnect:true,pendingStopReconnect:true,hitTesting:true,runtimeStopped:true});
     console.log(JSON.stringify(results.at(-1)));
     await context.close();
    }
   }
  } finally {await browser.close();}
 }
 console.log(JSON.stringify({cases:results.length,passed:true}));
} finally {
 await vite?.close();child.kill('SIGTERM');await Promise.race([once(child,'exit'),new Promise(resolve=>setTimeout(resolve,1000))]);
 await new Promise(resolve=>api.close(resolve));if(fixtureDir)fs.rmSync(fixtureDir,{recursive:true,force:true});
}
