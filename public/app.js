import {preferences} from './preferences.js';
import {installSettings,openAccountMenu,openDeskList} from './settings.js';
import {trashPage} from './recycle-bin.js';
import {configureClipboard} from './clipboard-widget.js';
import {renderDrawing,bindDrawing} from './drawing.js';
import {isOverlay,publishWorkspace,startOverlay,overlayChanged,bindOverlayButton,hasOverlayPending} from './overlay.js';
import {bindDesktopUpdates,installDesktopUpdates} from './desktop-updates.js';
import {bindDashboard,installDashboard,syncDashboard,dashboardNotification} from './dashboard-features.js';
import {bindWeather} from './weather.js';
import {flushEncryption,hasPendingEncryption} from './note-vault.js';
import { patchGrid } from './grid-view.js';
import {ensureDesks,switchDesk,addDesk} from './desks.js';
import { installWidgetShortcuts,refreshWidgetShortcuts } from './widget-shortcuts.js';
import { renderCalendar } from './calendar-view.js';
import { renderShell } from './shell-view.js';
import {stopSpotifyBrowser} from './spotify-account.js';
import { askName } from './name-dialog.js';
import { compactAroundLarge,applyLayout,collapseFour,arrange,snapSpan } from './grid-layout.js';
import { normalizeGrid,gridStyle,rowCount,bindGrid,disposeGrid,appendGridWidget,changeColumns,pointSlot } from './grid-layout.js';
import { installWidgetSearch } from './widget-search.js';
import { renderNotebook,bindNotebook,forgetNotebook } from './notebook.js';
import { extraTypes,renderExtra,bindExtra } from './extra-widgets.js';
import { renderTaskGroups,bindTaskGroups } from './task-groups.js';
import { configured,offline,current,signIn,signUp,signOut,loadWorkspace,saveWorkspace,stageWorkspace,hasPendingDraft,reloadRemoteWorkspace,refreshWorkspace } from './cloud.js';
import { sanitizeWorkspace } from './state-schema.js';
import { $,uid,escape,icon,dateKey } from './ui-utils.js';
import { captureFocus,restoreFocus } from './focus-state.js';
const today=dateKey(new Date()), types={
  drawing:['Çizim','Kalem, silgi, highlighter ve metin'],tasks:['Yapılacaklar','Bir sonraki adımın'],note:['Notlar','Sayfalar, başlıklar ve hızlı komutlar'],calendar:['Takvim','Günlerini planla'],focus:['Odak sayacı','Tek bir şeye odaklan'],...extraTypes
};
let updatePrepared=false;
let user=null,view='board',toolbox=false,register=false,saveTimer,saveQueue=Promise.resolve(),saving=false,dirty=false,conflicted=false,revision=0,selectedDate=today,month=new Date(new Date().getFullYear(),new Date().getMonth(),1),installEvent=null;
import { initial } from './workspace-model.js';
let state=initial();
try{state.settings=preferences(JSON.parse(localStorage.getItem('mono-device-settings')||'{}'));state.settings.clipboardCloud=false;}catch{state.settings=preferences();}
let adaptTimer,cloudPollBusy=false;
const configureClip=()=>{try{localStorage.setItem('mono-device-settings',JSON.stringify({...state.settings,clipboardCloud:false}));}catch{}configureClipboard({state:()=>state,changed});};
function adaptGrid(columns){clearTimeout(adaptTimer);adaptTimer=setTimeout(()=>{if(state.settings.gridMode!=='auto'||state.gridColumns===columns)return;changeColumns(state,columns);changed();renderDesk();const select=$('#grid-select');if(select)select.value=String(columns);},150);}

