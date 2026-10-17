import { describe, expect, it } from "vitest";
import { boundedCamera, cameraRegion, fitWhiteboardContent, fitWhiteboardRegion, worldPoint } from "./whiteboardGeometry";
import type { AnnotationElement } from "./annotation";
describe("whiteboard world transform", () => {
 it.each([.25,1,4])("round trips signed coordinates at %s zoom", scale => {
  const camera={x:-500,y:800,scale},rect={left:100,top:50,width:1200,height:600};
  const world=worldPoint(650,275,rect,camera),region=cameraRegion(camera,rect.width,rect.height);
  expect((world.x-region.x)*scale+rect.left).toBeCloseTo(650);
  expect((world.y-region.y)*scale+rect.top).toBeCloseTo(275);
 });
 it("fits the same teacher region across different aspect ratios", () => {
  const region={x:-600,y:-200,width:1200,height:700};
  for(const [w,h] of [[1200,800],[390,500],[844,300]]){
   const shown=cameraRegion(fitWhiteboardRegion(region,w,h),w,h);
   expect(shown.x).toBeLessThanOrEqual(region.x);expect(shown.y).toBeLessThanOrEqual(region.y);
   expect(shown.x+shown.width).toBeGreaterThanOrEqual(region.x+region.width);expect(shown.y+shown.height).toBeGreaterThanOrEqual(region.y+region.height);
  }
 });
 it("fits offscreen content and bounds camera/zoom", () => {
  const elements:AnnotationElement[]=[{id:'offscreen',kind:'rectangle',pageId:'whiteboard',createdAt:1,color:'#202433',fill:'transparent',strokeWidth:4,x:-5000,y:8000,width:600,height:200}];
  const camera=fitWhiteboardContent(elements,1000,600);expect(camera.x).toBe(-4700);expect(camera.y).toBe(8100);
  expect(boundedCamera({x:Infinity,y:-Infinity,scale:20})).toEqual({x:100000,y:-100000,scale:4});
 });
});
