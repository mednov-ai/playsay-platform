// @vitest-environment jsdom
import {fireEvent,render,screen,cleanup} from "@testing-library/react";
import {afterEach,describe,expect,it,vi} from "vitest";
import {CategorizedMaterialSelect} from "./CategorizedMaterialSelect";
import {isLessonMaterial} from "../model/materialCategory";
import type {LessonMaterial} from "../../../shared/api/types";
vi.mock("../../../shared/i18n",()=>({useAppTranslation:()=>({t:(key:string)=>key})}));
afterEach(cleanup);
const materials=[{id:'study',title:'Prepared',isLessonMaterial:false,sourceMeta:{}},{id:'lesson',title:'Result',isLessonMaterial:true,sourceMeta:{}}] as LessonMaterial[];
describe("material category selection",()=>{
 it("defaults to reusable materials and explicitly includes results",()=>{render(<CategorizedMaterialSelect materials={materials} value="" onChange={()=>{}}/>);expect(screen.queryByRole('option',{name:/Result/})).toBeNull();fireEvent.click(screen.getByRole('switch'));expect(screen.getByRole('option',{name:/Result/})).toBeTruthy();});
 it("keeps a selected lesson result resolvable when the filter hides others",()=>{render(<CategorizedMaterialSelect materials={materials} value="lesson" onChange={()=>{}}/>);expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('lesson');expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');});
 it("honors explicit manual false over historic provenance",()=>{expect(isLessonMaterial({isLessonMaterial:false,sourceMeta:{kind:'LIVE_LESSON_COPY'}})).toBe(false);expect(isLessonMaterial({sourceMeta:{kind:'LIVE_LESSON_COPY'}})).toBe(true);});
});
