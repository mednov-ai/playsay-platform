// @vitest-environment jsdom
import {act,renderHook,waitFor,cleanup} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const api=vi.hoisted(()=>({fetch:vi.fn(),ensure:vi.fn(),update:vi.fn()}));
vi.mock("../../../shared/api/whiteboard",()=>({fetchWhiteboardContext:api.fetch,ensureLessonWhiteboard:api.ensure,updateLessonWhiteboard:api.update}));
import {useLessonWhiteboard} from "./useLessonWhiteboard";
import type {LessonWhiteboard} from "../../../shared/api/whiteboard";
const board=(revision=1)=>({id:'board',lessonId:'lesson',controlRevision:revision,background:revision===1?'#ffffff':'#fff8e8',activeSurface:'WHITEBOARD',readOnly:false}) as LessonWhiteboard;
const context=(value:LessonWhiteboard|null)=>({enabled:true,canManage:true,board:value});
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return{resolve,promise};};
beforeEach(()=>vi.resetAllMocks());afterEach(cleanup);
describe("canonical whiteboard context",()=>{
 it("ignores a delayed response from a previous lesson",async()=>{
  const old=deferred<unknown>();api.fetch.mockReturnValueOnce(old.promise).mockResolvedValue(context({...board(),lessonId:'next'}));
  const hook=renderHook(({id})=>useLessonWhiteboard(id,null),{initialProps:{id:'lesson'}});hook.rerender({id:'next'});await waitFor(()=>expect(hook.result.current.board?.lessonId).toBe('next'));
  await act(async()=>old.resolve(context(board())));expect(hook.result.current.board?.lessonId).toBe('next');
 });
 it("does not let a reordered read overwrite an acknowledged control revision",async()=>{
  const delayed=deferred<unknown>();api.fetch.mockResolvedValueOnce(context(board())).mockReturnValueOnce(delayed.promise).mockResolvedValue(context(board(2)));api.update.mockResolvedValue(board(2));
  const hook=renderHook(()=>useLessonWhiteboard('lesson',null));await waitFor(()=>expect(hook.result.current.board).not.toBeNull());
  act(()=>{void hook.result.current.refresh();});await act(async()=>{await hook.result.current.update({background:'#fff8e8'});});await act(async()=>delayed.resolve(context(board())));
  expect(hook.result.current.board?.controlRevision).toBe(2);expect(hook.result.current.board?.background).toBe('#fff8e8');
 });
 it("keeps command failure visible while recovering canonical metadata",async()=>{
  api.fetch.mockResolvedValue(context(board()));api.update.mockRejectedValue(new Error('conflict'));
  const hook=renderHook(()=>useLessonWhiteboard('lesson',null));await waitFor(()=>expect(hook.result.current.board).not.toBeNull());await act(async()=>{await hook.result.current.update({clear:true});});
  expect(hook.result.current.error).toBe(true);expect(hook.result.current.board?.id).toBe('board');
 });
 it("does not create a board when selecting the material surface before first opening",async()=>{
  api.fetch.mockResolvedValue(context(null));const hook=renderHook(()=>useLessonWhiteboard('lesson',null));await waitFor(()=>expect(hook.result.current.enabled).toBe(true));await act(async()=>{await hook.result.current.update({activeSurface:'MATERIAL'});});expect(api.ensure).not.toHaveBeenCalled();
 });
});
