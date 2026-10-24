const $=selector=>document.querySelector(selector),bridge=window.monoIsland;
const root=$('#island'),details=$('#details'),trigger=$('#summary');
const key=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
let selected=key(new Date()),month=new Date(new Date().getFullYear(),new Date().getMonth(),1),snapshot={},expanded=false,pendingLeave=false,pointerInside=false,enterTimer,leaveTimer,hitFrame,statusTimer,freeze=false,calendarSignature='',weatherSignature='',lastDate='',currentPage=0,wheelDebounce=false,activeDropFile=null,isShowingDrop=false,dropDismissTimer=null,isFocusLocked=false;

const text=(selector,value)=>{const node=$(selector);if(node&&node.textContent!==String(value))node.textContent=String(value);};
const weatherIcon=(code,day=true)=>code===0?(day?'sun':'moon'):code<=48?'cloud':'rain';
const svg=id=>{const element=document.createElementNS('http://www.w3.org/2000/svg','svg');element.classList.add('icon');element.setAttribute('aria-hidden','true');const use=document.createElementNS(element.namespaceURI,'use');use.setAttribute('href','#icon-'+id);element.append(use);return element;};

function message(value){text('#status',value);clearTimeout(statusTimer);if(value)statusTimer=setTimeout(()=>text('#status',''),7000);}
async function act(fn){try{await fn();}catch(error){message(error.message||'İşlem tamamlanamadı.');}}

function reportHit(duration=280){
  cancelAnimationFrame(hitFrame);const until=performance.now()+duration;
  function frame(){
    const r=$('#hit').getBoundingClientRect();
    bridge?.hit({x:r.x,y:r.y,width:r.width,height:r.height});
    if(performance.now()<until)hitFrame=requestAnimationFrame(frame);
  }
  frame();
}

function setMicroMode(enabled){
  root.dataset.mode=enabled?'micro':'normal';
  reportHit();
  if(bridge?.setMicroMode)bridge.setMicroMode(enabled).catch(()=>{});
}

function toggleMicroMode(){
  const isMicro=root.dataset.mode==='micro';
  setMicroMode(!isMicro);
  if(isMicro){
    open(false);
  }
}

function shouldLockFocus(state){
  if(!state)return false;
  if(state.focusMode===true)return true;
  if(state.focusModeAuto===false)return false;
  const fg=state.foreground;
  if(!fg||!fg.fullscreen)return false;
  const raw=state.focusApps||'*';
  const apps=raw.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  if(apps.includes('*')||apps.includes(String(fg.process||'').toLowerCase())){
    return true;
  }
  return false;
}

function updateFocusState(state){
  const locked=shouldLockFocus(state);
  isFocusLocked=locked;
  root.dataset.focus=String(locked);
  const isFullscreen=state?.foreground?.fullscreen===true;
  const badge=$('#focus-badge');
  if(badge){
    // Tam ekrandayken fokus ikonunu gizle
    badge.hidden=!locked||isFullscreen;
  }
  const btn=$('#focus-mode-btn');
  if(btn)btn.classList.toggle('active',state.focusMode===true||locked);
  if(locked&&expanded){
    open(false);
  }
}

function toggleFocusMode(){
  const current=snapshot.focusMode===true;
  if(bridge?.setFocusMode){
    bridge.setFocusMode(!current).catch(()=>{});
    message(!current?'Fokus Modu açıldı (açılma kilitlendi).':'Fokus Modu kapatıldı.');
  }
}

function open(value,{explicit=false,focus=false}={}){
  clearTimeout(enterTimer);clearTimeout(leaveTimer);
  if(value&&isFocusLocked&&!explicit)return;
  if(value&&freeze&&!explicit)return;
  expanded=value;pendingLeave=false;root.dataset.open=String(value);
  if(!value&&details.contains(document.activeElement))trigger.focus();
  details.inert=!value;details.setAttribute('aria-hidden',String(!value));trigger.setAttribute('aria-expanded',String(value));trigger.tabIndex=value?-1:0;
  if(focus)$('#preferences').focus();reportHit();
}

function isWriting(){
  const active=document.activeElement;
  if(!details.contains(active)||active.closest('[hidden], [inert]')||active.disabled||active.readOnly)return false;
  return active.isContentEditable||active.tagName==='TEXTAREA'||active.tagName==='INPUT'&&['text','search','email','url','password','tel','number','date','time','datetime-local','month','week'].includes(active.type);
}

