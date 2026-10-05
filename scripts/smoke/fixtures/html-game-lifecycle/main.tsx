import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useYjsWorkspace } from '../src/features/classroom/hooks/useYjsWorkspace';
import { LessonMaterialDocumentView } from '../src/features/materials/ui/LessonMaterialDocumentView';
import { storeTokens } from '../src/shared/api/auth';
import { i18n } from '../src/shared/i18n';
import '../src/styles.css';
import '../src/styles/materials.css';
import '../src/styles/classroom.css';
import '../src/styles/responsive.css';
storeTokens({ accessToken: 'synthetic-local-smoke', refreshToken: 'synthetic-local-smoke', expiresAt: Date.now()+3600000 });
const sockets: WebSocket[] = [];
let holdStops = false;
const NativeSocket = window.WebSocket;
window.WebSocket = class extends NativeSocket {
 constructor(url: string | URL, protocols?: string | string[]) { super(url, protocols); sockets.push(this); }
 send(data: Parameters<WebSocket["send"]>[0]) {
  if (holdStops && data instanceof Uint8Array && data[0] === 3) return;
  super.send(data);
 }
};
const params = new URLSearchParams(location.search);
const room = params.get('room')!;
const student = params.get('actor') === 'Student';
const standalone = params.has('standalone');
await i18n.changeLanguage(params.get('lang') || 'ru');
const doc = { id:room, lessonId:'synthetic', materialId:'game', documentKind:'MATERIAL', scope:'GROUP', yjsDocumentId:`lesson:synthetic:material:${room}:group:kind:MATERIAL`, version:1, createdAt:'',updatedAt:'' };
const material = { id:'game',title:'Synthetic lifecycle',description:null,language:'en',cefrLevel:'A2',visibility:'PRIVATE',status:'PUBLISHED',sourceMeta:{},scoringRubric:{},blockCount:1,createdAt:'',updatedAt:'', document:{schemaVersion:1,pages:[{id:'page',title:'Game',layout:'HTML_GAME',blocks:[{id:'game-block',type:'htmlGame',title:'Synthetic game',url:'material-asset:asset',height:640}]}]} };
(window as any).ticks = 0;
window.addEventListener('message', event => { if(event.data?.smokeTick) (window as any).ticks++; });
function App() {
 const workspace = useYjsWorkspace({document: standalone ? null : doc as any, color:student?'#2574ff':'#ff5c00', participantName:student?'Student':'Teacher', enabled:!standalone});
 const [version,setVersion] = useState(0);
 const [presentation,setPresentation] = useState("default");
 (window as any).smoke = { connected:standalone || workspace.connected, sync:workspace.htmlGameSync(!student), refresh:()=>setVersion(v=>v+1), snapshot:workspace.snapshot, holdStops:(value:boolean)=>holdStops=value, reconnect:()=>{holdStops=false;sockets.forEach(socket=>socket.close());} };
 return <main className="playsay-material-reader" data-presentation-mode={presentation} style={{height:'90vh',position:'relative',margin:8}} data-version={version}>
  <LessonMaterialDocumentView onPresentationModeChange={setPresentation} material={{...material, document:structuredClone(material.document)} as any} htmlGameSync={standalone?undefined:workspace.htmlGameSync(!student)} />
 </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
