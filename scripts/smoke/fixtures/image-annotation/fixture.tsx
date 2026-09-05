import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { LessonTaskCanvas } from '../../../../frontend/web-app/src/features/classroom/ui/LessonTaskCanvas';
import '../../../../frontend/web-app/src/shared/i18n/config';
import '../../../../frontend/web-app/src/styles.css';
import '../../../../frontend/web-app/src/styles/workspace.css';
import '../../../../frontend/web-app/src/styles/classroom.css';
import '../../../../frontend/web-app/src/styles/materials.css';
import '../../../../frontend/web-app/src/styles/responsive.css';

const params = new URLSearchParams(location.search);
const [width, height] = (params.get('size') ?? '600x1200').split('x').map(Number);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#e9f1cc" stroke="#333" stroke-width="8"/>${[.1,.25,.5,.75,.9].flatMap(x => [.1,.25,.5,.75,.9].map(y => `<circle cx="${width*x}" cy="${height*y}" r="6" fill="#174e79"/>`)).join('')}</svg>`;
const image = params.has('delayed') ? '/delayed-image.svg' : `data:image/svg+xml,${encodeURIComponent(svg)}`;
const room = params.get('room') ?? 'default';
const material = { id:'fixture', title:'Image geometry', language:'en', cefrLevel:'B1', visibility:'PRIVATE', status:'PUBLISHED', blockCount:2, document:{schemaVersion:1,pages:[{id:'page',title:'Geometry',layout:params.get('layout') ?? 'FLOW',blocks:[{id:'image-a',type:'image',title:'A',url:image,imageSize:'FULL',objectFit:params.get('fit') ?? 'contain'},{id:'image-b',type:'generatedImage',title:'B',url:image,imageSize:'FULL',objectFit:'contain'}]}]}};
function Fixture() {
  const [elements, updateElements] = useState(() => JSON.parse(localStorage.getItem(room) ?? '[]'));
  const elementsRef = useRef(elements);
  const [viewport, setViewport] = useState(null);
  const channel = useRef(null);
  const clientId = useRef(Math.floor(Math.random()*1000000));
  useEffect(() => {
    channel.current = new BroadcastChannel(room);
    channel.current.onmessage = ({data}) => {
      if (data.elements) { elementsRef.current = data.elements; updateElements(data.elements); }
      if (data.viewport) setViewport(data.viewport);
    };
    return () => channel.current.close();
  }, []);
  const setElements = (updater) => {
    const next = typeof updater === 'function' ? updater(elementsRef.current) : updater;
    elementsRef.current = next;
    localStorage.setItem(room,JSON.stringify(next));
    updateElements(next);
    channel.current.postMessage({elements:next});
  };
  const publish = (next) => {
    const revision=Date.now();
    const state={...next,revision,presentationRevision:revision,sourceClientId:clientId.current};
    setViewport(state);
    channel.current.postMessage({viewport:state});
  };
  const [mode, setMode] = useState('default');
  window.fixtureElements = elements;
  window.fixtureSetElements = setElements;
  window.fixtureSvg = svg;
  return <div className="playsay-workbench" data-presentation-mode={mode} style={{height:'100dvh',width:'100%',minHeight:0}}><LessonTaskCanvas lessonId="synthetic" material={material} annotationSync={{elements,setElements,participants:[],ready:true,updateCursor:()=>{}}} viewportSync={params.has("shared") ? {clientId:clientId.current,publish,state:viewport,ready:true} : undefined} canControlPages onPresentationModeChange={setMode} onSaveAnswers={()=>{}} score={null} submission={null} submissionMessage={null} submissionSaving={false} teacherName="Fixture"/></div>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