function scheduleClose(){
  clearTimeout(enterTimer);clearTimeout(leaveTimer);
  leaveTimer=setTimeout(()=>{if(pendingLeave&&expanded&&!isWriting()&&$('#drop-overlay').hidden)open(false);},260);
}

function pointer(inside){
  if(inside===pointerInside)return;pointerInside=inside;
  if(inside){pendingLeave=false;clearTimeout(leaveTimer);if(!expanded&&!freeze&&!isFocusLocked)enterTimer=setTimeout(()=>open(true),150);}
  else{freeze=false;pendingLeave=true;scheduleClose();}
}

root.addEventListener('mouseenter',()=>pointer(true));
root.addEventListener('mouseleave',()=>pointer(false));
document.addEventListener('pointermove',event=>pointer(root.contains(event.target)));
details.addEventListener('focusout',()=>{if(pendingLeave&&expanded)scheduleClose();});

// Kompakt Ada Tıklama, Mikro Mod & Fokus Modu
trigger.onclick=e=>{
  if(e.target.closest('#focus-badge')){
    toggleFocusMode();
    return;
  }
  if(e.target.closest('#micro-toggle')||e.target.closest('#micro-pill')){
    toggleMicroMode();
    return;
  }
  if(isFocusLocked){
    message('Fokus Modu devrede. Kapatmak için odak ikonuna tıkla.');
    return;
  }
  if(root.dataset.mode==='micro'){
    setMicroMode(false);
    return;
  }
  open(true,{explicit:true,focus:true});
};
if($('#collapse'))$('#collapse').onclick=()=>{freeze=true;open(false);};
$('#micro-toggle').onclick=e=>{e.stopPropagation();setMicroMode(true);open(false);};
$('#micro-pill').onclick=e=>{e.stopPropagation();setMicroMode(false);open(false);};
$('#micro-mode-btn').onclick=()=>toggleMicroMode();
$('#focus-mode-btn').onclick=()=>toggleFocusMode();
$('#focus-badge').onclick=e=>{e.stopPropagation();toggleFocusMode();};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();freeze=true;open(false);closeDropZone();}});
window.addEventListener('resize',()=>reportHit());

// Sayfa Gezinmesi (Page Navigation & Scroll Wheel)
function setPage(index){
  currentPage=Math.max(0,Math.min(2,index));
  const track=$('#carousel-track');
  if(track)track.style.transform=`translateX(-${currentPage*33.333333}%)`;
  document.querySelectorAll('.page-pills .pill').forEach((pill,idx)=>{
    pill.classList.toggle('active',idx===currentPage);
    pill.setAttribute('aria-selected',String(idx===currentPage));
  });
}
document.querySelectorAll('.page-pills .pill').forEach(pill=>{
  pill.onclick=()=>{setPage(Number(pill.dataset.page));};
});

root.addEventListener('wheel',e=>{
  if(!expanded)return;
  if(wheelDebounce)return;
  if(Math.abs(e.deltaY)>18||Math.abs(e.deltaX)>18){
    const direction=(e.deltaY>0||e.deltaX>0)?1:-1;
    let next=currentPage+direction;
    if(next<0)next=2;
    else if(next>2)next=0;
    if(next!==currentPage){
      wheelDebounce=true;
      setPage(next);
      setTimeout(()=>{wheelDebounce=false;},260);
    }
  }
},{passive:true});

document.addEventListener('keydown',e=>{
  if(!expanded||isWriting())return;
  if(e.key==='ArrowRight'||e.key==='ArrowDown')setPage((currentPage+1)%3);
  else if(e.key==='ArrowLeft'||e.key==='ArrowUp')setPage((currentPage+2)%3);
});

// Saat ve Tarih
function clock(){
  const date=new Date(),today=key(date);
  text('#compact-clock',date.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}));
  text('#full-clock',date.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}));
  $('#compact-clock').dateTime=$('#full-clock').dateTime=date.toISOString();
  text('#full-date',date.toLocaleDateString('tr-TR',{day:'numeric',month:'short',weekday:'short'}));
  text('#greeting',date.getHours()<12?'Günaydın':date.getHours()<18?'İyi günler':'İyi akşamlar');
  if(lastDate!==today){if(selected===lastDate)selected=today;lastDate=today;renderCalendar();}
}

