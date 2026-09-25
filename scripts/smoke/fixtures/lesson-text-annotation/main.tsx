import React, { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LessonTaskCanvas } from '../src/features/classroom/ui/LessonTaskCanvas';
import { useYjsWorkspace } from '../src/features/classroom/hooks/useYjsWorkspace';
import { storeTokens } from '../src/shared/api/auth';
import '../src/shared/i18n/config';
import '../src/styles.css';
import '../src/styles/classroom.css';
import '../src/styles/materials.css';
import '../src/styles/responsive.css';
storeTokens({ accessToken: 'local-synthetic-test', refreshToken: 'local-synthetic-test', expiresAt: Date.now()+3600000 });
const params = new URLSearchParams(location.search);
const canvas = document.createElement('canvas');
canvas.width = params.has('portrait') ? 600 : 1000; canvas.height = params.has('portrait') ? 1000 : 600;
const ctx = canvas.getContext('2d')!; ctx.fillStyle='#f4f0df'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.strokeStyle='#349080'; ctx.lineWidth=5; ctx.strokeRect(30,30,canvas.width-60,canvas.height-60);
ctx.fillStyle='#20534e'; ctx.font='32px sans-serif'; ctx.fillText('Honey School — Text test',50,75);
const url = canvas.toDataURL(params.has('png') ? 'image/png' : 'image/jpeg');
const room = params.get('room') || 'text-test';
const doc = { id: room, lessonId: 'synthetic', materialId: 'image', documentKind: 'MATERIAL', scope: 'GROUP', yjsDocumentId: room, version: 1, createdAt:'', updatedAt:'' };
const material = { id:'image', title:'Text regression', document:{ schemaVersion:1,pages:[{id:'page-1',title:'Image',layout:'STATIC_IMAGE',blocks:[{id:'jpeg-1',type:params.has('generated')?'generatedImage':'image',title:'JPEG',url,objectFit:params.get('fit') || 'contain'}]},{id:'page-2',title:'Page',layout:'FLOW',blocks:[{id:'prompt',type:'text',content:'Second page'}]}]},description:null,language:'en',cefrLevel:'A2',visibility:'PRIVATE',status:'PUBLISHED',sourceMeta:{},scoringRubric:{},blockCount:2,createdAt:'',updatedAt:'' };
function App(){
 const workspace=useYjsWorkspace({document:doc,color:'#ff5c00',participantName:params.get('actor') || 'Teacher'});
 const [page,setPage]=useState('page-1');
 (window as any).smoke={elements:workspace.annotationElements,snapshot:workspace.snapshot, status:workspace.connected, addRemote:()=>workspace.setAnnotationElements(current=>[...current,{id:'remote',kind:'text',text:'Student note',pageId:'page-1',anchorId:'jpeg-1',x:550,y:550,width:150,height:60,fontSize:18,fill:'transparent',color:'#000',createdAt:2}])};
 return <><button id="switch-page" onClick={()=>setPage(page==='page-1'?'page-2':'page-1')}>Switch page</button><main style={{height:'85vh',display:'flex'}}><LessonTaskCanvas annotationSync={{elements:workspace.annotationElements,setElements:workspace.setAnnotationElements,ready:workspace.connected,participants:workspace.participants,updateCursor:workspace.updateCursor,undo:workspace.undoAnnotation,redo:workspace.redoAnnotation,canUndo:workspace.annotationUndoState.canUndo,canRedo:workspace.annotationUndoState.canRedo}} lessonId="synthetic" material={material as any} liveActivePageId={page} onSaveAnswers={()=>{}} score={null} submission={null} submissionMessage={null} submissionSaving={false} teacherName="Teacher" canControlPages /></main></>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