let sidebarHidden=window.matchMedia('(max-width:760px)').matches;
try {
  const preference=localStorage.getItem('mono-sidebar-hidden');
  if(preference!==null)sidebarHidden=preference==='true';
} catch { /* Keep the responsive default if storage is unavailable. */ }
function applyTheme(theme){
  document.documentElement.dataset.theme=theme==='navy'?'navy':'graphite';
  document.querySelector('meta[name="theme-color"]').content=theme==='navy'?'#0b1220':'#111312';
}
try{
  applyTheme(localStorage.getItem('mono-theme'))
}
catch{
  applyTheme('graphite');
}
function notify(message){
  $('#toast').textContent=message;
  $('#toast').style.display='block';
  clearTimeout(notify.timeout);
  notify.timeout=setTimeout(()=>$('#toast').style.display='none',3500);
}
function updateClock(){
  const now=new Date(),date=document.querySelector('[data-live-date]'),clock=document.querySelector('[data-live-clock]');
  if(date)date.textContent=new Intl.DateTimeFormat('tr-TR',{
    day:'numeric',month:'long',weekday:'long'
  }).format(now);
  if(clock){
    clock.textContent=new Intl.DateTimeFormat('tr-TR',{
      hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false
    }).format(now);
    clock.dateTime=now.toISOString();
  }
}
setInterval(updateClock,1000);
function status(message){
  const el=$('#save-status'),announcement=$('#save-announcement');
  if(el)el.textContent=message;
  if(announcement)announcement.textContent=message;
}
function changed(){
  updatePrepared=false;
  if(isOverlay()){overlayChanged();return;}
  syncDashboard();
  publishWorkspace(state);
  configureClip();
  dirty=true;
  revision++;
  if(!user){
    status('Geçici önizleme');
    return;
  }
  stageWorkspace(state).catch(()=>{
    status('Yerel kayıt başarısız');
    notify('Bu cihazda taslak kaydedilemedi.');
  });
  status(conflicted?'Kayıt çakışması':offline?'Bu cihazda saklandı':'Kaydediliyor…');
  clearTimeout(saveTimer);
  if(!conflicted)saveTimer=setTimeout(persist,600);
}
async function persist(){
  if(!user||conflicted)return;
  clearTimeout(saveTimer);
  await flushEncryption();
  const snapshot=structuredClone(state),rev=revision;
  saving=true;
  const job=saveQueue.catch(()=>{
  }).then(()=>saveWorkspace(snapshot));
  saveQueue=job;
  try{
    await job;
    if(revision===rev){
      dirty=false;
      status('✓ Kaydedildi');
    }
    else{
      stageWorkspace(state).catch(()=>{
      });
      saveTimer=setTimeout(persist,100);
    }
  }
  catch(error){
    if(error.code==='CONFLICT'){
      conflicted=true;
      status('Kayıt çakışması · İncele');
      showConflict();
    }
    else if(error.code==='OFFLINE'){
      status('Çevrimdışı · Bu cihazda saklandı');
    }
    else{
      status('Kayıt başarısız · Tekrar dene');
      notify('Kayıt yapılamadı. Yerel taslak korunuyor.');
    }
  }
  finally{
    saving=false;
  }
}
function showConflict(){
  const dialog=$('#conflict');
  if(dialog&&!dialog.open)dialog.showModal();
}
function exportWorkspace(){
  const blob=new Blob([JSON.stringify(sanitizeWorkspace(state),null,2)],{
    type:'application/json'
  }),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;
  link.download='mono-calisma-alani.json';
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function shell(){
  state.settings=preferences(state.settings);
  if(isOverlay()){
    $('#app').innerHTML='<div class="overlay-shell"><header class="overlay-bar"><span>MONO · Mini görünüm</span><button data-overlay-top aria-pressed="true" aria-label="Her zaman üstte">Üstte tut</button><button data-overlay-close aria-label="Mini pencereyi kapat">×</button></header><div id="desk" class="desk"></div></div>';
    const top=$('[data-overlay-top]');top.onclick=async()=>{const value=top.getAttribute('aria-pressed')!=='true';await window.monoDesktop.workspace.top(value);top.setAttribute('aria-pressed',String(value));};$('[data-overlay-close]').onclick=()=>window.monoDesktop.workspace.close();
    renderDesk();configureClip();return;
  }
  ensureDesks(state);
  normalizeGrid(state);
  $('#app').innerHTML=renderShell({
    state,user,view,toolbox,dirty,conflicted,offline,types,sidebarHidden
  });
  renderDesk();
  bindShell();
  bindDashboard();
  bindWeather(askName);
  bindDesktopUpdates();
  configureClip();
  publishWorkspace(state);
  updateClock();
  if(installEvent)$('#install').hidden=false;
}
function widgetBody(w){
  if(w.type==='drawing')return renderDrawing();
  if(w.type==='tasks')return renderTaskGroups(w);
  if(w.type==='note')return renderNotebook(w);
  if(extraTypes[w.type])return renderExtra(w);
  if(w.type==='calendar')return renderCalendar({
    month,selectedDate,today,events:state.events
  });
  return `<div class="focus"><form class="focus-duration"><label>Odak süresi <input type="number" name="minutes" aria-label="Odak süresi dakika" min="1" max="1440" value="${w.duration||25}"> dakika</label><button aria-label="Odak süresini uygula">Uygula</button></form><div class="focus-label">Zamanını tek bir işe ayır.</div><div class="timer" data-timer>${timeString(remaining(w))}</div><div class="focus-controls"><button class="primary" data-start>${w.running?'Duraklat':remaining(w)===0?'Yeniden başlat':'Odaklan'}</button><button data-reset aria-label="Sayacı sıfırla">↺</button></div><div class="focus-foot"><i></i><i></i><i></i><i></i></div></div>`;
}
function widgetCard(w,cols){
  return `<article class="widget" data-id="${w.id}" style="${view==='board'&&!isOverlay()?gridStyle(w.grid,cols):''}"><header class="widget-head" tabindex="0" role="group" aria-label="${escape(w.title)} widget'ını ok tuşlarıyla taşı">${icon(w.type)}<span class="widget-title">${escape(w.title)}</span>${view==='board'?`<span class="grip">⠿</span>`:''}<button class="icon" data-overlay aria-label="Mini pencereyi aç" title="Mini görünüm · Her zaman üstte">▣</button><button class="icon" data-rename aria-label="Widget adını değiştir" style="font-size:15px">✎</button><button class="icon" data-remove aria-label="Widget kaldır" style="font-size:17px">×</button></header><div class="widget-body">${widgetBody(w)}</div>${view==='board'&&!isOverlay()?`<button ${state.settings?.resizeWidgets===false?'hidden':''} class="resize-handle" aria-label="${escape(w.title)} boyutu ${w.grid.cols} sütun, ${w.grid.rows} satır; ok tuşlarıyla değiştir" title="Sürükle veya ok tuşlarıyla boyutlandır">◢</button>`:''}</article>`;
}
function renderWidget(id){
  const w=state.widgets.find(item=>item.id===id),old=document.querySelector(`.widget[data-id="${id}"]`);
  if(!w||!old)return renderDesk();
  const focused=captureFocus(old);
  const template=document.createElement('template');
  template.innerHTML=widgetCard(w,state.gridColumns);
  const next=template.content.firstElementChild;
  old.replaceWith(next);
  bindWidgets(next);
  if(view==='board'&&!isOverlay())bindGrid(state,$('#desk'),{
    changed,render:renderDesk,announce:notify,adapt:adaptGrid
  });
  restoreFocus(next,focused);
  refreshWidgetShortcuts();
  const count=state.widgets.filter(item=>item.type==='tasks').flatMap(item=>item.tasks).filter(task=>!task.done).length;
  const badge=document.querySelector('[data-view="tasks"] span');
  if(badge)badge.textContent=count;
}
function renderDesk(){
  normalizeGrid(state);
  const cols=state.gridColumns,rows=rowCount(state),widgets=state.widgets.filter(w=>view==='board'||w.type===view).sort((a,b)=>a.grid.slot-b.grid.slot);
  $('#desk').style.minHeight='';
  if(view==='board')patchGrid($('#desk'),widgets,cols,rows,{card:widgetCard,style:gridStyle,bind:bindWidgets});
  else {
    $('#desk').innerHTML=widgets.map(w=>widgetCard(w,cols)).join('')||'<div class="empty-state">ToolBox’tan bir widget ekleyebilirsin.</div>';
    bindWidgets();
  }
  if(view==='board'&&!isOverlay()){
    bindGrid(state,$('#desk'),{
      changed,render:renderDesk,announce:notify,adapt:adaptGrid
    });
    $('#grid-count').textContent=cols+' sütun · '+rows+' satır';
  }
  else disposeGrid();
  const count=state.widgets.filter(w=>w.type==='tasks').flatMap(w=>w.tasks).filter(t=>!t.done).length;
  const badge=document.querySelector('[data-view="tasks"] span');
  if(badge)badge.textContent=count;
  refreshWidgetShortcuts();
}
function timeString(sec){
  return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
}
function remaining(w){
  return w.running?Math.max(0,Math.ceil((w.endAt-Date.now())/1000)):w.remaining;
}
function addWidget(type,slot){
  if(!types[type])throw Error('Bilinmeyen widget türü');
  const w={
    id:uid(),type,title:types[type][0],tasks:[],text:'',remaining:1500,running:false,endAt:null
  };
  appendGridWidget(state,w,slot);
  view='board';
  toolbox=false;
  changed();
  shell();
  document.querySelector(`[data-id="${w.id}"]`).scrollIntoView({
    behavior:'smooth',block:'nearest'
  });
  return w;
}
function bindShell(){
  const resetDesk=()=>{disposeGrid();view='board';toolbox=false;selectedDate=today;month=new Date(new Date().getFullYear(),new Date().getMonth(),1);changed();shell();$('#desk-select').focus();};
  $('#desk-select').onchange=async event=>{const id=event.target.value;await flushEncryption();state.widgets.filter(w=>w.type==='note').forEach(w=>forgetNotebook(w.id));if(switchDesk(state,id))resetDesk();};
  $('#desk-add').onclick=async()=>{
    const name=await askName({title:'Yeni masa',value:'',maxLength:80});
    if(!name)return;
    await flushEncryption();state.widgets.filter(w=>w.type==='note').forEach(w=>forgetNotebook(w.id));addDesk(state,name);resetDesk();
  };
  $('#desk-list').onclick=openDeskList;
  $('#desk-select').setAttribute('aria-haspopup','dialog');$('#desk-select').onpointerdown=e=>{if(e.button===0){e.preventDefault();openDeskList();}};
  $('#profile-menu').onclick=openAccountMenu;
  $('#desk-rename').onclick=async()=>{
    const desk=state.desks.find(desk=>desk.id===state.activeDeskId);
    const name=await askName({title:'Masa adını değiştir',value:desk.name,maxLength:80});
    if(name){desk.name=name;changed();shell();$('#desk-select').focus();}
  };
  $('#sidebar-toggle').onclick=()=>{
    sidebarHidden=!sidebarHidden;
    $('.shell').classList.toggle('sidebar-collapsed',sidebarHidden);
    $('#workspace-sidebar').hidden=sidebarHidden;
    const toggle=$('#sidebar-toggle'),label=sidebarHidden?'Sol paneli göster':'Sol paneli gizle';
    toggle.setAttribute('aria-expanded',String(!sidebarHidden));
    toggle.setAttribute('aria-label',label);
    toggle.title=label;
    try { localStorage.setItem('mono-sidebar-hidden',String(sidebarHidden)); } catch { /* Optional UI preference. */ }
  };
  $('#widget-search-open').onclick=openWidgetSearch;
  $('#auto-arrange')?.addEventListener('change',e=>{
    state.autoArrange=e.target.checked;
    if(state.autoArrange)applyLayout(state,compactAroundLarge(state.widgets,state.gridColumns));
    else collapseFour(state);
    changed();
    shell();
  });
  $('#grid-select')?.addEventListener('change',e=>{
    state.settings.gridMode='manual';
    changeColumns(state,Number(e.target.value));
    changed();
    shell();
  });
  const themeSelect=$('#theme-select');
  themeSelect.value=document.documentElement.dataset.theme||'graphite';
  themeSelect.onchange=()=>{
    applyTheme(themeSelect.value);
    try{
      localStorage.setItem('mono-theme',themeSelect.value)
    }
    catch{
      notify('Tema bu tarayıcıda kalıcı olarak saklanamadı.');
    }
  };
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{
    view=b.dataset.view;
    shell()
  });
  $('#tool-toggle').onclick=()=>{
    toolbox=!toolbox;
    $('#toolbox').hidden=!toolbox
  };
  $('#tool-close').onclick=()=>{
    toolbox=false;
    $('#toolbox').hidden=true
  };
  $('#account').onclick=async()=>{
    if(!user){
      openAuth();
      return;
    }
    try{
      if(dirty){
        await persist();
        if(dirty)return;
      }
      await signOut();
      stopSpotifyBrowser();
      user=null;
      state=initial();
      shell();
      notify('Çıkış yapıldı.')
    }
    catch{
      notify('Çıkış yapılamadı. Yeniden dene.')
    }
  };
  $('#banner-login')?.addEventListener('click',openAuth);
  $('#save-status').onclick=()=>user?(conflicted?showConflict():persist()):openAuth();
  document.querySelectorAll('[data-add]').forEach(b=>{
    b.onclick=()=>addWidget(b.dataset.add);
    b.ondragstart=e=>{
      e.dataTransfer.setData('text/mono-widget',b.dataset.add);
      e.dataTransfer.effectAllowed='copy';
    };
  });
  const desk=$('#desk');
  desk.ondragover=e=>{
    if(view==='board')e.preventDefault();
  };
  desk.ondrop=e=>{
    e.preventDefault();
    const type=e.dataTransfer.getData('text/mono-widget');
    if(!types[type])return;
    const surface=desk.querySelector('.grid-surface');
    if(surface)addWidget(type,pointSlot(surface,e.clientX,e.clientY,state.gridColumns));
    else addWidget(type);
  };
  $('#install').onclick=async()=>{
    if(installEvent){
      await installEvent.prompt();
      installEvent=null;
      $('#install').hidden=true;
    }
  };
}
function bindWidgets(scope=document){
  (scope.matches?.('.widget')?[scope]:scope.querySelectorAll('.widget')).forEach(el=>{
    const w=state.widgets.find(w=>w.id===el.dataset.id);
    const overlayButton=el.querySelector('[data-overlay]');overlayButton.hidden=isOverlay();bindOverlayButton(overlayButton,state,w,notify);
    if(isOverlay()){el.querySelector('[data-remove]').hidden=true;el.querySelector('[data-rename]').hidden=true;}
    el.querySelector('[data-remove]').onclick=async()=>{
      const d=$('#confirm');
      d.showModal();
      d.onclose=()=>{
        if(d.returnValue==='delete'){
          const before=new Map([...document.querySelectorAll('.grid-surface>.widget')].map(node=>[node.dataset.id,node.getBoundingClientRect()]));
          state.widgets=state.widgets.filter(x=>x.id!==w.id);
          if(w.type==='note')forgetNotebook(w.id);
          if(state.autoArrange)applyLayout(state,compactAroundLarge(state.widgets,state.gridColumns));
          else collapseFour(state);
          changed();
          renderDesk();
          for(const node of document.querySelectorAll('.grid-surface>.widget')){
            const old=before.get(node.dataset.id),now=node.getBoundingClientRect();
            if(!old)continue;
            const dx=old.left-now.left,dy=old.top-now.top;
            if(!dx&&!dy)continue;
            node.style.transition='none';
            node.style.transform=`translate(${dx}px,${dy}px)`;
            node.getBoundingClientRect();
            requestAnimationFrame(()=>{
              node.style.transition='transform 280ms cubic-bezier(.2,.8,.2,1)';
              node.style.transform='';
              node.addEventListener('transitionend',()=>{
                node.style.transition='';
              },{
                once:true
              });
            });
          }
          const count=document.querySelector('.view-label span');
          if(count)count.textContent=state.widgets.length+' widget';
        }
      };
    };
    el.querySelector('[data-rename]').onclick=async()=>{
      const title=await askName({
        title:'Widget adını değiştir',value:w.title,maxLength:60
      });
      if(title){
        w.title=title;
        changed();
        renderWidget(w.id);
      }
    };
    if(w.type==='note')bindNotebook(w,el.querySelector('.widget-body'),{
      changed,notify,askName,deleted:async(widget,page)=>{await flushEncryption();trashPage(state,widget,page);}
    });
    if(w.type==='drawing')bindDrawing(w,el,{changed});
    if(extraTypes[w.type])bindExtra(w,el,{
      changed,render:()=>renderWidget(w.id),notify,beforeConnect:async()=>{
        if(dirty)await persist();
        if(dirty)throw Error('Spotify’a geçmeden önce çalışma alanını kaydet. Kayıt durumunu kontrol et.');
      }
    });
    if(w.type==='tasks')bindTaskGroups(w,el,{
      changed,render:()=>renderWidget(w.id),notify
    });
    el.querySelector('.note')?.addEventListener('input',e=>{
      w.text=e.target.value;
      el.querySelector('[data-note-count]').textContent=w.text.length+' karakter';
      changed();
    });
    el.querySelectorAll('[data-month]').forEach(b=>b.onclick=()=>{
      month=new Date(month.getFullYear(),month.getMonth()+Number(b.dataset.month),1);
      state.widgets.filter(item=>item.type==='calendar').forEach(item=>renderWidget(item.id));
    });
    el.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>{
      selectedDate=b.dataset.date;
      state.widgets.filter(item=>item.type==='calendar').forEach(item=>renderWidget(item.id));
    });
    el.querySelector('.event-form')?.addEventListener('submit',e=>{
      e.preventDefault();
      const text=e.target.elements.event.value.trim();
      if(!text)return;
      state.events.push({
        id:uid(),date:selectedDate,text
      });
      changed();
      state.widgets.filter(item=>item.type==='calendar').forEach(item=>renderWidget(item.id));
    });
    el.querySelectorAll('[data-event-delete]').forEach(b=>b.onclick=()=>{
      state.events=state.events.filter(e=>e.id!==b.dataset.eventDelete);
      changed();
      state.widgets.filter(item=>item.type==='calendar').forEach(item=>renderWidget(item.id));
    });
    el.querySelector('.focus-duration')?.addEventListener('submit',e=>{
      e.preventDefault();
      const minutes=Number(e.target.elements.minutes.value);
      if(!Number.isInteger(minutes)||minutes<1||minutes>1440){
        notify('1 ile 1440 dakika arasında bir süre seç.');
        return;
      }
      w.duration=minutes;
      w.remaining=minutes*60;
      w.running=false;
      w.endAt=null;
      changed();
      renderWidget(w.id);
    });
    el.querySelector('[data-start]')?.addEventListener('click',()=>{
      if(w.running){
        w.remaining=remaining(w);
        w.running=false;
      }
      else{
        if(w.remaining===0)w.remaining=(w.duration||25)*60;
        w.endAt=Date.now()+w.remaining*1000;
        w.running=true;
      }
      changed();
      renderWidget(w.id);
    });
    el.querySelector('[data-reset]')?.addEventListener('click',()=>{
      w.running=false;
      w.remaining=(w.duration||25)*60;
      w.endAt=null;
      changed();
      renderWidget(w.id);
    });
  });
}
function openAuth(){
  $('#auth-message').textContent=configured?'':'Hesap bağlantısı henüz kurulmadı. Supabase bağlandığında giriş ve kayıt kullanılabilir.';
  $('#auth').showModal();
}
$('#conflict-export').onclick=exportWorkspace;
$('#conflict-reload').onclick=async()=>{
  try{
    const loaded=await reloadRemoteWorkspace();
    state=loaded||initial(false);
    conflicted=false;
    dirty=false;
    $('#conflict').close();
    shell();
    status('✓ Sunucudaki sürüm açıldı');
  }
  catch(error){
    notify(error.message);
  }
};
$('#auth [data-close]').onclick=()=>$('#auth').close();
$('#auth-toggle').onclick=()=>{
  register=!register;
  $('#auth-title').textContent=register?'Kendine bir alan aç.':'Her şey kaldığın yerde.';
  $('#auth-submit').textContent=register?'Hesap oluştur':'Giriş yap';
  $('#auth-toggle').textContent=register?'Zaten hesabın var mı? Giriş yap':'Hesabın yok mu? Hesap oluştur';
  $('#auth-form').elements.password.autocomplete=register?'new-password':'current-password';
};
$('#auth-form').onsubmit=async e=>{
  e.preventDefault();
  const button=$('#auth-submit');
  button.disabled=true;
  $('#auth-message').textContent='Bağlanıyor…';
  try{
    const form=e.target;
    const session=await(register?signUp:signIn)(form.email.value,form.password.value);
    if(!session){
      $('#auth-message').textContent='Hesabını doğrulamak için e-postandaki bağlantıyı aç, sonra giriş yap.';
      return;
    }
    user=session.user;
    const data=await loadWorkspace();
    state=data||initial(false);
    dirty=hasPendingDraft();
    form.password.value='';
    $('#auth').close();
    shell();
    if(dirty)persist();
    notify('Çalışma alanına hoş geldin.');
  }
  catch(error){
    if(error.code==='CONFLICT'&&error.draft){
      state=sanitizeWorkspace(error.draft.state);
      dirty=true;
      conflicted=true;
      $('#auth').close();
      shell();
      showConflict();
    }
    else $('#auth-message').textContent=error.message;
  }
  finally{
    button.disabled=false;
  }
};
setInterval(()=>{
  for(const w of [state,...(isOverlay()?[]:state.desks?.map(d=>d.workspace).filter(Boolean)||[])].flatMap(s=>s.widgets).filter(w=>w.type==='focus'&&w.running)){
    const r=remaining(w),el=document.querySelector(`[data-id="${w.id}"] [data-timer]`);
    if(el)el.textContent=timeString(r);
    if(r===0&&!isOverlay()){
      w.running=false;
      w.remaining=0;
      changed();
      const startButton=document.querySelector('[data-id='+JSON.stringify(w.id)+'] [data-start]');
      if(startButton)startButton.textContent='Yeniden başlat';
      dashboardNotification('Odak süren tamamlandı','Kısa bir mola ver.','focus');
    }
  }
},500);
window.addEventListener('beforeunload',e=>{
  if(updatePrepared)return;
  if(hasPendingEncryption()||user&&(dirty||saving)||isOverlay()&&hasOverlayPending()){
    e.preventDefault();
    e.returnValue='';
  }
});
window.addEventListener('online',()=>{
  if(user&&dirty)persist();
});
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();
  installEvent=e;
  const b=$('#install');
  if(b)b.hidden=false;
});
const openWidgetSearch=installWidgetSearch(types,addWidget,icon);
installWidgetShortcuts(id=>state.widgets.find(widget=>widget.id===id)?.type);
installSettings({state:()=>state,user:()=>user,flush:flushEncryption,changed,render:shell,notify,columns:columns=>changeColumns(state,columns),clipboard:configureClip,
  resize:(id,cols,rows)=>{const w=state.widgets.find(w=>w.id===id);if(!w)throw Error('Widget bulunamadı.');const target={id,slot:w.grid.slot,...snapSpan(cols,rows,state.gridColumns)};applyLayout(state,state.autoArrange?compactAroundLarge(state.widgets,state.gridColumns,target):arrange(state.widgets,state.gridColumns,target));},
  theme:value=>{applyTheme(value);localStorage.setItem('mono-theme',value);},logout:()=>$('#account').click(),
  switchDesk:async id=>{await flushEncryption();state.widgets.filter(w=>w.type==='note').forEach(w=>forgetNotebook(w.id));if(switchDesk(state,id)){changed();shell();}},
  beforeConnect:async()=>{if(dirty)await persist();if(dirty)throw Error('Hesaba bağlanmadan önce çalışma alanını kaydet.');}
});
window.monoDesktop?.workspace?.onEdit(value=>{
  const layout=value.deskId===state.activeDeskId?state:state.desks.find(d=>d.id===value.deskId)?.workspace;
  const widget=layout?.widgets.find(w=>w.id===value.widget.id);if(!widget)return;
  if(widget.type==='note')forgetNotebook(widget.id);
  Object.assign(widget,value.widget);if(widget.type==='calendar')layout.events=value.events;
  state.deletedPages??=[];for(const page of value.deletedPages)if(!state.deletedPages.some(p=>p.id===page.id))state.deletedPages.push(page);
  changed();if(value.deskId===state.activeDeskId)renderWidget(widget.id);
});
installDesktopUpdates({notify,cancel:()=>{updatePrepared=false;},prepare:async()=>{
  clearTimeout(saveTimer);
  await flushEncryption();
  if(conflicted)throw Error('Güncellemeden önce kayıt çakışmasını çöz.');
  if(!user&&dirty)throw Error('Önizlemedeki değişiklikleri önce hesabına kaydet veya dışa aktar.');
  await saveQueue.catch(()=>{});
  if(user&&(dirty||hasPendingDraft()))await persist();
  if(conflicted||dirty||hasPendingDraft()||hasPendingEncryption())throw Error('Değişiklikler henüz kaydedilmedi. Bağlantıyı ve kaydı kontrol edip tekrar dene.');
  updatePrepared=true;
}});
if(!isOverlay())installDashboard({state:()=>state,changed,notify,askName,calendar:()=>state.widgets.filter(w=>w.type==='calendar').forEach(w=>renderWidget(w.id))});
shell();
if(isOverlay()){await startOverlay({state:()=>state,replace:value=>{state=sanitizeWorkspace(value);shell();},flush:flushEncryption,notify,export:exportWorkspace});}
else try{
  const session=await current();
  if(session){
    user=session.user;
    const loaded=await loadWorkspace();
    state=loaded||initial(false);
    dirty=hasPendingDraft();
    shell();
    if(dirty&&!offline)persist();
    if(offline)status('Çevrimdışı · Bu cihazdaki taslak');
  }
  else if(configured)openAuth();
}
catch(error){
  if(error.code==='CONFLICT'&&error.draft){
    state=sanitizeWorkspace(error.draft.state);
    dirty=true;
    conflicted=true;
    shell();
    showConflict();
  }
  else notify('Çalışma alanın yüklenemedi. Giriş yaparak yeniden dene.');
}
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{
});
try{
  document.modelContext?.registerTool({
    name:'add_workspace_widget',description:'Çalışma alanına seçilen türde bir widget ekler.',inputSchema:{
      type:'object',properties:{
        type:{
          type:'string',enum:Object.keys(types)
        }
      },required:['type'],additionalProperties:false
    },annotations:{
      readOnlyHint:false
    },execute:async(input)=>{
      if(!input||!types[input.type])throw Error('Geçersiz widget türü');
      const w=addWidget(input.type);
      if(user){
        await persist();
        if(dirty)throw Error('Widget eklendi ancak buluta kaydedilemedi.');
      }
      return {
        id:w.id,type:w.type,saved:!!user
      };
    }
  });
}
catch{
}

setInterval(async()=>{
  if(isOverlay()||!user||!state.settings?.clipboardCloud||dirty||saving||conflicted||cloudPollBusy||document.querySelector('dialog[open]')||document.activeElement?.closest('input,textarea,[contenteditable]'))return;
  cloudPollBusy=true;try{const currentRevision=revision,loaded=await refreshWorkspace(()=>!dirty&&!saving&&revision===currentRevision);if(loaded&&!dirty&&!saving){state=loaded;shell();}}catch(error){if(error.code==='CONFLICT'){conflicted=true;status('Kayıt çakışması · İncele');showConflict();}}finally{cloudPollBusy=false;}
},30000);