// Takvim & Ajanda (Test Uyumluluğu)
function renderCalendar(){
  const events=snapshot.summary?.events||[],signature=JSON.stringify([key(month),selected,events,lastDate]);
  if(signature===calendarSignature)return;calendarSignature=signature;
  text('#month-label',month.toLocaleDateString('tr-TR',{month:'long',year:'numeric'}));
  const fragment=document.createDocumentFragment(),first=(month.getDay()+6)%7,days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  for(let i=0;i<first;i++)fragment.append(document.createElement('span'));
  for(let day=1;day<=days;day++){
    const date=key(new Date(month.getFullYear(),month.getMonth(),day)),button=document.createElement('button');
    button.type='button';button.className='day'+(date===lastDate?' today':'')+(date===selected?' selected':'')+(events.some(e=>e.date===date)?' has-event':'');
    button.textContent=String(day);button.dataset.date=date;
    button.setAttribute('aria-label',new Date(date+'T12:00:00').toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'}));
    button.setAttribute('aria-pressed',String(date===selected));
    button.onclick=()=>{selected=date;renderCalendar();};
    fragment.append(button);
  }
  $('#calendar').replaceChildren(fragment);
  const rows=document.createDocumentFragment(),plans=events.filter(e=>e.date===selected);
  for(const event of plans){
    const button=document.createElement('button');button.className='event';
    const time=document.createElement('time'),label=document.createElement('span');
    time.textContent=event.time||'Gün';label.textContent=event.text;
    button.append(time,label);button.onclick=()=>act(()=>bridge.navigate({view:'calendar',date:selected}));
    rows.append(button);
  }
  $('#events').replaceChildren(rows);
}
$('#prev-month').onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()-1,1);renderCalendar();};
$('#next-month').onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()+1,1);renderCalendar();};

// Ayarlar Paneli
function preferences(show){
  $('#settings-panel').hidden=!show;$('#overview').hidden=show;
  $('#preferences').setAttribute('aria-expanded',String(show));
  if(show){renderWidgetSelector(cachedWidgets);open(true,{explicit:true});$('#city').focus();}
  else{if($('#settings-panel').contains(document.activeElement))$('#preferences').focus();if(pendingLeave)scheduleClose();}
}
$('#preferences').onclick=()=>preferences($('#settings-panel').hidden);
$('#city-open').onclick=()=>preferences(true);
$('#settings-back').onclick=()=>preferences(false);
$('#city-form').onsubmit=e=>{e.preventDefault();act(async()=>{render(await bridge.city($('#city').value));preferences(false);});};
$('#display').onchange=e=>act(async()=>render(await bridge.display(Number(e.target.value))));

// Gezinme ve Sistem Kontrolleri (Footer veya Gizli Butonlar)
for(const [id,view] of [['dashboard','board'],['calendar-open','calendar'],['capture','capture'],['zone','zone']]){
  const el=$('#'+id);
  if(el)el.onclick=()=>act(()=>bridge.navigate({view,date:selected}));
}
for(const type of ['wifi','bluetooth'])$('#'+type).onclick=()=>act(()=>bridge.settings(type));
$('#mute').onclick=()=>act(()=>bridge.command({action:'audio.mute',value:!snapshot.system?.audio?.muted}));
let volumeTimer,volumePending=false;
$('#volume').oninput=()=>{
  text('#volume-value',$('#volume').value);clearTimeout(volumeTimer);volumePending=true;
  volumeTimer=setTimeout(()=>act(async()=>{try{await bridge.command({action:'audio.volume',value:Number($('#volume').value)/100});}finally{volumePending=false;}}),100);
};
for(const [id,action] of [['play','media.playPause'],['previous','media.previous'],['next','media.next']])$('#'+id).onclick=()=>act(()=>bridge.command({action}));

