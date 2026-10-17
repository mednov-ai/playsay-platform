// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
vi.mock("../../../shared/api/collaboration",()=>({createCollaborationDocumentToken:vi.fn()}));
import { createCollaborationDocumentToken } from "../../../shared/api/collaboration";
import { WhiteboardRuntime, isWhiteboardStatePersisted } from "./whiteboardRuntime";
import type { LessonWhiteboard } from "../../../shared/api/whiteboard";
const board={id:'board',lessonId:'lesson',contentEpoch:0,document:{id:'doc',yjsDocumentId:'room',snapshot:null},canManage:true} as unknown as LessonWhiteboard;
const text={kind:'text',pageId:'whiteboard',createdAt:1,color:'#202433',fill:'transparent',x:-100,y:50,width:240,height:80,fontSize:30,text:'Hello\nЯ '};
describe("retained board runtime",()=>{
 it("requires a durable deletion acknowledgement even when its state vector is unchanged",()=>{
  const doc=new Y.Doc();doc.getMap("annotations").set("a","drawing");
  const vector=Y.decodeStateVector(Y.encodeStateVector(doc));const deleted=btoa(String.fromCharCode(...Y.encodeStateAsUpdate(doc,Y.encodeStateVector(doc))));
  expect(isWhiteboardStatePersisted(doc,vector,deleted)).toBe(true);
  doc.getMap("annotations").delete("a");expect(Y.decodeStateVector(Y.encodeStateVector(doc))).toEqual(vector);
  expect(isWhiteboardStatePersisted(doc,vector,deleted)).toBe(false);
  expect(isWhiteboardStatePersisted(doc,vector,btoa(String.fromCharCode(...Y.encodeStateAsUpdate(doc,Y.encodeStateVector(doc)))))).toBe(true);doc.destroy();
 });
 it("reports missing board capability without enabling drawing",async()=>{
  vi.useFakeTimers();
  class Socket { static OPEN=1;readyState=0;binaryType="";onopen:null|(()=>void)=null;onmessage:unknown=null;onerror:unknown=null;onclose:null|((event:{code:number})=>void)=null;send(){}close(code=1000){this.readyState=3;this.onclose?.({code});} }
  vi.stubGlobal("WebSocket",Socket);vi.mocked(createCollaborationDocumentToken).mockResolvedValue({websocketUrl:'ws://localhost/collab/ws',yjsDocumentId:'room',token:'synthetic',documentId:'doc',expiresAt:''});
  const runtime=new WhiteboardRuntime(board,'teacher','Teacher');runtime.activate();
  try { await vi.advanceTimersByTimeAsync(10001);expect(runtime.getSnapshot().status).toBe('unsupported'); }
  finally { runtime.dispose();vi.useRealTimers();vi.unstubAllGlobals(); }
 });
 it("rejects an oversized or out-of-world edit while leaving existing drawings and undo intact",()=>{
  const runtime=new WhiteboardRuntime(board,'teacher','Teacher');runtime.patch('text',text);
  runtime.patch('text',{text:'x'.repeat(20001)});expect(runtime.getSnapshot().limited).toBe(true);expect(runtime.getSnapshot().elements[0]).toMatchObject({text:text.text});
  runtime.patch('text',{x:100001});expect(runtime.getSnapshot().elements[0]).toMatchObject({x:-100});runtime.undo();expect(runtime.getSnapshot().elements).toEqual([]);runtime.dispose();
 });
 it("merges geometry and concurrent text without replacing the text CRDT",()=>{
  const a=new WhiteboardRuntime(board,'teacher','Teacher');a.patch('text',text);
  const b=new WhiteboardRuntime(board,'learner','Learner');Y.applyUpdate(b.doc,Y.encodeStateAsUpdate(a.doc));
  a.patch('text',{text:'Hello\nЯ tail '});b.patch('text',{x:300,width:500});
  Y.applyUpdate(a.doc,Y.encodeStateAsUpdate(b.doc));Y.applyUpdate(b.doc,Y.encodeStateAsUpdate(a.doc));
  expect(a.getSnapshot().elements).toEqual(b.getSnapshot().elements);
  expect(a.getSnapshot().elements[0]).toMatchObject({text:'Hello\nЯ tail ',x:300,width:500,ownerSubject:'teacher'});
  a.pause();a.patch('text',{text:'Kept while paused\n '});expect(a.getSnapshot().elements[0]).toMatchObject({text:'Kept while paused\n '});a.dispose();b.dispose();
 });
 it("undo only removes the local actor's independent drawing",()=>{
  const a=new WhiteboardRuntime(board,'teacher','Teacher'),b=new WhiteboardRuntime(board,'learner','Learner');
  a.patch('a',text);b.patch('b',{...text,text:'Learner'});Y.applyUpdate(a.doc,Y.encodeStateAsUpdate(b.doc));Y.applyUpdate(b.doc,Y.encodeStateAsUpdate(a.doc));
  a.undo();Y.applyUpdate(b.doc,Y.encodeStateAsUpdate(a.doc));expect(a.getSnapshot().elements.map(e=>e.id)).toEqual(['b']);expect(b.getSnapshot().elements.map(e=>e.id)).toEqual(['b']);a.dispose();b.dispose();
 });
 it("appends stroke points without retaining every replaced point array",()=>{
  const a=new WhiteboardRuntime(board,'teacher','Teacher');
  for(let i=1;i<=200;i++)a.patch('stroke',{kind:'stroke',pageId:'whiteboard',color:'#202433',createdAt:1,strokeWidth:4,points:Array.from({length:i},(_,x)=>({x,y:x,pageId:'whiteboard'}))});
  expect(Y.encodeStateAsUpdate(a.doc).byteLength).toBeLessThan(20000);a.dispose();
 });
 it("does not present a malformed loaded snapshot as a saved empty board",()=>{
  const runtime=new WhiteboardRuntime({...board,document:{...board.document,snapshot:{yjsUpdateBase64:'!bad!'}}},'viewer','');expect(runtime.getSnapshot().status).toBe('error');runtime.dispose();
 });
});
