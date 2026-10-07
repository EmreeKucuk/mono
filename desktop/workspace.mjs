import {sanitizeWorkspace} from '../public/state-schema.js';
export function createWorkspaceBridge(){
  let state=null;const versions=new Map(),fingerprints=new Map();
  const owners=()=>state?[{id:state.activeDeskId,layout:state},...state.desks.filter(d=>d.workspace).map(d=>({id:d.id,layout:d.workspace}))]:[];
  const locate=id=>owners().map(owner=>({...owner,widget:owner.layout.widgets.find(w=>w.id===id)})).find(owner=>owner.widget);
  const fingerprint=owner=>JSON.stringify({widget:owner.widget,events:owner.widget.type==='calendar'?owner.layout.events:[]});
  function publish(value){
    if(JSON.stringify(value).length>8000000)throw Error('Çalışma alanı çok büyük.');state=sanitizeWorkspace(value);
    for(const owner of owners())for(const widget of owner.layout.widgets){const current={...owner,widget},next=fingerprint(current);if(fingerprints.get(widget.id)!==next){versions.set(widget.id,(versions.get(widget.id)||0)+1);fingerprints.set(widget.id,next);}}
  }
  function read(id){const owner=locate(id);if(!owner)throw Error('Widget artık bu çalışma alanında yok.');return {version:versions.get(id),state:{...structuredClone(state),widgets:[structuredClone(owner.widget)],events:structuredClone(owner.layout.events),gridColumns:owner.layout.gridColumns,autoArrange:false,activeDeskId:'overlay',desks:[{id:'overlay',name:'Mini görünüm'}]},deskId:owner.id};}
  function commit(id,value){
    const owner=locate(id);if(!owner||value?.version!==versions.get(id))throw Object.assign(Error('Widget başka bir pencerede değişti. Yerel değişikliğin korunuyor; önce karşılaştır.'),{code:'CONFLICT'});
    if(value.widget?.id!==id||value.widget?.type!==owner.widget.type)throw Error('Geçersiz widget düzenlemesi.');
    const validated=sanitizeWorkspace({...read(id).state,widgets:[value.widget],events:owner.widget.type==='calendar'?value.events:owner.layout.events,deletedPages:[]});
    const additions=sanitizeWorkspace({...read(id).state,deletedPages:value.deletedPages||[]}).deletedPages.filter(p=>p.widgetId===id);
    Object.assign(owner.widget,validated.widgets[0]);if(owner.widget.type==='calendar')owner.layout.events=validated.events;
    state.deletedPages=[...state.deletedPages,...additions.filter(p=>!state.deletedPages.some(old=>old.id===p.id))].slice(-200);
    versions.set(id,versions.get(id)+1);fingerprints.set(id,fingerprint(owner));
    return {version:versions.get(id),widget:structuredClone(owner.widget),deskId:owner.id,events:structuredClone(owner.layout.events),deletedPages:additions};
  }
  return {publish,read,commit};
}
