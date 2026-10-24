const {contextBridge,ipcRenderer,webUtils}=require('electron');
const subscribe=(channel,callback)=>{const fn=(_,value)=>callback(value);ipcRenderer.on(channel,fn);return ()=>ipcRenderer.removeListener(channel,fn);};
contextBridge.exposeInMainWorld('monoIsland',Object.freeze({
  read:()=>ipcRenderer.invoke('island:read'),
  command:value=>ipcRenderer.invoke('island:command',value),
  navigate:value=>ipcRenderer.invoke('island:navigate',value),
  settings:key=>ipcRenderer.invoke('island:settings',key),
  city:value=>ipcRenderer.invoke('island:city',value),
  display:id=>ipcRenderer.invoke('island:display',id),
  hit:value=>ipcRenderer.send('island:hit',value),
  openWidget:id=>ipcRenderer.invoke('island:open-widget',id),
  convertFile:value=>ipcRenderer.invoke('island:convert-file',value),
  showFile:path=>ipcRenderer.invoke('island:show-file',path),
  setMicroMode:value=>ipcRenderer.invoke('island:micro-mode',value),
  setFocusMode:value=>ipcRenderer.invoke('island:focus-mode',value),
  setFocusSettings:value=>ipcRenderer.invoke('island:focus-settings',value),
  getPathForFile:file=>{try{return webUtils&&typeof webUtils.getPathForFile==='function'?webUtils.getPathForFile(file):(file?.path||'');}catch{return file?.path||'';}},
  onState:fn=>subscribe('island:state',fn),onBlur:fn=>subscribe('island:blur',fn),onExpand:fn=>subscribe('island:expand',fn),onPointer:fn=>subscribe('island:pointer',fn)
}));
