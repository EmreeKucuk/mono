const {contextBridge,ipcRenderer}=require('electron');
const origin=process.argv.find(value=>value.startsWith('--mono-origin='))?.slice(14);
if(window.location.origin===origin){
  const invoke=(action,value)=>ipcRenderer.invoke('mono:'+action,value);
  contextBridge.exposeInMainWorld('monoDesktop',Object.freeze({
    overlayId:process.argv.find(value=>value.startsWith('--mono-overlay='))?.slice(15)||null,
    workspace:{publish:state=>invoke('workspace-publish',state),open:id=>invoke('workspace-open',id),read:()=>invoke('workspace-read'),commit:value=>invoke('workspace-commit',value),top:value=>invoke('overlay-top',value),close:()=>invoke('overlay-close'),onChange:callback=>{const fn=(_,value)=>callback(value);ipcRenderer.on('mono:overlay-state',fn);return ()=>ipcRenderer.removeListener('mono:overlay-state',fn);},onEdit:callback=>{const fn=(_,value)=>callback(value);ipcRenderer.on('mono:overlay-edit',fn);return ()=>ipcRenderer.removeListener('mono:overlay-edit',fn);}},
    platform:process.platform,version:1,appVersion:process.argv.find(value=>value.startsWith('--mono-version='))?.slice(15)||'Bilinmiyor',
    clipboard:{cloudAction:value=>invoke('clipboard-cloud-action',value),onAction:callback=>{const fn=(_,value)=>callback(value);ipcRenderer.on('mono:clipboard-action',fn);return ()=>ipcRenderer.removeListener('mono:clipboard-action',fn);},configure:value=>invoke('clipboard-configure',value),copyText:text=>invoke('clipboard-copy-text',text),list:()=>invoke('clipboard-list'),watch:enabled=>invoke('clipboard-watch',enabled),copy:id=>invoke('clipboard-copy',id),remove:id=>invoke('clipboard-remove',id),pin:id=>invoke('clipboard-pin',id),clear:()=>invoke('clipboard-clear'),capture:()=>invoke('clipboard-capture'),onChange:callback=>{const listener=()=>invoke('clipboard-list').then(callback).catch(()=>{});ipcRenderer.on('mono:clipboard-changed',listener);return ()=>ipcRenderer.removeListener('mono:clipboard-changed',listener);}},
    updates:{status:()=>invoke('update-status'),check:()=>invoke('update-check'),install:()=>invoke('update-install',true),onChange:callback=>{const listener=(_,value)=>callback(value);ipcRenderer.on('mono:update-changed',listener);return ()=>ipcRenderer.removeListener('mono:update-changed',listener);}},
    reminders:{sync:items=>invoke('reminders',items)},
    zone:policy=>invoke('zone',policy),
    notify:message=>invoke('notify',message),
    notificationSettings:()=>invoke('notification-settings')
  }));
}
