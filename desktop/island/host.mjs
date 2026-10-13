import {app,BrowserWindow,ipcMain,screen,shell,powerMonitor,globalShortcut} from 'electron';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {EMPTY_SYSTEM,workspaceSummary,islandBounds,insideSurface} from './model.mjs';
import {startSystemBridge} from './system.mjs';
const directory=dirname(fileURLToPath(import.meta.url));
export async function installIsland({main,origin,test=false}){
  const file=resolve(app.getPath('userData'),'island.json');let prefs={enabled:true,displayId:null,city:'',theme:'graphite'},weather=null,weatherError='',weatherBusy=false,stopped=false,saveQueue=Promise.resolve();
  try{const saved=JSON.parse(await readFile(file,'utf8'));prefs={enabled:saved.enabled!==false,displayId:Number.isInteger(saved.displayId)?saved.displayId:null,city:typeof saved.city==='string'?saved.city.slice(0,80):'',theme:saved.theme==='navy'?'navy':'graphite'};if(saved.weather&&Number.isFinite(saved.weather.temperature)&&typeof saved.weather.city==='string')weather=saved.weather;}catch{}
  const persist=()=>{saveQueue=saveQueue.catch(()=>{}).then(async()=>{await mkdir(dirname(file),{recursive:true});await writeFile(file+'.tmp',JSON.stringify({...prefs,weather}));await rename(file+'.tmp',file);});saveQueue.catch(()=>{});return saveQueue;};
  const window=new BrowserWindow({width:584,height:660,frame:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,resizable:false,maximizable:false,minimizable:false,skipTaskbar:true,alwaysOnTop:true,show:false,title:'MONO Island',webPreferences:{preload:resolve(directory,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,backgroundThrottling:false}});
  // Electron's default "floating" level moves behind the Windows taskbar,
  // which can demote the Island when the taskbar itself is not topmost.
  const keepAbove=()=>{if(!window.isDestroyed())window.setAlwaysOnTop(true,'pop-up-menu');};
  keepAbove();window.on('show',keepAbove);
  const localURL=pathToFileURL(resolve(directory,'index.html')).href;
  let summary={desk:'Kişisel alan',events:[]},system={...EMPTY_SYSTEM},ready=false,interactive=false,hit={x:162,y:8,width:260,height:54};
  const displays=()=>screen.getAllDisplays().map(d=>({id:d.id,name:d.label||`Ekran ${d.id}`}));
  const status=()=>({enabled:prefs.enabled,visible:prefs.enabled&&ready&&!window.isDestroyed()&&window.isVisible(),city:prefs.city,displayId:prefs.displayId});
  const notifyMain=()=>{if(!main.isDestroyed())main.webContents.send('mono:island-status',status());};
  const snapshot=()=>({theme:prefs.theme,city:prefs.city,weather,weatherError,weatherBusy,summary,system,displays:displays(),displayId:prefs.displayId});
  const publish=()=>{if(ready&&!window.isDestroyed())window.webContents.send('island:state',snapshot());};
  const place=()=>{const display=screen.getAllDisplays().find(d=>d.id===prefs.displayId)||screen.getPrimaryDisplay();prefs.displayId=display.id;window.setBounds(islandBounds(display));keepAbove();publish();};place();
  const refresh=async()=>{
    if(weatherBusy||!prefs.city||stopped)return;
    weatherBusy=true;publish();const city=prefs.city;
    try{const response=await fetch(origin+'/api/weather?city='+encodeURIComponent(city),{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error();const data=await response.json();if(!Number.isFinite(data.temperature)||typeof data.city!=='string'||JSON.stringify(data).length>100000)throw Error();if(prefs.city===city){weather={...data,updatedAt:Date.now()};weatherError='';await persist();}}
    catch{if(prefs.city===city)weatherError='Hava durumu güncellenemedi. Son bilgi gösteriliyor.';}
    finally{weatherBusy=false;publish();if(city!==prefs.city)void refresh();}
  };
  const isIsland=event=>event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame&&event.senderFrame.url===localURL;
  const isMain=event=>event.sender===main.webContents&&event.senderFrame===main.webContents.mainFrame&&new URL(event.senderFrame.url).origin===origin;
  const handlers=[];function handle(name,authorize,fn){ipcMain.handle(name,(event,value)=>{if(!authorize(event))throw Error('Yetkisiz Island isteği.');return fn(value);});handlers.push(name);}
  const settingsLinks={wifi:'ms-settings:network-wifi',bluetooth:'ms-settings:bluetooth',sound:'ms-settings:sound'};
  const navigate=value=>{if(!['board','calendar','capture','zone'].includes(value?.view))throw Error('Geçersiz görünüm.');main.show();main.focus();main.webContents.send('mono:island-navigate',{view:value.view,date:/^\d{4}-\d{2}-\d{2}$/.test(value.date)?value.date:null});};
  let native=test||process.platform!=='win32'?null:startSystemBridge({executable:app.isPackaged?resolve(process.resourcesPath,'native','Mono.System.exe'):resolve(directory,'../../.runtime-cache/native-publish/Mono.System.exe'),publish:value=>{system=value;publish();}});
  handle('island:read',isIsland,snapshot);
  handle('island:command',isIsland,value=>native?native.command(value):Promise.reject(Error('Windows kontrolleri bu ortamda kullanılamıyor.')));
  handle('island:navigate',isIsland,navigate);
  handle('island:settings',isIsland,key=>{if(!Object.hasOwn(settingsLinks,key))throw Error('Geçersiz ayar.');return shell.openExternal(settingsLinks[key]);});
  handle('island:city',isIsland,async city=>{if(typeof city!=='string'||city.trim().length<2||city.length>80)throw Error('Şehir adı 2–80 karakter olmalı.');prefs.city=city.trim();weather=null;weatherError='';await persist();main.webContents.send('mono:island-city',prefs.city);await refresh();return snapshot();});
  handle('island:display',isIsland,async id=>{if(!screen.getAllDisplays().some(d=>d.id===id))throw Error('Ekran bulunamadı.');prefs.displayId=id;place();await persist();return snapshot();});
  handle('mono:island-status',isMain,status);
  handle('mono:island-toggle',isMain,()=>toggle());
  handle('mono:island-sync',isMain,value=>{let changed=false;if(['graphite','navy'].includes(value?.theme)&&prefs.theme!==value.theme){prefs.theme=value.theme;changed=true;}if(typeof value?.city==='string'&&value.city.length>=2&&value.city.length<=80&&prefs.city!==value.city){prefs.city=value.city;weather=null;changed=true;void refresh();}if(changed){void persist();publish();}return status();});
  const hitListener=(event,value)=>{if(!isIsland(event)||!value||!['x','y','width','height'].every(k=>Number.isFinite(value[k])))return;const b=window.getBounds();if(value.width<100||value.width>b.width||value.height<30||value.height>b.height||value.x<0||value.y<0||value.x+value.width>b.width+1||value.y+value.height>b.height+1)return;hit=value;};ipcMain.on('island:hit',hitListener);
  window.setMenu(null);window.webContents.setVisualZoomLevelLimits(1,1).catch(()=>{});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
  window.webContents.on('did-finish-load',()=>{ready=true;publish();if(prefs.enabled&&!test)window.showInactive();notifyMain();});
  window.webContents.on('render-process-gone',()=>{ready=false;window.hide();notifyMain();});
  window.on('blur',()=>window.webContents.send('island:blur'));
  const pointer=setInterval(()=>{if(!prefs.enabled||!ready||window.isDestroyed())return;const inside=insideSurface(screen.getCursorScreenPoint(),window.getBounds(),hit);if(inside!==interactive){interactive=inside;window.setIgnoreMouseEvents(!inside,{forward:true});window.webContents.send('island:pointer',inside);}},32);pointer.unref();window.setIgnoreMouseEvents(true,{forward:true});
  const toggle=()=>{prefs.enabled=!prefs.enabled;if(prefs.enabled&&ready)window.showInactive();else window.hide();void persist();notifyMain();return status();};
  const show=()=>{if(!prefs.enabled)toggle();window.show();window.focus();window.webContents.send('island:expand');};
  const resume=()=>{place();void refresh();publish();};
  screen.on('display-metrics-changed',place);screen.on('display-removed',place);screen.on('display-added',place);powerMonitor.on('resume',resume);
  const shortcut=globalShortcut.register('CommandOrControl+Alt+I',show);
  const timer=setInterval(refresh,1800000);timer.unref();
  const stop=()=>{if(stopped)return;stopped=true;clearInterval(pointer);clearInterval(timer);native?.stop();screen.removeListener('display-metrics-changed',place);screen.removeListener('display-removed',place);screen.removeListener('display-added',place);powerMonitor.removeListener('resume',resume);ipcMain.removeListener('island:hit',hitListener);handlers.forEach(channel=>ipcMain.removeHandler(channel));if(shortcut)globalShortcut.unregister('CommandOrControl+Alt+I');if(!window.isDestroyed())window.destroy();};
  window.on('close',event=>{if(!stopped){event.preventDefault();if(prefs.enabled)toggle();}});
  window.on('closed',stop);app.once('before-quit',stop);
  await window.loadFile(resolve(directory,'index.html'));void refresh();
  return {publishWorkspace:state=>{summary=workspaceSummary(state);publish();},toggle,show,stop,window};
}