// Hava Durumu Render
function renderWeather(){
  const w=snapshot.weather,signature=JSON.stringify([w,snapshot.weatherError,snapshot.weatherBusy,snapshot.city]);
  if(signature===weatherSignature)return;weatherSignature=signature;
  text('#city-open',snapshot.city||'Şehir seç');
  text('#compact-temperature',w?`${Math.round(w.temperature)}°`:'—°');
  text('#temperature',w?Math.round(w.temperature):'—');
  text('#weather-summary',w?.summary||'Bulunduğun şehri seç');
  text('#compact-label',w?`${w.city}, ${w.summary}`:'Hava durumu için şehir seç');
  $('#compact-weather use').setAttribute('href','#icon-'+weatherIcon(w?.code??3,w?.isDay!==false));
  $('#weather-symbol use').setAttribute('href','#icon-'+weatherIcon(w?.code??3,w?.isDay!==false));
  const daily=w?.daily?.[0];text('#weather-range',daily?`${Math.round(daily.min)}° / ${Math.round(daily.max)}°`:'');
  const forecast=document.createDocumentFragment(),hours=(w?.hourly||[]).filter(h=>h.time>=(w.currentTime||'')).slice(0,4);
  for(const hour of hours){
    const item=document.createElement('div');item.className='forecast-hour';
    const t=document.createElement('time'),temp=document.createElement('span');
    t.textContent=hour.time.slice(11,16);temp.textContent=Math.round(hour.temperature)+'°';
    item.append(t,svg(weatherIcon(hour.code)),temp);forecast.append(item);
  }
  $('#forecast').replaceChildren(forecast);
}

// Sayfa 3: WIDGET'LAR (Fill Modu & Seçim Düzenleme)
let cachedWidgets=[];
const DEFAULT_WIDGET_CATALOG=[
  {id:'note',type:'note',title:'Notlar'},
  {id:'tasks',type:'tasks',title:'Görevler'},
  {id:'calendar',type:'calendar',title:'Takvim'},
  {id:'spotify',type:'spotify',title:'Spotify'},
  {id:'focus',type:'focus',title:'Odak'},
  {id:'habits',type:'habits',title:'Alışkanlıklar'}
];

function getSavedWidgetSelection(){
  try{
    const saved=JSON.parse(localStorage.getItem('mono_island_selected_widgets'));
    if(Array.isArray(saved)&&saved.length>0)return saved;
  }catch{}
  return null;
}

function saveWidgetSelection(selection){
  try{localStorage.setItem('mono_island_selected_widgets',JSON.stringify(selection));}catch{}
}

function renderWidgetSelector(allWidgets){
  const list=$('#widget-options-list');
  if(!list)return;
  const catalog=(allWidgets&&allWidgets.length>0)?allWidgets:DEFAULT_WIDGET_CATALOG;
  let saved=getSavedWidgetSelection();
  if(!saved){
    saved=catalog.map(w=>w.id||w.type);
    saveWidgetSelection(saved);
  }
  const frag=document.createDocumentFragment();
  catalog.forEach(w=>{
    const key=w.id||w.type;
    const chip=document.createElement('button');
    chip.type='button';
    const isActive=saved.includes(key);
    chip.className='widget-option-chip'+(isActive?' active':'');
    chip.textContent=(isActive?'✓ ':'+ ')+(w.title||w.type);
    chip.onclick=e=>{
      e.stopPropagation();
      let current=getSavedWidgetSelection()||catalog.map(x=>x.id||x.type);
      if(current.includes(key)){
        if(current.length>1)current=current.filter(k=>k!==key);
        else{message('En az 1 widget seçili olmalı.');return;}
      }else{
        current.push(key);
      }
      saveWidgetSelection(current);
      renderWidgetSelector(allWidgets);
      renderWidgets(cachedWidgets);
    };
    frag.append(chip);
  });
  list.replaceChildren(frag);
}

function renderWidgets(widgets){
  cachedWidgets=Array.isArray(widgets)?widgets:[];
  const container=$('#widget-list');
  if(!container)return;

  const catalog=cachedWidgets.length>0?cachedWidgets:DEFAULT_WIDGET_CATALOG;
  const savedSelection=getSavedWidgetSelection();
  let displayWidgets=catalog;
  if(Array.isArray(savedSelection)&&savedSelection.length>0){
    displayWidgets=catalog.filter(w=>savedSelection.includes(w.id||w.type));
    if(displayWidgets.length===0)displayWidgets=catalog.slice(0,3);
  }

  const frag=document.createDocumentFragment();
  const iconMap={note:'note',calendar:'cloud',tasks:'widget',focus:'sun',habits:'rain',links:'arrow',spotify:'note',drawing:'convert'};
  for(const w of displayWidgets){
    const item=document.createElement('button');
    item.type='button';item.className='widget-box';
    item.setAttribute('aria-label',`${w.title||w.type}`);
    item.title=`${w.title||w.type}`;
    item.innerHTML=`
      <svg class="icon"><use href="#icon-${iconMap[w.type]||'widget'}"/></svg>
      <span class="widget-box-label">${w.title||w.type}</span>
      <span class="pin-dot" aria-hidden="true"></span>
    `;
    item.onclick=()=>act(async()=>{
      if(bridge?.openWidget){
        await bridge.openWidget(w.id||w.type);
        message(`${w.title||w.type} Always on Top açıldı`);
      }
    });
    frag.append(item);
  }
  container.replaceChildren(frag);
  renderWidgetSelector(catalog);
}

