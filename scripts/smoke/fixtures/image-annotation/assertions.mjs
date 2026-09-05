import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const imageSelector = (focused, id='image-a') => focused
  ? `.playsay-material-focused-image img[data-playsay-annotation-anchor-id="${id}"]`
  : `.playsay-rendered-image img[data-playsay-annotation-anchor-id="${id}"]`;
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

// Independent oracle: fixture intrinsic dimensions plus the browser's CSS content box.
async function raster(page, focused, id='image-a') {
  return page.locator(imageSelector(focused,id)).evaluate(image => {
    const r=image.getBoundingClientRect(), css=getComputedStyle(image);
    const n=v=>parseFloat(v)||0;
    const left=r.left+n(css.borderLeftWidth)+n(css.paddingLeft);
    const top=r.top+n(css.borderTopWidth)+n(css.paddingTop);
    const boxWidth=r.width-n(css.borderLeftWidth)-n(css.borderRightWidth)-n(css.paddingLeft)-n(css.paddingRight);
    const boxHeight=r.height-n(css.borderTopWidth)-n(css.borderBottomWidth)-n(css.paddingTop)-n(css.paddingBottom);
    const scale=(css.objectFit==='cover'?Math.max:Math.min)(boxWidth/image.naturalWidth,boxHeight/image.naturalHeight);
    const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
    return {left:left+(boxWidth-width)/2,top:top+(boxHeight-height)/2,width,height};
  });
}
async function draw(page, focused, point=[.25,.25], id='image-a') {
  await page.getByTestId('annotation-tool-pen').click();
  if(!focused) await page.locator(imageSelector(false,id)).scrollIntoViewIfNeeded();
  await settle(page);
  const r=await raster(page,focused,id);
  const count=await page.evaluate(()=>window.fixtureElements.length);
  await page.mouse.move(r.left+r.width*point[0],r.top+r.height*point[1]);
  await page.mouse.down();await page.mouse.move(r.left+r.width*point[0]+4,r.top+r.height*point[1]+4);await page.mouse.up();
  await page.waitForFunction(count=>window.fixtureElements.length===count+1,count);
  const element=await page.evaluate(()=>window.fixtureElements.at(-1));
  assert.equal(element.anchorId,id);
  assert.ok(Math.abs(element.points[0].x/1000-point[0])*r.width<=2,'input x is image-relative');
  assert.ok(Math.abs(element.points[0].y/1000-point[1])*r.height<=2,'input y is image-relative');
  await page.getByTestId('annotation-tool-pointer').click();
  return {id:element.id,point,anchor:id};
}
async function aligned(page, focused, drawings) {
  await settle(page);
  for(const drawing of drawings){
    const r=await raster(page,focused,drawing.anchor);
    const index=await page.evaluate(({id,anchor})=>window.fixtureElements.filter(el=>el.anchorId===anchor).findIndex(el=>el.id===id),drawing);
    const actual=await page.locator(`[data-anchor-id="${drawing.anchor}"] path.playsay-annotation-element`).nth(index).evaluate(path=>{
      const p=path.getPointAtLength(0),matrix=path.getScreenCTM();
      return new DOMPoint(p.x,p.y).matrixTransform(matrix).toJSON();
    });
    assert.ok(Math.abs(actual.x-r.left-r.width*drawing.point[0])<=2,`drawing x drift: ${actual.x-r.left-r.width*drawing.point[0]}`);
    assert.ok(Math.abs(actual.y-r.top-r.height*drawing.point[1])<=2,`drawing y drift: ${actual.y-r.top-r.height*drawing.point[1]}`);
  }
}
async function focus(page, id='image-a') {
  await page.getByTestId(`material-image-focus-${id}`).click();
  await page.locator('.playsay-task-board[data-presentation-mode="image-focus"]').waitFor();
  await settle(page);
  const r=await raster(page,true,id);
  const area=await page.locator('.playsay-task-document').boundingBox();
  const viewport=page.viewportSize();
  assert.ok(r.left>=area.x-1 && r.top>=area.y-1 && r.left+r.width<=area.x+area.width+1 && r.top+r.height<=Math.min(viewport.height,area.y+area.height)+1,`focused raster must fit: ${JSON.stringify({r,area})}`);
  const close=await page.getByTestId('material-focus-close').boundingBox();
  assert.ok(close && close.y>=0 && close.y+close.height<=viewport.height && close.y+close.height<=r.top+1,'close control must not cover the image');
}
async function collapse(page) {
  await page.getByTestId('material-focus-close').click();
  await page.locator('.playsay-task-board[data-presentation-mode="default"]').waitFor();await settle(page);
}

