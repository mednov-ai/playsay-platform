// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {MaterialLibraryList} from "./MaterialLibraryList";
import type {LessonMaterial} from "../../../shared/api/types";
vi.mock("../../../shared/i18n",()=>({useAppTranslation:()=>({t:(key:string)=>key,i18n:{language:'en'}})}));
vi.mock("../../../shared/api/whiteboard",()=>({fetchWhiteboardLibrary:async()=>[{id:'board-id',lessonId:'lesson-id',title:'Board topic',kind:'LESSON_WHITEBOARD',createdAt:'2026-10-16',updatedAt:'2026-10-16'}]}));
vi.mock("../../classroom/ui/SavedWhiteboardDialog",()=>({SavedWhiteboardDialog:({boardId,lessonId}:{boardId:string;lessonId:string})=><div role="dialog" data-board={boardId} data-lesson={lessonId}/> }));
beforeEach(()=>sessionStorage.clear());afterEach(cleanup);
it("filters full material results and opens the same read-only board without assigning it",async()=>{
 const select=vi.fn(),materials=[{id:'study',title:'Prepared',sourceMeta:{},isLessonMaterial:false,updatedAt:'2026-10-15'},{id:'result',title:'Lesson result',sourceMeta:{},isLessonMaterial:true,updatedAt:'2026-10-15'}] as LessonMaterial[];
 render(<MaterialLibraryList activeMaterialId={null} disabled={false} materials={materials} onCreateNew={()=>{}} onSelectMaterial={select}/>);
 expect(screen.getByText('Prepared')).toBeTruthy();expect(screen.queryByText('Lesson result')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'lessonMaterials.lesson'}));await screen.findByText(/Board topic/);expect(screen.queryByText('Prepared')).toBeNull();expect(screen.getByText('Lesson result')).toBeTruthy();
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'Board topic'}});expect(screen.queryByText('Lesson result')).toBeNull();fireEvent.click(screen.getByRole('button',{name:/Board topic/}));const dialog=await screen.findByRole('dialog');expect(dialog.getAttribute('data-board')).toBe('board-id');expect(dialog.getAttribute('data-lesson')).toBe('lesson-id');expect(select).not.toHaveBeenCalled();
});