// Sürükle-Bırak Dosya Dönüştürücü (Kutucuklar & Donma Çözümü)
function getTargetsForType(mimeOrExt){
  const str=(mimeOrExt||'').toLowerCase();
  if(str.includes('png'))return ['JPG','WEBP'];
  if(str.includes('jpg')||str.includes('jpeg'))return ['PNG','WEBP'];
  if(str.includes('webp'))return ['PNG','JPG'];
  if(str.includes('image'))return ['PNG','JPG','WEBP'];
  if(str.includes('docx')||str.includes('word')||str.includes('document'))return ['PDF','TXT','MD'];
  if(str.includes('xlsx')||str.includes('sheet')||str.includes('excel'))return ['PDF','CSV','JSON'];
  if(str.includes('pdf'))return ['PNG','TXT'];
  if(str.includes('txt')||str.includes('markdown')||str.includes('md'))return ['PDF','DOCX'];
  return ['PNG','JPG','PDF','TXT'];
}

function convertImageInBrowser(file,targetFormat){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    const url=URL.createObjectURL(file);
    img.onload=()=>{
      try{
        const canvas=document.createElement('canvas');
        canvas.width=img.naturalWidth||img.width;
        canvas.height=img.naturalHeight||img.height;
        const ctx=canvas.getContext('2d');
        if(['jpg','jpeg'].includes(targetFormat.toLowerCase())){
          ctx.fillStyle='#ffffff';
          ctx.fillRect(0,0,canvas.width,canvas.height);
        }
        ctx.drawImage(img,0,0);
        const mime=targetFormat.toLowerCase()==='png'?'image/png':targetFormat.toLowerCase()==='webp'?'image/webp':'image/jpeg';
        const dataUrl=canvas.toDataURL(mime,0.92);
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      }catch(err){
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror=()=>{
      URL.revokeObjectURL(url);
      reject(new Error('Görsel okunamadı.'));
    };
    img.src=url;
  });
}

function showDropBoxes(targets,title='Dosyayı bırakın',hint='Dönüştürmek istediğin kutucuğun üstüne bırak:'){
  $('#drop-overlay').hidden=false;
  $('#drop-status-bar').hidden=true;
  text('#drop-name',title);
  text('#drop-hint',hint);
  const frag=document.createDocumentFragment();
  targets.forEach(format=>{
    const box=document.createElement('div');
    box.className='drop-box';
    box.dataset.format=format.toLowerCase();
    box.innerHTML=`<strong>${format}</strong><small>${activeDropFile?'Tıkla & Çevir':'Bırak & Çevir'}</small>`;

    box.addEventListener('dragenter',e=>{e.preventDefault();e.stopPropagation();box.classList.add('box-dragover');});
    box.addEventListener('dragover',e=>{e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='copy';box.classList.add('box-dragover');});
    box.addEventListener('dragleave',e=>{e.stopPropagation();box.classList.remove('box-dragover');});
    box.addEventListener('drop',e=>{
      e.preventDefault();e.stopPropagation();
      box.classList.remove('box-dragover');
      handleFileDrop(e,format.toLowerCase(),box);
    });
    box.onclick=e=>{
      e.stopPropagation();
      if(activeDropFile)handleConversionDirect(activeDropFile,format.toLowerCase(),box);
    };
    frag.append(box);
  });
  $('#drop-boxes').replaceChildren(frag);
  open(true,{explicit:true});
}

function closeDropZone(){
  clearTimeout(dropDismissTimer);
  $('#drop-overlay').hidden=true;
  $('#drop-status-bar').hidden=true;
  activeDropFile=null;
  isShowingDrop=false;
  reportHit();
  if(!root.matches(':hover'))scheduleClose();
}
$('#drop-close').onclick=closeDropZone;