export async function runAssertions(browser, base, output) {
  await mkdir(output,{recursive:true});
  let cases=0;
  for(const viewport of [{width:1280,height:800},{width:390,height:844}]) {
    for(const size of ['600x1200','1200x600','800x800']) {
      for(const layout of ['FLOW','STATIC_IMAGE']) {
        const page=await browser.newPage({viewport});
        const room=`matrix-${cases}`;
        await page.goto(`${base}/?size=${size}&layout=${layout}&room=${room}`);
        await page.locator('[data-anchor-id="image-a"]').waitFor();
        const a=await draw(page,false);
        const before=await page.evaluate(()=>JSON.stringify(window.fixtureElements));
        for(let i=0;i<5;i++) { await focus(page); await aligned(page,true,[a]); await collapse(page); await aligned(page,false,[a]); }
        assert.equal(await page.evaluate(()=>JSON.stringify(window.fixtureElements)),before,'focus must not rewrite saved annotations');
        await focus(page);
        const b=await draw(page,true,[.75,.75]);
        await aligned(page,true,[a,b]);
        await page.setViewportSize({width:viewport.width-30,height:viewport.height-70});await settle(page);await aligned(page,true,[a,b]);
        if(size==='600x1200' && layout==='FLOW') await page.screenshot({path:`${output}/${viewport.width}-focus.png`});
        await collapse(page);await aligned(page,false,[a,b]);
        await page.reload();await page.locator('[data-anchor-id="image-a"]').waitFor();await aligned(page,false,[a,b]);
        await page.close();cases++;
      }
    }
  }
  console.log(`${cases} desktop/mobile aspect-ratio/layout cases passed (5 focus cycles, reverse drawing, resize, reload)`);

  const page=await browser.newPage({viewport:{width:1280,height:800}});
  await page.goto(`${base}/?fit=cover&room=cover`);await page.locator('[data-anchor-id="image-a"]').waitFor();
  const cover=await draw(page,false,[.25,.5]);await focus(page);await aligned(page,true,[cover]);await collapse(page);await aligned(page,false,[cover]);
  const generated=await draw(page,false,[.25,.25],'image-b');await focus(page,'image-b');await aligned(page,true,[generated]);
  assert.equal(await page.locator('.playsay-annotation-layer[data-anchor-id]').count(),1,'hidden image anchors must not intercept the focused image');
  await collapse(page);await aligned(page,false,[cover,generated]);await page.close();
  console.log('Cover preview and multiple image/generatedImage anchors passed');

  const delayed=await browser.newPage({viewport:{width:1280,height:800}});
  let release;
  const loaded=new Promise(resolve=>{release=resolve;});
  await delayed.route('**/delayed-image.svg',async route=>{
    await loaded;
    await route.fulfill({contentType:'image/svg+xml',body:await delayed.evaluate(()=>window.fixtureSvg)});
  });
  await delayed.goto(`${base}/?delayed&room=delayed`,{waitUntil:'domcontentloaded'});
  await delayed.locator('img').first().waitFor();
  assert.equal(await delayed.locator('.playsay-annotation-layer[data-anchor-id]').count(),0);
  await delayed.getByTestId('annotation-tool-pen').click();
  const pending=await delayed.locator('img').first().boundingBox();
  await delayed.mouse.click(pending.x+pending.width/2,pending.y+pending.height/2);
  assert.equal(await delayed.evaluate(()=>window.fixtureElements.length),0,'pending image must not create legacy page coordinates');
  release();
  await delayed.locator('[data-anchor-id="image-a"]').waitFor();
  const delayedDrawing=await draw(delayed,false);await focus(delayed);await aligned(delayed,true,[delayedDrawing]);
  await delayed.close();
  console.log('Delayed image load and pending-input protection passed');

  const shapes=await browser.newPage({viewport:{width:1280,height:800}});
  await shapes.goto(`${base}/?room=shapes`);await shapes.locator('[data-anchor-id="image-a"]').waitFor();
  await shapes.getByTestId('annotation-tool-rectangle').click();
  const initial=await raster(shapes,false);
  await shapes.mouse.move(initial.left+initial.width*.25,initial.top+initial.height*.25);await shapes.mouse.down();
  await shapes.mouse.move(initial.left+initial.width*.75,initial.top+initial.height*.75);await shapes.mouse.up();
  const rectangle=await shapes.evaluate(()=>window.fixtureElements[0]);
  assert.equal(rectangle.kind,'rectangle');
  const snapshot=JSON.stringify(rectangle);
  await shapes.getByTestId('annotation-tool-pointer').click();await focus(shapes);
  const expanded=await raster(shapes,true);
  const corner=await shapes.locator('[data-anchor-id="image-a"] rect.playsay-annotation-element').evaluate(rect=>{
    const box=rect.getBBox(), matrix=rect.getScreenCTM();
    return {start:new DOMPoint(box.x,box.y).matrixTransform(matrix).toJSON(),end:new DOMPoint(box.x+box.width,box.y+box.height).matrixTransform(matrix).toJSON()};
  });
  for(const [name,fraction] of [['start',.25],['end',.75]]) {
    assert.ok(Math.abs(corner[name].x-expanded.left-expanded.width*fraction)<=2);
    assert.ok(Math.abs(corner[name].y-expanded.top-expanded.height*fraction)<=2);
  }
  await collapse(shapes);
  assert.equal(await shapes.evaluate(()=>JSON.stringify(window.fixtureElements[0])),snapshot);
  await shapes.close();console.log('Rectangle shape preserves both corners and stored geometry');


  // Two real renderers with a synthetic transport; backend authorization is covered separately.
  const sharedContext=await browser.newContext();
  const teacher=await sharedContext.newPage(), student=await sharedContext.newPage(), parallel=await sharedContext.newPage();
  await teacher.setViewportSize({width:1280,height:800});await student.setViewportSize({width:390,height:844});
  await teacher.goto(`${base}/?shared&room=shared`);await student.goto(`${base}/?shared&room=shared`);
  await parallel.goto(`${base}/?shared&room=parallel-student`);
  await teacher.locator('[data-anchor-id="image-a"]').waitFor();
  const sharedDrawing=await draw(teacher,false);
  await student.waitForFunction(()=>window.fixtureElements.length===1);
  await aligned(student,false,[sharedDrawing]);
  await focus(teacher);
  await student.locator('.playsay-task-board[data-presentation-mode="image-focus"]').waitFor();
  await aligned(student,true,[sharedDrawing]);
  const studentDrawing=await draw(student,true,[.75,.75]);
  await teacher.waitForFunction(()=>window.fixtureElements.length===2);
  await aligned(teacher,true,[sharedDrawing,studentDrawing]);
  assert.equal(await parallel.evaluate(()=>window.fixtureElements.length),0,'independent room must stay isolated');
  await student.reload();await student.locator('[data-anchor-id="image-a"]').waitFor();
  await aligned(student,false,[sharedDrawing,studentDrawing]);
  await sharedContext.close();
  console.log('Two viewport clients, shared focus/drawing, restoration and independent room passed');

}
