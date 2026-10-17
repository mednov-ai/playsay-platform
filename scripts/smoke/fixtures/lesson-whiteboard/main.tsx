import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RoomContext } from '@livekit/components-react';
import { Room } from 'livekit-client';
import { MaterialLibraryList } from '../src/features/materials/ui/MaterialLibraryList';
import { LessonWhiteboard } from '../src/features/classroom/ui/LessonWhiteboard';
import { LessonWorkspace } from '../src/features/classroom/ui/LessonWorkspace';
import { SavedWhiteboardDialog } from '../src/features/classroom/ui/SavedWhiteboardDialog';
import { useLessonWhiteboard, useWhiteboardRuntime } from '../src/features/classroom/hooks/useLessonWhiteboard';
import { storeTokens } from '../src/shared/api/auth';
import { i18n } from '../src/shared/i18n/config';
import '../src/styles.css';
import '../src/styles/classroom.css';
import '../src/styles/materials.css';
import '../src/styles/responsive.css';
const params = new URLSearchParams(location.search), actor = params.get('actor') || 'teacher';
storeTokens({ accessToken: actor, expiresAt: Date.now() + 3600000 });
await i18n.changeLanguage(params.get('lang') || 'en'); document.documentElement.classList.toggle('dark', params.has('dark'));
const room = new Room();
function Observer({board,active}:any) { const state = useWhiteboardRuntime(board,actor,actor,active); (window as any).smoke = { board, state, runtime:state.runtime, t:(key:string)=>i18n.t(key), room }; return null; }
function App() {
 const [target,setTarget] = useState('learner-a'), [history,setHistory] = useState(false);
 const lessonId = params.get('lesson')!;
 const wb = useLessonWhiteboard(lessonId, params.has('parallel') && actor==='teacher' ? target : null);
 const teacher=actor==='teacher';
 if(params.has('library')) return <main style={{padding:8}}><MaterialLibraryList activeMaterialId={null} disabled={false} materials={[{id:'study',title:'Prepared library card',sourceMeta:{},isLessonMaterial:false,updatedAt:'2026-10-15'}, {id:'result',title:'Saved lesson card',sourceMeta:{},isLessonMaterial:true,updatedAt:'2026-10-15'}] as any} onCreateNew={()=>{}} onSelectMaterial={()=>{}}/></main>;
 const session:any={lessonId,identity:actor,participants:['learner-a','learner-b'].map(subject=>({subject,displayName:subject,materialId:null})),participantPresence:{},materialId:null,workMode:params.has('parallel')?'PARALLEL':'SHARED',teacherSubject:'teacher',teacherName:'Teacher',lessonTitle:'Synthetic lesson',lessonStartsAt:new Date().toISOString(),lessonEndsAt:new Date(Date.now()+3600000).toISOString(),lessonStatus:'IN_PROGRESS',mediaChoices:{},livekitUrl:'',token:''};
 return <RoomContext.Provider value={room}><main style={{maxWidth:1300,margin:'auto',padding:8}}>
  <button id="open" disabled={!teacher||wb.pending} onClick={()=>wb.present()}>Open fixture board</button>
  <button id="material" disabled={!teacher||wb.pending} onClick={()=>wb.update({activeSurface:'MATERIAL'})}>Material fixture</button>
  <button id="history" onClick={()=>setHistory(true)}>History fixture</button>
  {params.has('parallel')&&teacher?<select id="target" value={target} onChange={e=>setTarget(e.target.value)}><option>learner-a</option><option>learner-b</option></select>:null}
  {wb.error?<p role="alert">Control failed</p>:null}
  {params.has('shell') ? <LessonWorkspace displayName={actor} liveVocabulary={{practice:null,error:null} as any} materials={[]} onAssignMaterial={async()=>null} onPresentationModeChange={()=>{}} presentationMode="default" profile={{subject:actor,roles:[teacher?'TEACHER':'STUDENT']} as any} session={session}/> : wb.board?<div hidden={!wb.active}><LessonWhiteboard key={wb.board.document.id} board={wb.board} actor={actor} name={actor} active={wb.active} pending={wb.pending} onUpdate={command=>wb.update(command)} targetLabel={params.has('parallel')?target:i18n.t('whiteboard.group')}/></div>:null}
  {wb.board?<Observer key={wb.board.document.id} board={wb.board} active={wb.active}/>:null}
  {history&&wb.board?<SavedWhiteboardDialog lessonId={lessonId} boardId={wb.board.id} onClose={()=>setHistory(false)}/>:null}
 </main></RoomContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<App/>);
