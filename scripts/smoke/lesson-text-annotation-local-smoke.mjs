import { createRequire } from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { once } from 'node:events';
const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(scriptDir,'../..');
const webApp=path.join(repo,'frontend/web-app');
const requireTools=createRequire(path.join(process.env.PLAYWRIGHT_PACKAGE_DIR ?? path.join(os.homedir(),'.codex/tools/playwright'),'package.json'));
const {chromium,webkit}=requireTools('playwright');
const require=createRequire(path.join(repo,'frontend/package.json'));
const {WebSocketServer}=require('ws'); const Y=require('yjs'); const sync=require('y-protocols/sync'); const enc=require('lib0/encoding'); const dec=require('lib0/decoding');
const rooms=new Map(); const sockets=new Set();
const server=new WebSocketServer({port:0,host:'127.0.0.1'});
server.on('connection',(ws,req)=>{
 const room=new URL(req.url,'http://localhost').searchParams.get('room');
 if(!rooms.has(room)) {
  const doc=new Y.Doc(); rooms.set(room,doc);
  doc.on('update',(update,origin)=>{const e=enc.createEncoder();enc.writeVarUint(e,0);sync.writeUpdate(e,update);for(const peer of sockets)if(peer.room===room&&peer!==origin&&peer.readyState===1)setTimeout(()=>{if(peer.readyState===1)peer.send(enc.toUint8Array(e));},80);});
 }
 ws.room=room;sockets.add(ws);const greeting=enc.createEncoder();enc.writeVarUint(greeting,0);sync.writeSyncStep1(greeting,rooms.get(room));ws.send(enc.toUint8Array(greeting));ws.on('close',()=>sockets.delete(ws));
 ws.on('message',data=>{const d=dec.createDecoder(new Uint8Array(data));if(dec.readVarUint(d)!==0)return;const e=enc.createEncoder();enc.writeVarUint(e,0);sync.readSyncMessage(d,e,rooms.get(room),ws);if(enc.length(e)>1)ws.send(enc.toUint8Array(e));});
});
await once(server,'listening');
const socketUrl=`ws://127.0.0.1:${server.address().port}`;
const fixtureDir=fs.mkdtempSync(path.join(webApp,'.text-annotation-smoke-'));
fs.cpSync(path.join(scriptDir,'fixtures/lesson-text-annotation'),fixtureDir,{recursive:true});
process.chdir(webApp);
const {createServer}=await import(pathToFileURL(require.resolve('vite')).href);
const vite=await createServer({root:webApp,configFile:path.join(webApp,'vite.config.ts'),server:{host:'127.0.0.1',port:0,hmr:false},optimizeDeps:{entries:[path.join(fixtureDir,'index.html')]},logLevel:'error'});
await vite.listen();
const origin=`http://127.0.0.1:${vite.httpServer.address().port}`;
const output=process.env.OUTPUT_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(),'honey-text-evidence-'));
fs.mkdirSync(output,{recursive:true});
const results=[];
try {
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
  const browser=await engine.launch({headless:true,executablePath:name==='chromium'?process.env.CHROMIUM_EXECUTABLE:process.env.WEBKIT_EXECUTABLE});
  try {
   for(const [layout,viewport,query] of [['desktop',{width:1365,height:900},''],['mobile',{width:390,height:844},'&portrait=1'],['png-cover',{width:1280,height:850},'&png=1&fit=cover'],['generated',{width:390,height:844},'&generated=1&portrait=1']]) {
    const context=await browser.newContext({viewport});const errors=[];
    await context.route(url=>url.pathname.startsWith('/api/'),route=>{
     const url=route.request().url();
     const room=new URL(route.request().frame().url()).searchParams.get('room');
     route.fulfill({json:url.endsWith('/token')?{websocketUrl:socketUrl,yjsDocumentId:room,token:'synthetic'}:url.includes('material-annotation')?{content:{activePageId:'page-1',elements:[]}}:[]});
    });
    const teacher=await context.newPage(); const student=await context.newPage();
    teacher.on('pageerror',e=>{errors.push(e.message);console.log('PAGE',e.message)});teacher.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text())});student.on('pageerror',e=>errors.push(e.message));
    const room=`${name}-${layout}`;const url=`${origin}/${path.basename(fixtureDir)}/index.html?room=${room}${query}`;
    await student.setViewportSize({width:layout==='desktop'?800:1200,height:900});await teacher.goto(url);await student.goto(url+'&actor=Student');
    await teacher.waitForFunction(()=>window.smoke?.status,{},{timeout:10000}).catch(async e=>{console.log(await teacher.evaluate(()=>({smoke:window.smoke,body:document.body.innerText.slice(0,300)})));throw e});await student.waitForFunction(()=>window.smoke?.status);
    await teacher.locator('[data-testid="annotation-tool-text"]').click();
    const layer=teacher.locator('svg[data-anchor-id="jpeg-1"]');await layer.waitFor({state:'visible'});
    await layer.click({position:{x:80,y:110}});
    const editor=teacher.locator('.playsay-annotation-text-text textarea');await editor.fill('Привет JPEG\nLine two ');
    const expected='Привет JPEG\nLine two ';
    await student.waitForFunction(text=>window.smoke.elements.some(e=>e.text===text),expected);
    await student.evaluate(()=>window.smoke.addRemote());
    await teacher.waitForFunction(()=>window.smoke.elements.length===2);
    assert.equal(await editor.inputValue(),expected);
    // Close every socket for this room, then type while the hook is reconnecting.
    for(const ws of sockets)if(ws.room===room)ws.close();
    await teacher.waitForFunction(()=>!window.smoke.status);
    await editor.fill(expected+'offline');
    await teacher.waitForFunction(()=>window.smoke.status);
    await student.waitForFunction(text=>window.smoke.elements.some(e=>e.text===text),expected+'offline');
    const originalGeometry=await teacher.evaluate(()=>window.smoke.elements.map(({id,x,y,width,height,anchorId})=>({id,x,y,width,height,anchorId})));
    await teacher.locator('[data-testid="material-image-focus-jpeg-1"]').click();
    await teacher.locator('[data-testid="material-focus-close"]').click();
    assert.deepEqual(await teacher.evaluate(()=>window.smoke.elements.map(({id,x,y,width,height,anchorId})=>({id,x,y,width,height,anchorId}))),originalGeometry);
    await teacher.locator('#switch-page').click();await teacher.locator('svg[data-anchor-id="jpeg-1"]').waitFor({state:'detached'});
    await teacher.locator('[data-testid="annotation-tool-text"]').click();
    await teacher.locator('svg[data-anchored="false"]').click({position:{x:80,y:120}});
    await teacher.locator('.playsay-annotation-text-text textarea').fill('Page text');
    await student.waitForFunction(()=>window.smoke.elements.some(e=>e.pageId==='page-2'&&e.text==='Page text'));
    await teacher.locator('#switch-page').click();await teacher.locator('svg[data-anchor-id="jpeg-1"]').waitFor({state:'visible'});
    await teacher.waitForFunction(text=>window.smoke.elements.some(e=>e.text===text),expected+'offline');
    const textSpan=teacher.locator('.playsay-annotation-text-text > span:not(.playsay-annotation-text-measure)').filter({hasText:expected+'offline'});
    await textSpan.waitFor({state:'visible'});
    const painted=await teacher.evaluate(async base64=>{
      const image=new Image();image.src=`data:image/png;base64,${base64}`;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>180&&pixels[i+1]<160&&pixels[i+2]<90)count++;
      return count;
    },(await textSpan.screenshot()).toString('base64'));
    assert.ok(painted>8,`${name}/${layout}: Text exists in DOM but has no painted glyphs (${painted})`);
    console.log(name,layout,'painted Text pixels',painted);
    await teacher.screenshot({path:`${output}/${name}-${layout}.png`,fullPage:true});
    await teacher.reload();await teacher.waitForFunction(text=>window.smoke?.status&&window.smoke.elements.some(e=>e.text===text),expected+'offline');
    const box=teacher.locator('.playsay-annotation-html-element').filter({hasText:expected+'offline'});
    await box.waitFor({state:'visible'});
    const before=await teacher.evaluate(()=>window.smoke.elements.find(e=>e.text.includes('Привет')).x);
    const rect=await box.boundingBox();await teacher.mouse.move(rect.x+2,rect.y+2);await teacher.mouse.down();await teacher.mouse.move(rect.x+14,rect.y+10);await teacher.mouse.up();
    await teacher.waitForFunction(x=>window.smoke.elements.find(e=>e.text.includes('Привет')).x>x,before);
    const handle=teacher.locator('.playsay-annotation-resize-handle').last();const h=await handle.boundingBox();
    await teacher.mouse.move(h.x+h.width/2,h.y+h.height/2);await teacher.mouse.down();await teacher.mouse.move(h.x+h.width/2+10,h.y+h.height/2+10);await teacher.mouse.up();
    await teacher.waitForFunction(()=>window.smoke.elements.find(e=>e.text.includes('Привет')).autoWidth===false);
    await box.dblclick();const longText='Привет JPEG\n'+('Long annotation line\n'.repeat(40))+'END';
    await teacher.locator('.playsay-annotation-text-text textarea').fill(longText);
    await teacher.locator('[data-testid="annotation-tool-pointer"]').click();
    const longSpan=teacher.locator('.playsay-annotation-text-text > span:not(.playsay-annotation-text-measure)').filter({hasText:'END'});
    await longSpan.waitFor({state:'visible'});
    assert.equal(await longSpan.evaluate(el=>{el.scrollTop=el.scrollHeight;return el.scrollTop>0}),true);
    await student.waitForFunction(text=>window.smoke.elements.some(e=>e.text===text),longText);
    for(const [tool,kind,value,y] of [['sticky-note','stickyNote','Sticky note preserved',170],['mind-map','mindMapNode','Mind map preserved',210]]) {
      await teacher.locator(`[data-testid="annotation-tool-${tool}"]`).click();
      await teacher.locator('svg[data-anchor-id="jpeg-1"]').click({position:{x:40,y}});
      await teacher.locator(`.playsay-annotation-text-${kind} textarea`).fill(value);
      await teacher.locator('[data-testid="annotation-tool-pointer"]').click();
      await student.waitForFunction(text=>window.smoke?.elements.some(e=>e.text===text),value);
    }
    assert.deepEqual(errors,[]);
    results.push({browser:name,version:browser.version(),layout,passed:true,paintedGlyphPixels:painted,longTextScroll:true,moveAndResize:true,elements:await teacher.evaluate(()=>window.smoke.elements.map(e=>({id:e.id,anchorId:e.anchorId,text:e.text}))) });
    await context.close();
   }
  } finally {await browser.close();}
 }
} finally {
 fs.writeFileSync(`${output}/results.json`,JSON.stringify(results,null,2));
 for(const ws of sockets)ws.terminate();server.close();for(const doc of rooms.values())doc.destroy();
 await vite.close();fs.rmSync(fixtureDir,{recursive:true,force:true});
}
console.log('Evidence:',output);
console.log(JSON.stringify(results.map(({browser,layout,passed})=>({browser,layout,passed}))));
