import {app,BrowserWindow,ipcMain,clipboard,Notification,Tray,Menu,nativeImage,shell,safeStorage,session} from 'electron';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import electronUpdater from 'electron-updater';
import {createUpdateController} from './updates.mjs';
import {createWorkspaceBridge} from './workspace.mjs';
import {clipboardItems} from '../public/clipboard-model.js';
import {createClipboardController} from './clipboard.mjs';
import {appOrigin,validPolicy,canNotify,validReminders} from './policy.mjs';
const folder=dirname(fileURLToPath(import.meta.url));
const origin=appOrigin(process.env.MONO_APP_URL||'https://mono-rho-eight.vercel.app');
if(process.env.MONO_DESKTOP_DATA_DIR)app.setPath('userData',resolve(process.env.MONO_DESKTOP_DATA_DIR));
app.setAppUserModelId('com.mono.dashboard');
const primary=app.requestSingleInstanceLock();if(!primary)app.quit();
app.on('second-instance',()=>{win?.show();win?.focus();});
let updates;
const overlays=new Map(),workspaceBridge=createWorkspaceBridge();
const sendClipboard=()=>{for(const window of [win,...overlays.values()])if(window&&!window.isDestroyed())window.webContents.send('mono:clipboard-changed');};
let win,tray,quitting=false,history={enabled:true,items:[]},reminders=[],delivered=new Set(),policy={active:false,until:0,allowed:[]},saving=Promise.resolve(),storageError='',clipboardError='';
const historyState=()=>({...history,durable:!storageError&&safeStorage.isEncryptionAvailable(),error:clipboardError||storageError});
const historyPath=()=>resolve(app.getPath('userData'),'clipboard.encrypted');
function persistHistory(){
  saving=saving.catch(()=>{}).then(async()=>{
    if(!safeStorage.isEncryptionAvailable()){storageError='Windows şifrelemesi kullanılamıyor; geçmiş sadece bellekte tutuluyor.';return;}
    await mkdir(app.getPath('userData'),{recursive:true});
    await writeFile(historyPath()+'.tmp',safeStorage.encryptString(JSON.stringify({...history,delivered:[...delivered].slice(-2000)})),{flush:true});
    await rename(historyPath()+'.tmp',historyPath());storageError='';
  }).catch(error=>{
    storageError='Şifreli cihaz kaydı başarısız; geçmiş bellekte tutuluyor.';sendClipboard();throw error;
  });
  win?.webContents.send('mono:clipboard-changed');return saving;
}
const clipboardController=createClipboardController({clipboard,getHistory:()=>history,persist:persistHistory});
function clipboardStatus(error){
  const message=error?'Pano okunamadı; otomatik yakalama yeniden deneyecek.':'';
  if(message!==clipboardError){clipboardError=message;win?.webContents.send('mono:clipboard-changed');}
}
async function capture(options){
  try{await clipboardController.capture(options);clipboardStatus(null);}
  catch(error){clipboardStatus(error);throw error;}
}
function authorize(event){
  const owner=[win,...overlays.values()].find(w=>w?.webContents===event.sender);
  if(!owner||event.senderFrame!==owner.webContents.mainFrame||new URL(event.senderFrame.url).origin!==origin)throw Error('Yetkisiz masaüstü isteği.');
}
const handle=(name,fn)=>ipcMain.handle('mono:'+name,(event,input)=>{authorize(event);return fn(input,event);});
function notify(input){
  if(!canNotify(policy,input?.category||'reminder'))return false;
  if(!Notification.isSupported())return false;
  const notification=new Notification({title:String(input?.title||'MONO').slice(0,100),body:String(input?.body||'').slice(0,300)});
  notification.on('click',()=>{win.show();win.focus();});notification.show();return true;
}
function spotifyAuth(url){
  const auth=new BrowserWindow({width:520,height:740,parent:win,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  auth.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  auth.webContents.on('will-navigate',(event,target)=>{if(![origin,'https://accounts.spotify.com'].includes(new URL(target).origin))event.preventDefault();});
  auth.webContents.on('did-navigate',(_,target)=>{if(new URL(target).origin===origin){win.loadURL(target);auth.close();}});
  auth.loadURL(url);
}
async function start(){
await app.whenReady();
try{history=JSON.parse(safeStorage.decryptString(await readFile(historyPath())));if(!Array.isArray(history.items))throw Error();delivered=new Set(Array.isArray(history.delivered)?history.delivered.filter(id=>typeof id==='string').slice(-2000):[]);history={enabled:true,days:[0,1,3,7,30].includes(history.days)?history.days:3,items:history.items.filter(i=>typeof i?.id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(i.id)&&typeof i.text==='string'&&Number.isFinite(i.at)).slice(0,100).map(i=>({id:i.id,text:i.text.slice(0,20000),at:i.at,pinned:i.pinned===true}))};}catch{history={enabled:true,items:[]};}
session.defaultSession.setPermissionRequestHandler((contents,permission,callback,details)=>callback(contents===win?.webContents&&new URL(details.requestingUrl||contents.getURL()).origin===origin&&['notifications','clipboard-sanitized-write'].includes(permission)));
win=new BrowserWindow({width:1320,height:900,minWidth:320,minHeight:450,title:'MONO '+app.getVersion(),icon:resolve(folder,'icon.png'),backgroundColor:'#111312',autoHideMenuBar:true,show:process.env.MONO_DESKTOP_TEST!=='1',webPreferences:{preload:resolve(folder,'preload.cjs'),additionalArguments:['--mono-origin='+origin,'--mono-version='+app.getVersion()],nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,backgroundThrottling:false}});
win.on('page-title-updated',event=>{event.preventDefault();win.setTitle('MONO '+app.getVersion());});
win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//.test(url))shell.openExternal(url);return {action:'deny'};});
win.webContents.on('will-navigate',(event,url)=>{
  if(new URL(url).origin===origin)return;
  event.preventDefault();if(new URL(url).origin==='https://accounts.spotify.com')spotifyAuth(url);else if(/^https?:\/\//.test(url))shell.openExternal(url);
});
win.on('close',event=>{if(!quitting){event.preventDefault();win.hide();}});
win.webContents.on('did-fail-load',(_,code,message,url,isMain)=>{if(isMain&&code!==-3)win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<html lang="tr"><body style="background:#111312;color:#eee;font:16px system-ui;padding:40px"><h1>MONO yüklenemedi</h1><p>Bağlantını ve yayın adresini kontrol edip uygulamayı yeniden aç.</p></body></html>'));});
const image=nativeImage.createFromPath(resolve(folder,'icon.png')).resize({width:24,height:24});
tray=new Tray(image);tray.setToolTip('MONO '+app.getVersion());tray.setContextMenu(Menu.buildFromTemplate([{label:'MONO’yu aç',click:()=>{win.show();win.focus();}},{label:'Çıkış',click:()=>{quitting=true;app.quit();}}]));tray.on('double-click',()=>{win.show();win.focus();});
updates=createUpdateController({updater:electronUpdater.autoUpdater,enabled:app.isPackaged&&process.env.MONO_DESKTOP_TEST!=='1',version:app.getVersion(),
  publish:value=>{if(win&&!win.isDestroyed())win.webContents.send('mono:update-changed',value);},
  prepareQuit:async()=>{await saving;if(storageError)throw Error('Clipboard kaydı tamamlanamadı. Önce kayıt sorununu çöz.');},
  install:()=>{quitting=true;try{electronUpdater.autoUpdater.quitAndInstall(false,true);}catch(error){quitting=false;throw error;}}
});
electronUpdater.autoUpdater.on('error',()=>{quitting=false;});
handle('update-status',()=>updates.status());
handle('update-check',()=>updates.check());
handle('update-install',async(confirmed,event)=>{if(event.sender!==win.webContents)throw Error('Ana pencereden güncelle.');if(confirmed!==true)throw Error('Yeniden başlatma onayı gerekli.');await updates.restart();return true;});
const updateTimer=setInterval(()=>updates.check(),4*60*60*1000);updateTimer.unref();
win.webContents.on('did-finish-load',()=>updates.check());
handle('clipboard-configure',async input=>{if(![0,1,3,7,30].includes(input?.days))throw Error('Geçersiz saklama süresi.');history.days=input.days;history.items=clipboardItems(history.items,input.days);await persistHistory();return historyState();});
handle('clipboard-cloud-action',value=>{if(!['remove','pin'].includes(value?.kind)||typeof value.text!=='string'||value.text.length>20000||value.kind==='pin'&&typeof value.pinned!=='boolean')throw Error('Geçersiz clipboard işlemi.');win.webContents.send('mono:clipboard-action',{kind:value.kind,text:value.text,pinned:value.pinned===true,at:Date.now()});return true;});
handle('clipboard-copy-text',async text=>{if(typeof text!=='string'||text.length>20000)throw Error('Geçersiz pano metni.');await clipboard.writeText(text);return true;});
handle('workspace-publish',(value,event)=>{
  if(event.sender!==win.webContents)throw Error('Yalnızca ana pencere çalışma alanını yayınlayabilir.');workspaceBridge.publish(value);
  for(const [id,window] of overlays){try{window.webContents.send('mono:overlay-state',workspaceBridge.read(id));}catch{window.close();}}
});
handle('workspace-read',(_,event)=>{const id=[...overlays].find(([,window])=>window.webContents===event.sender)?.[0];if(!id)throw Error('Mini pencere bulunamadı.');return workspaceBridge.read(id);});
handle('workspace-commit',(value,event)=>{const id=[...overlays].find(([,window])=>window.webContents===event.sender)?.[0];if(!id)throw Error('Mini pencere bulunamadı.');const result=workspaceBridge.commit(id,value);win.webContents.send('mono:overlay-edit',result);return result;});
handle('workspace-open',async(id,event)=>{
  if(event.sender!==win.webContents)throw Error('Mini pencereyi ana pencereden aç.');const data=workspaceBridge.read(id),existing=overlays.get(id);if(existing){existing.show();existing.focus();return;}
  const prefs=data.state.settings,window=new BrowserWindow({width:prefs.overlayWidth,height:prefs.overlayHeight,minWidth:280,minHeight:240,resizable:true,alwaysOnTop:true,title:data.state.widgets[0].title+' · MONO',autoHideMenuBar:true,backgroundColor:'#111312',icon:resolve(folder,'icon.png'),webPreferences:{preload:resolve(folder,'preload.cjs'),additionalArguments:['--mono-origin='+origin,'--mono-version='+app.getVersion(),'--mono-overlay='+id],nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,backgroundThrottling:false}});
  overlays.set(id,window);window.on('page-title-updated',event=>{event.preventDefault();window.setTitle(data.state.widgets[0].title+' · MONO');});window.on('closed',()=>overlays.delete(id));window.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//.test(url))shell.openExternal(url);return {action:'deny'};});window.webContents.on('will-navigate',(e,url)=>{if(new URL(url).origin!==origin)e.preventDefault();});await window.loadURL(origin);
});
handle('overlay-top',(value,event)=>{const window=[...overlays.values()].find(w=>w.webContents===event.sender);if(!window||typeof value!=='boolean')throw Error('Geçersiz mini pencere.');window.setAlwaysOnTop(value);return value;});
handle('overlay-close',(_,event)=>{const window=[...overlays.values()].find(w=>w.webContents===event.sender);window?.close();});
handle('clipboard-list',historyState);
handle('clipboard-watch',async enabled=>{if(typeof enabled!=='boolean')throw Error('Geçersiz pano ayarı.');history.enabled=true;await persistHistory();await capture();return historyState();});
handle('clipboard-capture',async()=>{await capture();return historyState();});
handle('clipboard-copy',id=>clipboardController.copy(id));
handle('clipboard-remove',id=>{history.items=history.items.filter(item=>item.id!==id);return persistHistory().then(historyState);});
handle('clipboard-pin',id=>{const item=history.items.find(item=>item.id===id);if(item)item.pinned=!item.pinned;return persistHistory().then(historyState);});
handle('clipboard-clear',async()=>{await clipboardController.clear();return historyState();});
handle('zone',input=>{policy=validPolicy(input);return policy;});
handle('reminders',input=>{reminders=validReminders(input);return true;});
handle('notify',notify);
handle('notification-settings',()=>process.platform==='win32'?shell.openExternal('ms-settings:notifications'):false);
setInterval(()=>{if(history.enabled)capture({automatic:true}).catch(()=>{});for(const item of reminders){if(item.at<=Date.now()&&!delivered.has(item.id)&&canNotify(policy,'reminder')){if(notify({title:'MONO · Hatırlatma',body:item.text,category:'reminder'})){delivered.add(item.id);persistHistory().catch(()=>{});}}}},750);
app.on('before-quit',()=>{quitting=true;});
await win.loadURL(origin);
}
if(primary)start().catch(error=>{console.error('MONO başlatılamadı:',error.message);app.exit(1);});
