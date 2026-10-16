import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const web=path.join(repo,'frontend/web-app');
const req=createRequire(path.join(repo,'frontend/package.json'));
const collabReq=createRequire(path.join(repo,'collaboration-service/package.json'));
const {chromium,webkit}=createRequire(path.join(process.env.PLAYWRIGHT_PACKAGE_DIR||path.join(os.homedir(),'.codex/tools/playwright'),'package.json'))('playwright');
const {SignJWT}=await import(pathToFileURL(collabReq.resolve('jose')).href);
const secret='synthetic-library-smoke-secret-123456789';
const snapshots=new Map();
const api=http.createServer(async(request,response)=>{const key=request.url;if(request.method==='GET'){response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({snapshot:snapshots.get(key)??null}));}else{let body='';for await(const c of request)body+=c;try{snapshots.set(key,JSON.parse(body).snapshot);}catch{}response.writeHead(200,{'content-type':'application/json'});response.end('{}');}});
await new Promise(resolve=>api.listen(0,'127.0.0.1',resolve));
const reserve=net.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const collabPort=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
const child=spawn(process.execPath,['dist/server.js'],{cwd:path.join(repo,'collaboration-service'),env:{...process.env,PORT:String(collabPort),PLAYSAY_API_BASE_URL:`http://127.0.0.1:${api.address().port}`,COLLABORATION_SERVICE_TOKEN:'synthetic',COLLABORATION_TOKEN_SECRET:secret,GAME_REALTIME_MODE:'off'},stdio:['ignore','pipe','pipe']});
let vite,fixture;let stderr='';child.stderr.on('data',v=>stderr+=v);
const results=[];
const sdk=fs.readFileSync(path.join(repo,'frontend/game-sync-sdk/dist/game-sync.iife.js'),'utf8');
const manifest={protocol:'playsay-game-sync/v1',gameId:'synthetic',stateVersion:'1',reducerVersion:'1',buildHash:'smoke'};
const html=`<html><head><title>Library Race</title><script type="application/playsay-game+json">${JSON.stringify(manifest)}</script></head><body><button id="step" disabled>Step</button><output id="count">0</output><script>${sdk}</script><script>const game=PlaySayGameSync.defineGame({manifest:${JSON.stringify(manifest)},initialState:{count:0},onSession:session=>{document.body.dataset.runId=session.runId;document.getElementById("step").disabled=false;game.ready();},reduce:s=>({count:s.count+1}),onState:s=>document.getElementById('count').textContent=s.count});document.getElementById('step').onclick=()=>game.dispatch('STEP',{});</script></body></html>`;
try {
 await new Promise((resolve,reject)=>{child.stdout.on('data',d=>{if(String(d).includes('listening'))resolve();});child.once('exit',code=>reject(new Error(`collaboration failed ${code} ${stderr}`)));setTimeout(()=>reject(new Error('startup timeout')),10000).unref();});
 fixture=fs.mkdtempSync(path.join(web,'.html-game-library-smoke-'));fs.cpSync(path.join(repo,'scripts/smoke/fixtures/html-game-library'),fixture,{recursive:true});
 const {createServer}=await import(pathToFileURL(req.resolve('vite')).href);process.chdir(web);
 vite=await createServer({root:web,configFile:path.join(web,'vite.config.ts'),server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'error'});await vite.listen();const origin=`http://127.0.0.1:${vite.httpServer.address().port}`;
 for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]) {
 const browser=await engine.launch({headless:true});
 try {for(const [layout,viewport] of [['desktop',{width:1365,height:1000}],['mobile',{width:390,height:844}]]) {for(const dark of [false,true]) {
  const context=await browser.newContext({viewport,colorScheme:dark?'dark':'light'});const errors=[];const room=`${engineName}-${layout}-${dark}-${Date.now()}`;
  const game={id:'game-synthetic',revisionId:'revision-synthetic',title:'Library Race',topic:'',cefrLevel:null,compatibility:'SDK_V1',status:'ACTIVE',canEdit:false,hasCover:false,version:1,createdAt:'',updatedAt:''};
  const material={id:'material-synthetic',title:'Pinned library game',description:null,language:'en',cefrLevel:'A2',visibility:'PRIVATE',status:'DRAFT',sourceMeta:{},scoringRubric:{},blockCount:1,createdAt:'',updatedAt:'',document:{schemaVersion:1,pages:[{id:'page',title:'Game',layout:'FLOW',blocks:[{id:'occurrence-one',type:'htmlGame',title:game.title,gameId:game.id,gameRevisionId:game.revisionId,height:640},{id:'occurrence-two',type:'htmlGame',title:game.title,gameId:game.id,gameRevisionId:game.revisionId,height:640}]}]}};
  let materialCreates=0;
  let launch=null,revision=0;const commands=new Map();const pages=[];
  const notify=async()=>{for(const page of pages)await page.evaluate(lesson=>window.dispatchEvent(new CustomEvent('honey-school:lesson-game-changed',{detail:lesson})),room).catch(()=>{});};
  await context.route(url=>url.pathname.startsWith('/api/'),async route=>{
   const request=route.request(),url=new URL(request.url()),actor=new URL(request.frame().url()).searchParams.get('actor')||'Teacher';
   const json=value=>route.fulfill({json:value});
   if(url.pathname==='/api/games') {if(request.method()==='POST')return route.fulfill({status:201,json:game});const search=url.searchParams.get('search')||'';return json({items:game.title.toLowerCase().includes(search.toLowerCase())?[game]:[],total:game.title.toLowerCase().includes(search.toLowerCase())?1:0,page:0,pageSize:24});}
   if(url.pathname===`/api/games/${game.id}/materials`){materialCreates++;return json(material);}
   if(url.pathname.endsWith('/game-launches/current'))return json({launch,revision,canControl:actor!=='Student',protocolReady:true});
   if(url.pathname.endsWith('/game-launches')){const body=request.postDataJSON();if(!commands.has(body.commandId)){revision++;launch={id:`launch-${revision}`,lessonId:room,gameId:game.id,revisionId:game.revisionId,status:'ACTIVE',documentId:`doc-${room}-${revision}`,createdAt:'',presentationRevision:revision};commands.set(body.commandId,launch);}await json(commands.get(body.commandId));await notify();return;}
   if(url.pathname.endsWith('/stop')){const id=url.pathname.split('/').at(-2);if(launch?.id===id){launch=null;revision++;}await json({id,lessonId:room,gameId:game.id,revisionId:game.revisionId,status:'STOPPED',documentId:null,createdAt:'',presentationRevision:revision});await notify();return;}
   if(url.pathname.endsWith('/document')&&!launch)return route.fulfill({status:404,json:{}});
   if(url.pathname.endsWith('/document'))return json({id:launch.documentId,lessonId:room,materialId:null,gameLaunchId:launch.id,documentKind:'LESSON_GAME',scope:'GROUP',yjsDocumentId:`lesson:${room}:game:${launch.id}:group:kind:LESSON_GAME`,version:1,createdAt:'',updatedAt:''});
   if(url.pathname.endsWith('/token')) {if(!launch||!url.pathname.includes(launch.documentId))return route.fulfill({status:404,json:{}});const yjsDocumentId=`lesson:${room}:game:${launch.id}:group:kind:LESSON_GAME`;const token=await new SignJWT({documentId:launch.documentId,lessonId:room,gameLaunchId:launch.id,documentKind:'LESSON_GAME',scope:'GROUP',yjsDocumentId,canPublishMaterialViewport:false}).setProtectedHeader({alg:'HS256'}).setSubject(actor).setIssuer('playsay-api-gateway').setExpirationTime('1h').sign(new TextEncoder().encode(secret));return json({documentId:launch.documentId,token,yjsDocumentId,websocketUrl:`ws://127.0.0.1:${collabPort}`});}
   if(url.pathname.endsWith('/content'))return route.fulfill({contentType:'text/html',body:html});
   if(url.pathname.endsWith('/cover'))return route.fulfill({status:404,json:{}});
   return json([]);
  });
  const teacher=await context.newPage(),student=await context.newPage();pages.push(teacher,student);for(const page of pages)page.on('pageerror',e=>errors.push(e.message));
  const url=`${origin}/${path.basename(fixture)}/index.html?room=${room}${dark?'&dark':''}`;
  await teacher.goto(url);await student.goto(url+'&actor=Student');
  await teacher.getByRole('heading',{name:'Library Race'}).waitFor();
  const searched=teacher.waitForResponse(response=>new URL(response.url()).pathname==='/api/games'&&new URL(response.url()).searchParams.get('search')==='Library');
  await teacher.getByRole('textbox',{name:'Поиск игр'}).fill('Library');await searched;
  await teacher.getByRole('heading',{name:'Library Race'}).waitFor();
  await teacher.getByRole('button',{name:'Предпросмотр',exact:true}).focus();await teacher.keyboard.press('Enter');await teacher.locator('dialog iframe').waitFor();
  assert.equal(await student.locator('iframe').count(),0);assert.equal(launch,null);
  await teacher.keyboard.press('Escape');await teacher.locator('dialog').waitFor({state:'detached'});
  assert.equal(await teacher.getByRole('textbox',{name:'Поиск игр'}).inputValue(),'Library');
  await teacher.waitForFunction(()=>document.activeElement?.textContent?.trim()==='Предпросмотр');
  await teacher.getByRole('button',{name:'Запустить на уроке',exact:true}).click();
  for(const page of pages) { try { await page.locator('iframe').waitFor(); } catch(error) { console.log('DIAGNOSTIC',await page.locator('body').innerText(),await page.evaluate(()=>({launch:window.smoke?.launch,stage:document.querySelector('[data-game-connection]')?.outerHTML.slice(0,1400)})),errors,stderr);throw error; } }
  await teacher.frameLocator('iframe').locator('#step:enabled').waitFor();
  const acceptedRun=await teacher.frameLocator('iframe').locator('body').getAttribute('data-run-id');
  await student.frameLocator('iframe').locator(`body[data-run-id="${acceptedRun}"] #step:enabled`).waitFor();
  for(let action=1;action<=20;action++) { await teacher.frameLocator('iframe').locator('#step').click(); await teacher.frameLocator('iframe').locator('#count').filter({hasText:new RegExp(`^${action}$`)}).waitFor(); if(action===1) await student.frameLocator('iframe').locator('#count').filter({hasText:'1'}).waitFor(); }
  try { await student.frameLocator('iframe').locator('#count').filter({hasText:'20'}).waitFor(); } catch(error) { console.log('COUNT DIAGNOSTIC',engineName,layout,dark,await teacher.frameLocator('iframe').locator('#count').textContent(),await student.frameLocator('iframe').locator('#count').textContent(),errors);throw error; }
  await teacher.getByRole('button',{name:'Свернуть',exact:true}).click();
  assert.equal(await teacher.locator('iframe').count(),1);assert.equal(await teacher.getByRole('textbox',{name:'Material draft'}).inputValue(),'Keep my annotation');
  await teacher.getByRole('button',{name:'Продолжить',exact:true}).click();
  await student.reload();await student.locator('iframe').waitFor();try { await student.frameLocator('iframe').locator('#count').filter({hasText:'20'}).waitFor(); } catch(error) { console.log('COUNT DIAGNOSTIC',engineName,layout,dark,await teacher.frameLocator('iframe').locator('#count').textContent(),await student.frameLocator('iframe').locator('#count').textContent(),errors);throw error; }
  await teacher.reload();await teacher.locator('iframe').waitFor();await teacher.frameLocator('iframe').locator('#count').filter({hasText:'20'}).waitFor();
  const stage=student.getByRole('region',{name:'Игра на уроке'});await stage.getByRole('button',{name:'Завершить для всех',exact:true}).click();
  for(const page of pages)await page.locator('iframe').waitFor({state:'detached'});
  await teacher.getByRole('button',{name:'Запустить на уроке',exact:true}).click();for(const page of pages) { try { await page.locator('iframe').waitFor(); } catch(error) { console.log('DIAGNOSTIC',await page.locator('body').innerText(),await page.evaluate(()=>({launch:window.smoke?.launch,stage:document.querySelector('[data-game-connection]')?.outerHTML.slice(0,1400)})),errors,stderr);throw error; } }
  await teacher.frameLocator('iframe').locator('#count').filter({hasText:'0'}).waitFor();
  const shots=process.env.GAME_LIBRARY_SCREENSHOTS;if(shots){fs.mkdirSync(shots,{recursive:true});await teacher.screenshot({path:path.join(shots,`${engineName}-${layout}-${dark?'dark':'light'}.png`),fullPage:true});}
  await teacher.getByRole('region',{name:'Игра на уроке'}).getByRole('button',{name:'Завершить для всех',exact:true}).click();for(const page of pages)await page.locator('iframe').waitFor({state:'detached'});
  assert.equal(await teacher.getByRole('textbox',{name:'Material draft'}).inputValue(),'Keep my annotation');
  assert.equal(await teacher.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const catalog=await context.newPage();pages.push(catalog);catalog.on('pageerror',e=>errors.push(e.message));
  await catalog.goto(url+'&catalog=1');
  await catalog.locator('input[type=file]').focus();
  assert.notEqual(await catalog.locator('input[type=file]').evaluate(element=>getComputedStyle(element.parentElement).outlineStyle),'none');
  await catalog.getByRole('button',{name:'Добавить в материал',exact:true}).click();
  await catalog.locator('dialog').getByRole('button',{name:'Добавить в материал',exact:true}).click();
  await catalog.getByText('Игра добавлена в материал',{exact:true}).waitFor();assert.equal(materialCreates,1);
  await catalog.evaluate(value=>window.smoke.showMaterial(value),material);
  await catalog.getByTestId('html-game-launch-occurrence-one').click();
  await catalog.locator('iframe:visible').contentFrame().locator('#step').click();
  await catalog.locator('iframe:visible').contentFrame().locator('#count').filter({hasText:'1'}).waitFor();
  await catalog.getByTestId('material-focus-close').click();
  await catalog.getByTestId('html-game-launch-occurrence-two').click();
  await catalog.locator('iframe:visible').contentFrame().locator('#count').filter({hasText:'0'}).waitFor();
  assert.equal(await catalog.locator('iframe').count(),2);
  await catalog.getByTestId('material-focus-close').click();
  await catalog.getByTestId('html-game-launch-occurrence-one').click();
  await catalog.locator('iframe:visible').contentFrame().locator('#count').filter({hasText:'1'}).waitFor();
  assert.deepEqual(errors,[]);console.log('PASS',engineName,layout,dark?'dark':'light');results.push({engine:engineName,layout,theme:dark?'dark':'light',passed:true});await context.close();
 }}}finally{await browser.close();}
 }
 console.log(JSON.stringify({fixture:'real library/hook/stage and collaboration service; synthetic API/auth/lesson state; no media acceptance',results},null,2));
}finally{if(vite)await vite.close();child.kill();api.close();if(fixture)fs.rmSync(fixture,{recursive:true,force:true});}
