import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const tools=createRequire(path.join(process.env.PLAYWRIGHT_PACKAGE_DIR??path.join(os.homedir(),'.codex/tools/playwright'),'package.json'));
const {chromium,webkit}=tools('playwright');
const requireService=createRequire(path.join(repo,'collaboration-service/package.json'));
const Y=requireService('yjs');
const {SignJWT}=await import(pathToFileURL(requireService.resolve('jose')).href);
const secret='synthetic-local-collaboration-smoke-secret-012345';
const documents=new Map(); let rejectSaves=false;
const api=http.createServer(async(req,res)=>{
 const id=req.url?.split('/')[5];
 if(!documents.has(id)){res.writeHead(404);res.end();return;}
 if(req.method==='PUT'){
  let body='';for await(const chunk of req)body+=chunk;
  if(rejectSaves){res.writeHead(503);res.end();return;}
  documents.set(id,JSON.parse(body).snapshot);
 }
 res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({snapshot:documents.get(id)}));
});api.listen(0,'127.0.0.1');await once(api,'listening');
const reservation=http.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const servicePort=reservation.address().port;await new Promise(r=>reservation.close(r));
const spawnService=()=>spawn(process.execPath,[path.join(repo,'collaboration-service/dist/server.js')],{stdio:'ignore',env:{...process.env,PORT:String(servicePort),PLAYSAY_API_BASE_URL:`http://127.0.0.1:${api.address().port}`,COLLABORATION_SERVICE_TOKEN:secret,COLLABORATION_TOKEN_SECRET:secret,COLLABORATION_RECOVERY_PROBES_ENABLED:'true',SNAPSHOT_INTERVAL_MS:'200'}});
let child=spawnService();
let vite; const results=[];
const webApp=path.join(repo,'frontend/web-app');const fixtureDir=fs.mkdtempSync(path.join(webApp,'__collab-recovery-fixture-'));
const output=process.env.OUTPUT_DIR??fs.mkdtempSync(path.join(os.tmpdir(),'honey-collab-evidence-'));fs.mkdirSync(output,{recursive:true});
try{
 for(let n=0;n<100;n++){if(await fetch(`http://127.0.0.1:${servicePort}/healthz`).then(r=>r.ok).catch(()=>false))break;await new Promise(r=>setTimeout(r,25));}
 fs.cpSync(path.join(repo,'scripts/smoke/fixtures/lesson-text-annotation'),fixtureDir,{recursive:true});
 let main=fs.readFileSync(path.join(fixtureDir,'main.tsx'),'utf8');
 main=main.replace("yjsDocumentId: room", "yjsDocumentId: `lesson:synthetic:material:image:group:kind:MATERIAL`");
 main=main.replace('status:workspace.connected,','status:workspace.connected,connectionStatus:workspace.status,text:workspace.text,setText:workspace.updateText,retry:workspace.retryConnection,');
 main=main.replace('ready:workspace.connected,participants:', 'ready:workspace.connected,status:workspace.status,retry:workspace.retryConnection,participants:');
 fs.writeFileSync(path.join(fixtureDir,'main.tsx'),main);
 const requireFront=createRequire(path.join(repo,'frontend/package.json'));
 const {createServer}=await import(pathToFileURL(requireFront.resolve('vite')).href);
 process.chdir(webApp);
 vite=await createServer({root:webApp,configFile:path.join(webApp,'vite.config.ts'),server:{host:'127.0.0.1',port:0,hmr:false},optimizeDeps:{entries:[path.join(fixtureDir,'index.html')]},logLevel:'error'});await vite.listen();
 const origin=`http://127.0.0.1:${vite.httpServer.address().port}`;
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   for(const [layout,viewport] of [['desktop',{width:1365,height:900}],['mobile',{width:390,height:844}]]){
    const context=await browser.newContext({viewport});const errors=[];const id=`${name}-${layout}`;documents.clear();documents.set(id,null);
    await context.addInitScript(()=>{const Original=window.WebSocket;window.__fixtureSockets=[];window.WebSocket=class extends Original{constructor(...args){super(...args);window.__fixtureSockets.push(this);}};});
    await context.route(url=>url.pathname.startsWith('/api/'),async route=>{
     if(route.request().url().endsWith('/token')){
      const token=await new SignJWT({documentId:id,lessonId:'synthetic',materialId:'image',documentKind:'MATERIAL',scope:'GROUP',yjsDocumentId:'lesson:synthetic:material:image:group:kind:MATERIAL'}).setProtectedHeader({alg:'HS256'}).setIssuer('playsay-api-gateway').setSubject('synthetic-fixture').setExpirationTime('10m').sign(new TextEncoder().encode(secret));
      await route.fulfill({json:{documentId:id,expiresAt:new Date(Date.now()+600000).toISOString(),token,websocketUrl:`ws://127.0.0.1:${servicePort}`,yjsDocumentId:'lesson:synthetic:material:image:group:kind:MATERIAL'}});
     }else await route.fulfill({json:route.request().url().includes('material-annotation')?{content:{elements:[]}}:[]});
    });
    const teacher=await context.newPage();const student=await context.newPage();for(const page of [teacher,student])page.on('pageerror',e=>errors.push(e.message));
    const url=`${origin}/${path.basename(fixtureDir)}/index.html?room=${id}`;await teacher.goto(url);await student.goto(url+'&actor=Student');
    await Promise.all([teacher.waitForFunction(()=>window.smoke?.status),student.waitForFunction(()=>window.smoke?.status)]);
    const latencies=[];
    for(let i=0;i<12;i++){const value=`fixture-${i}`;const start=performance.now();await teacher.evaluate(v=>window.smoke.setText(v),value);await student.waitForFunction(v=>window.smoke.text===v,value);latencies.push(performance.now()-start);}
    rejectSaves=true;await teacher.evaluate(()=>{const socket=window.__fixtureSockets.findLast(s=>s.readyState===1 && typeof s.onmessage==='function');socket.send=()=>{window.__droppedMessages=(window.__droppedMessages??0)+1;};window.smoke.setText('offline-retained');});
    assert.ok(await teacher.evaluate(()=>window.__droppedMessages>0),'fixture did not intercept the active sender');assert.notEqual(await student.evaluate(()=>window.smoke.text),'offline-retained','fixture failed to interrupt transport');await teacher.bringToFront();await teacher.evaluate(()=>window.dispatchEvent(new Event('online')));
    const recoveryStart=performance.now();await student.waitForFunction(()=>window.smoke.text==='offline-retained',null,{timeout:30000});const recoveryMs=performance.now()-recoveryStart;
    rejectSaves=false;
    for(let i=0;i<100;i++){const saved=documents.get(id);if(saved?.yjsUpdateBase64){const restored=new Y.Doc();Y.applyUpdate(restored,Buffer.from(saved.yjsUpdateBase64,'base64'));const ok=restored.getText('workspace').toString()==='offline-retained';restored.destroy();if(ok)break;}await new Promise(r=>setTimeout(r,100));}
    const restoredState=new Y.Doc();Y.applyUpdate(restoredState,Buffer.from(documents.get(id).yjsUpdateBase64,'base64'));assert.equal(restoredState.getText('workspace').toString(),'offline-retained','latest snapshot acknowledgment absent');restoredState.destroy();
    // A fresh room admission after both peers leave must restore acknowledged state.
    await teacher.close();await student.close();
    child.kill('SIGKILL');await once(child,'exit');child=spawnService();
    for(let n=0;n<100;n++){if(await fetch(`http://127.0.0.1:${servicePort}/healthz`).then(r=>r.ok).catch(()=>false))break;await new Promise(r=>setTimeout(r,25));}
    const fresh=await context.newPage();fresh.on('pageerror',e=>errors.push(e.message));await fresh.goto(url+'&actor=Restored');await fresh.waitForFunction(()=>window.smoke.text==='offline-retained');
    // Terminal missing-document path and localized retry banner.
    documents.delete(id);await fresh.evaluate(()=>{const socket=window.__fixtureSockets.find(s=>s.readyState===1);socket.close(4404,'fixture deleted');});
    await fresh.waitForFunction(()=>window.smoke.connectionStatus==='error');
    await fresh.locator('.playsay-task-collaboration-status').waitFor();
    for(const theme of ['light','dark']){await fresh.evaluate(t=>document.documentElement.classList.toggle('dark',t==='dark'),theme);await fresh.screenshot({path:path.join(output,`${name}-${layout}-${theme}.png`),fullPage:true});}
    assert.deepEqual(errors,[]);assert.ok(recoveryMs<30000);const sorted=[...latencies].sort((a,b)=>a-b);const p95=sorted[Math.ceil(sorted.length*.95)-1];assert.ok(p95<300);assert.ok(Math.max(...latencies)<1000);
    results.push({browser:name,version:browser.version(),layout,passed:true,recoveryMs,p95Ms:p95,maxMs:Math.max(...latencies),snapshotAcknowledged:true,restoreVerified:true,localizedStatus:true});
    await context.close();
   }
  }finally{await browser.close();}
 }
}finally{
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));child.kill('SIGKILL');api.close();await vite?.close();fs.rmSync(fixtureDir,{recursive:true,force:true});
}
console.log(JSON.stringify({output,results},null,2));