async function handleFileDrop(e,targetFormat,box){
  const files=e.dataTransfer?.files;
  if(!files||files.length===0){
    message('Dosya algılanamadı.');
    return;
  }
  const file=files[0];
  activeDropFile=file;
  await handleConversionDirect(file,targetFormat,box);
}

async function handleConversionDirect(file,targetFormat,box){
  let filePath='';
  try{if(bridge?.getPathForFile)filePath=bridge.getPathForFile(file);}catch{}
  if(!filePath)filePath=file.path||'';
  if(!filePath){
    message('Dosya konumu alınamadı.');
    text('#drop-hint','Hata: Dosya konumu alınamadı.');
    return;
  }

  text('#drop-name',file.name);
  if(box){
    box.classList.add('box-active-converting');
    box.innerHTML=`<strong>${targetFormat.toUpperCase()}</strong><small>Çevriliyor…</small>`;
  }

  try{
    let dataUrl='';
    const ext=(file.name||'').split('.').pop().toLowerCase();
    const isImage=['png','jpg','jpeg','webp','bmp','gif','svg'].includes(ext);
    if(isImage&&['png','jpg','jpeg','webp'].includes(targetFormat.toLowerCase())){
      try{dataUrl=await convertImageInBrowser(file,targetFormat);}catch(e){}
    }

    const result=await bridge.convertFile({filePath,targetFormat,dataUrl});
    if(box){
      box.classList.remove('box-active-converting');
      box.classList.add('box-success');
      box.innerHTML=`<strong>✓ ${targetFormat.toUpperCase()}</strong><small>Tamamlandı</small>`;
    }
    $('#drop-status-bar').hidden=false;
    text('#drop-status-badge',`Kaydedildi: ${result.filename}`);
    $('#drop-show-btn').onclick=()=>bridge.showFile(result.outputPath);
    text('#drop-hint','Dönüştürme tamamlandı. Dosya aynı konuma kaydedildi.');
    message('Dosya konuma kaydedildi.');

    clearTimeout(dropDismissTimer);
    dropDismissTimer=setTimeout(()=>{closeDropZone();},6000);
  }catch(err){
    if(box){
      box.classList.remove('box-active-converting');
      box.innerHTML=`<strong>Hata</strong><small>Başarısız</small>`;
    }
    text('#drop-hint','Hata: '+(err.message||'Dönüştürülemedi.'));
  }
}

// Global Drag & Drop Olayları
root.addEventListener('dragenter',e=>{
  e.preventDefault();e.stopPropagation();
  root.classList.add('drag-active');
  if(!isShowingDrop){
    isShowingDrop=true;
    showDropBoxes(['PNG','JPG','WEBP','PDF'],'Dosyayı buraya sürükleyin');
  }
});
root.addEventListener('dragover',e=>{
  e.preventDefault();e.stopPropagation();
  e.dataTransfer.dropEffect='copy';
  root.classList.add('drag-active');
});
root.addEventListener('dragleave',e=>{
  if(!root.contains(e.relatedTarget)){
    root.classList.remove('drag-active');
    if(!activeDropFile&&isShowingDrop){
      setTimeout(()=>{if(!root.classList.contains('drag-active')&&!activeDropFile)closeDropZone();},350);
    }
  }
});
root.addEventListener('drop',e=>{
  e.preventDefault();e.stopPropagation();
  root.classList.remove('drag-active');
  const files=e.dataTransfer?.files;
  if(files&&files.length>0){
    const file=files[0];
    activeDropFile=file;
    const ext=(file.name||'').split('.').pop().toLowerCase();
    const targets=getTargetsForType(ext);
    showDropBoxes(targets,file.name,'Dönüştürmek istediğin formata tıkla:');
  }
});

