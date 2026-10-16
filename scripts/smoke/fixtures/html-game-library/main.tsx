import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HtmlGameLibraryPanel } from '../src/features/games/ui/HtmlGameLibraryPanel';
import { LessonLibraryGameStage } from '../src/features/games/ui/LessonLibraryGameStage';
import { useLessonLibraryGame } from '../src/features/games/hooks/useLessonLibraryGame';
import { LessonMaterialDocumentView } from '../src/features/materials/ui/LessonMaterialDocumentView';
import { subscribeLessonClockResume } from '../src/features/classroom/model/lessonClockResume';
import { storeTokens } from '../src/shared/api/auth';
import { i18n } from '../src/shared/i18n';
import '../src/styles.css';
import '../src/styles/materials.css';
import '../src/styles/classroom.css';
storeTokens({accessToken:'synthetic-local-smoke',refreshToken:'synthetic-local-smoke',expiresAt:Date.now()+3600000});
const params = new URLSearchParams(location.search);
const lesson = params.get('room')!;
const student = params.get('actor') === 'Student';
await i18n.changeLanguage(params.get('lang') || 'ru');
document.documentElement.classList.toggle('dark', params.has('dark'));
function App() {
 const state = useLessonLibraryGame(lesson,true);
 const [clockResumes,setClockResumes] = useState(0);
 useEffect(()=>subscribeLessonClockResume(()=>setClockResumes(value=>value+1)),[]);
 const [minimized,setMinimized] = useState(false);
 const [material,setMaterial] = useState<any>(null);
 (window as any).smoke = {refresh:state.refresh,launch:state.launch,showMaterial:setMaterial};
 return <main className="space-y-4 bg-background p-3 text-foreground" style={{minHeight:'100dvh'}}>
  <output data-testid="clock-resumes">{clockResumes}</output>
  {!student ? <HtmlGameLibraryPanel onSelect={params.has("catalog") ? undefined : async game=>{await state.start(game);setMinimized(false);}} selectLabelKey="games.start" onMaterialSaved={()=>{}} /> : null}
  <div hidden={Boolean(state.launch)&&!minimized}><label>Material draft<textarea aria-label="Material draft" defaultValue="Keep my annotation" /></label>{material ? <LessonMaterialDocumentView material={material} mode="teacherPreview" /> : <p data-testid="video-only">Video-only lesson</p>}</div>
  {state.launch ? <LessonLibraryGameStage key={state.launch.id} launch={state.launch} authority={state.canControl} protocolReady={state.protocolReady} name={student?'Student':'Teacher'} minimized={minimized} onMinimize={setMinimized} onStop={()=>state.stop(state.launch!.id)} /> : null}
 </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
