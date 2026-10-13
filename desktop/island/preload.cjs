const {contextBridge,ipcRenderer}=require('electron');
const subscribe=(channel,callback)=>{const fn=(_,value)=>callback(value);ipcRenderer.on(channel,fn);return ()=>ipcRenderer.removeListener(channel,fn);};
contextBridge.exposeInMainWorld('monoIsland',Object.freeze({
  read:()=>ipcRenderer.invoke('island:read'),
  command:value=>ipcRenderer.invoke('island:command',value),
  navigate:value=>ipcRenderer.invoke('island:navigate',value),
  settings:key=>ipcRenderer.invoke('island:settings',key),
  city:value=>ipcRenderer.invoke('island:city',value),
  display:id=>ipcRenderer.invoke('island:display',id),
  hit:value=>ipcRenderer.send('island:hit',value),
  onState:fn=>subscribe('island:state',fn),onBlur:fn=>subscribe('island:blur',fn),onExpand:fn=>subscribe('island:expand',fn),onPointer:fn=>subscribe('island:pointer',fn)
}));