// Snapshot render
function render(value){
  snapshot=value;
  document.documentElement.dataset.theme=value.theme==='navy'?'navy':'graphite';
  text('#desk-name',value.summary?.desk||'Kişisel alan');
  if(value.microMode!==undefined&&root.dataset.mode!==(value.microMode?'micro':'normal'))root.dataset.mode=value.microMode?'micro':'normal';
  updateFocusState(value);

  if(document.activeElement!==$('#city'))$('#city').value=value.city||'';
  const displays=value.displays||[];
  if(JSON.stringify(displays)!==$('#display').dataset.signature){
    $('#display').replaceChildren(...displays.map(d=>new Option(d.name,String(d.id))));
    $('#display').dataset.signature=JSON.stringify(displays);
  }
  $('#display').value=String(value.displayId??'');

  if($('#focus-auto'))$('#focus-auto').checked=value.focusModeAuto!==false;
  if(document.activeElement!==$('#focus-apps')&&$('#focus-apps'))$('#focus-apps').value=value.focusApps||'*';

  renderWeather();renderCalendar();
  renderWidgets(value.summary?.widgets||[]);

  const sys=value.system||{},audio=sys.audio||{},media=sys.media||{};
  $('#volume').disabled=$('#mute').disabled=!audio.available;
  if(!volumePending&&document.activeElement!==$('#volume'))$('#volume').value=String(Math.round((audio.volume||0)*100));
  if(!volumePending)text('#volume-value',audio.available?Math.round((audio.volume||0)*100):'—');
  $('#mute').setAttribute('aria-label',audio.muted?'Sesi aç':'Sesi kapat');
  $('#mute use').setAttribute('href',audio.muted?'#icon-muted':'#icon-sound');
  text('#wifi-label',sys.wifi?.status==='connected'?sys.wifi.name||'Bağlı':({disconnected:'Bağlı değil',denied:'İzin gerekli'}[sys.wifi?.status]||'Wi-Fi'));
  $('#wifi').classList.toggle('active',sys.wifi?.status==='connected');
  text('#bluetooth-label',({on:'Açık',off:'Kapalı',missing:'Yok',denied:'İzin'}[sys.bluetooth?.status]||'BT'));
  $('#bluetooth').classList.toggle('active',sys.bluetooth?.status==='on');
  text('#track-title',media.available?media.title||'Medya oynatılıyor':'Sessiz bir an.');
  text('#track-artist',media.available?media.artist||'Windows':sys.available?'Müzik açtığında görünür.':'Bağlantı bekleniyor.');
  $('#play').disabled=!media.available||!(media.playing?media.canPause:media.canPlay);
  $('#previous').disabled=!media.canPrevious;$('#next').disabled=!media.canNext;
  $('#play').setAttribute('aria-label',media.playing?'Duraklat':'Oynat');
  $('#play use').setAttribute('href',media.playing?'#icon-pause':'#icon-play');
  const album=$('#album');album.hidden=!media.art;
  if(media.art&&album.getAttribute('src')!==media.art)album.src=media.art;
  if(!media.art)album.removeAttribute('src');
}

if($('#focus-save')){
  $('#focus-save').onclick=()=>{
    const focusModeAuto=$('#focus-auto')?$('#focus-auto').checked:true;
    const focusApps=$('#focus-apps')?$('#focus-apps').value.trim()||'*':'*';
    if(bridge?.setFocusSettings){
      bridge.setFocusSettings({focusModeAuto,focusApps}).then(render).catch(()=>{});
      message('Fokus modu ayarları kaydedildi.');
    }
  };
}
if($('#focus-auto')){
  $('#focus-auto').onchange=()=>{
    const focusModeAuto=$('#focus-auto').checked;
    const focusApps=$('#focus-apps')?$('#focus-apps').value.trim()||'*':'*';
    if(bridge?.setFocusSettings)bridge.setFocusSettings({focusModeAuto,focusApps}).then(render).catch(()=>{});
  };
}

clock();const clockTimer=setInterval(clock,1000);const dispose=[];
if(bridge){
  dispose.push(bridge.onState(render),bridge.onBlur(()=>{if(!root.matches(':hover')&&$('#drop-overlay').hidden){pointerInside=false;open(false);}}),bridge.onExpand(()=>open(true,{explicit:true,focus:true})));
  if(bridge.onPointer)dispose.push(bridge.onPointer(pointer));
  bridge.read().then(render).catch(e=>message(e.message));
}else message('Island masaüstü uygulamasından açılır.');

window.addEventListener('pagehide',()=>{
  clearInterval(clockTimer);clearTimeout(volumeTimer);clearTimeout(enterTimer);clearTimeout(leaveTimer);clearTimeout(statusTimer);clearTimeout(dropDismissTimer);cancelAnimationFrame(hitFrame);
  dispose.forEach(fn=>fn());
},{once:true});
reportHit();
