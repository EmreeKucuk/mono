const $=selector=>document.querySelector(selector),bridge=window.monoIsland;
const root=$('#island'),details=$('#details'),trigger=$('#summary');
const key=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
let selected=key(new Date()),month=new Date(new Date().getFullYear(),new Date().getMonth(),1),snapshot={},expanded=false,pendingLeave=false,pointerInside=false,enterTimer,leaveTimer,hitFrame,statusTimer,freeze=false,calendarSignature='',weatherSignature='',lastDate='';
const text=(selector,value)=>{const node=$(selector);if(node.textContent!==String(value))node.textContent=String(value);};
const weatherIcon=(code,day=true)=>code===0?(day?'sun':'moon'):code<=48?'cloud':'rain';
const svg=id=>{const element=document.createElementNS('http://www.w3.org/2000/svg','svg');element.classList.add('icon');element.setAttribute('aria-hidden','true');const use=document.createElementNS(element.namespaceURI,'use');use.setAttribute('href','#icon-'+id);element.append(use);return element;};
function message(value){text('#status',value);clearTimeout(statusTimer);if(value)statusTimer=setTimeout(()=>text('#status',''),7000);}
async function act(fn){try{await fn();}catch(error){message(error.message||'İşlem tamamlanamadı.');}}
function reportHit(duration=320){cancelAnimationFrame(hitFrame);const until=performance.now()+duration;function frame(){const r=$('#hit').getBoundingClientRect();bridge?.hit({x:r.x,y:r.y,width:r.width,height:r.height});if(performance.now()<until)hitFrame=requestAnimationFrame(frame);}frame();}
function open(value,{explicit=false,focus=false}={}){
  clearTimeout(enterTimer);clearTimeout(leaveTimer);if(value&&freeze&&!explicit)return;
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
function scheduleClose(){clearTimeout(enterTimer);clearTimeout(leaveTimer);leaveTimer=setTimeout(()=>{if(pendingLeave&&expanded&&!isWriting())open(false);},260);}
function pointer(inside){
  if(inside===pointerInside)return;pointerInside=inside;
  if(inside){pendingLeave=false;clearTimeout(leaveTimer);if(!expanded&&!freeze)enterTimer=setTimeout(()=>open(true),150);}
  else{freeze=false;pendingLeave=true;scheduleClose();}
}
root.addEventListener('mouseenter',()=>pointer(true));
root.addEventListener('mouseleave',()=>pointer(false));
// Replacing a clicked calendar day can remove the DOM mouseleave target.
document.addEventListener('pointermove',event=>pointer(root.contains(event.target)));
// A text field may defer departure; leaving that field must release the panel.
details.addEventListener('focusout',()=>{if(pendingLeave&&expanded)scheduleClose();});
trigger.onclick=()=>open(true,{explicit:true,focus:true});
$('#collapse').onclick=()=>{freeze=true;open(false);};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();freeze=true;open(false);}});
window.addEventListener('resize',()=>reportHit());
function clock(){const date=new Date(),today=key(date);text('#compact-clock',date.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}));text('#full-clock',date.toLocaleTimeString('tr-TR'));$('#compact-clock').dateTime=$('#full-clock').dateTime=date.toISOString();text('#full-date',date.toLocaleDateString('tr-TR',{day:'numeric',month:'long',weekday:'long'}));text('#greeting',date.getHours()<12?'Günaydın.':date.getHours()<18?'Günün nasıl gidiyor?':'İyi akşamlar.');if(lastDate!==today){if(selected===lastDate)selected=today;lastDate=today;renderCalendar();}}
function renderCalendar(){
  const events=snapshot.summary?.events||[],signature=JSON.stringify([key(month),selected,events,lastDate]);if(signature===calendarSignature)return;calendarSignature=signature;
  text('#month-label',month.toLocaleDateString('tr-TR',{month:'long',year:'numeric'}));const fragment=document.createDocumentFragment(),first=(month.getDay()+6)%7,days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  for(let i=0;i<first;i++)fragment.append(document.createElement('span'));
  for(let day=1;day<=days;day++){const date=key(new Date(month.getFullYear(),month.getMonth(),day)),button=document.createElement('button');button.type='button';button.className='day'+(date===lastDate?' today':'')+(date===selected?' selected':'')+(events.some(e=>e.date===date)?' has-event':'');button.textContent=String(day);button.dataset.date=date;button.setAttribute('aria-label',new Date(date+'T12:00:00').toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'}));button.setAttribute('aria-pressed',String(date===selected));button.onclick=()=>{selected=date;renderCalendar();$(`[data-date="${date}"]`)?.focus();};fragment.append(button);}
  const focusedDay=$('#calendar').contains(document.activeElement)?document.activeElement.dataset.date:null;$('#calendar').replaceChildren(fragment);if(focusedDay)$(`[data-date="${focusedDay}"]`)?.focus();text('#agenda-label',selected===lastDate?'BUGÜNÜN AKIŞI':new Date(selected+'T12:00:00').toLocaleDateString('tr-TR',{day:'numeric',month:'long'}).toLocaleUpperCase('tr'));
  const rows=document.createDocumentFragment();const plans=events.filter(e=>e.date===selected).sort((a,b)=>(a.time||'99').localeCompare(b.time||'99'));
  if(!plans.length){const p=document.createElement('p');p.className='empty-agenda';p.textContent='Boş bir alan. Kendine zaman ayır.';rows.append(p);}
  for(const event of plans){const button=document.createElement('button');button.className='event';const time=document.createElement('time'),label=document.createElement('span');time.textContent=event.time||'Gün';label.textContent=event.text;button.append(time,label);button.onclick=()=>act(()=>bridge.navigate({view:'calendar',date:selected}));rows.append(button);}$('#events').replaceChildren(rows);
}
$('#prev-month').onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()-1,1);renderCalendar();};$('#next-month').onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()+1,1);renderCalendar();};
function preferences(show){$('#settings-panel').hidden=!show;$('#overview').hidden=show;$('#preferences').setAttribute('aria-expanded',String(show));if(show){open(true,{explicit:true});$('#city').focus();}else{if($('#settings-panel').contains(document.activeElement))$('#preferences').focus();if(pendingLeave)scheduleClose();}}
$('#preferences').onclick=()=>preferences($('#settings-panel').hidden);$('#city-open').onclick=()=>preferences(true);$('#settings-back').onclick=()=>preferences(false);
$('#city-form').onsubmit=e=>{e.preventDefault();act(async()=>{render(await bridge.city($('#city').value));preferences(false);});};
$('#display').onchange=e=>act(async()=>render(await bridge.display(Number(e.target.value))));
for(const [id,view] of [['dashboard','board'],['calendar-open','calendar'],['capture','capture'],['zone','zone']])$('#'+id).onclick=()=>act(()=>bridge.navigate({view,date:selected}));
for(const type of ['wifi','bluetooth'])$('#'+type).onclick=()=>act(()=>bridge.settings(type));
$('#mute').onclick=()=>act(()=>bridge.command({action:'audio.mute',value:!snapshot.system?.audio?.muted}));
let volumeTimer,volumePending=false;
$('#volume').oninput=()=>{text('#volume-value',$('#volume').value);clearTimeout(volumeTimer);volumePending=true;volumeTimer=setTimeout(()=>act(async()=>{try{await bridge.command({action:'audio.volume',value:Number($('#volume').value)/100});}finally{volumePending=false;}}),100);};
for(const [id,action] of [['play','media.playPause'],['previous','media.previous'],['next','media.next']])$('#'+id).onclick=()=>act(()=>bridge.command({action}));
function renderWeather(){const w=snapshot.weather,signature=JSON.stringify([w,snapshot.weatherError,snapshot.weatherBusy,snapshot.city]);if(signature===weatherSignature)return;weatherSignature=signature;
  text('#city-open',snapshot.city||'Şehir seç');text('#compact-temperature',w?`${Math.round(w.temperature)}°`:'—°');text('#temperature',w?Math.round(w.temperature):'—');text('#weather-summary',w?.summary||'Bulunduğun şehri seç');text('#compact-label',w?`${w.city}, ${w.summary}`:'Hava durumu için şehir seç');$('#compact-weather use').setAttribute('href','#icon-'+weatherIcon(w?.code??3,w?.isDay!==false));$('#weather-symbol use').setAttribute('href','#icon-'+weatherIcon(w?.code??3,w?.isDay!==false));
  const daily=w?.daily?.[0];text('#weather-range',daily?`En yüksek ${Math.round(daily.max)}° · En düşük ${Math.round(daily.min)}°`:'');
  const forecast=document.createDocumentFragment();const hours=(w?.hourly||[]).filter(h=>h.time>=(w.currentTime||'')).slice(0,4);for(const hour of hours){const item=document.createElement('div');item.className='forecast-hour';const t=document.createElement('time'),temp=document.createElement('span');t.textContent=hour.time.slice(11,16);temp.textContent=Math.round(hour.temperature)+'°';item.title=`Yağış olasılığı %${hour.rain}`;item.append(t,svg(weatherIcon(hour.code)),temp);forecast.append(item);}$('#forecast').replaceChildren(forecast);
  text('#weather-status',snapshot.weatherBusy?'Güncelleniyor…':snapshot.weatherError||(!w?'Şehir ayarlardan seçilebilir.':w.updatedAt?`Güncelleme ${new Date(w.updatedAt).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}`:''));
}
function render(value){snapshot=value;document.documentElement.dataset.theme=value.theme==='navy'?'navy':'graphite';text('#desk-name',value.summary?.desk||'Kişisel alan');
  if(document.activeElement!==$('#city'))$('#city').value=value.city||'';
  const displays=value.displays||[];if(JSON.stringify(displays)!==$('#display').dataset.signature){$('#display').replaceChildren(...displays.map(d=>new Option(d.name,String(d.id))));$('#display').dataset.signature=JSON.stringify(displays);}$('#display').value=String(value.displayId??'');
  renderWeather();renderCalendar();const sys=value.system||{},audio=sys.audio||{},media=sys.media||{};
  $('#volume').disabled=$('#mute').disabled=!audio.available;if(!volumePending&&document.activeElement!==$('#volume'))$('#volume').value=String(Math.round((audio.volume||0)*100));if(!volumePending)text('#volume-value',audio.available?Math.round((audio.volume||0)*100):'—');$('#mute').setAttribute('aria-label',audio.muted?'Sesi aç':'Sesi kapat');$('#mute use').setAttribute('href',audio.muted?'#icon-muted':'#icon-sound');
  text('#wifi-label',sys.wifi?.status==='connected'?sys.wifi.name||'Bağlı':({disconnected:'Bağlı değil',denied:'İzin gerekli'}[sys.wifi?.status]||'Kullanılamıyor'));$('#wifi').classList.toggle('active',sys.wifi?.status==='connected');text('#bluetooth-label',({on:'Açık',off:'Kapalı',missing:'Adaptör yok',denied:'İzin gerekli'}[sys.bluetooth?.status]||'Kullanılamıyor'));$('#bluetooth').classList.toggle('active',sys.bluetooth?.status==='on');
  text('#track-title',media.available?media.title||'Medya oynatılıyor':'Sessiz bir an.');text('#track-artist',media.available?media.artist||'Windows medya oturumu':sys.available?'Bir uygulamada müzik açtığında burada görünür.':'Windows bağlantısı bekleniyor.');$('#play').disabled=!media.available||!(media.playing?media.canPause:media.canPlay);$('#previous').disabled=!media.canPrevious;$('#next').disabled=!media.canNext;$('#play').setAttribute('aria-label',media.playing?'Duraklat':'Oynat');$('#play use').setAttribute('href',media.playing?'#icon-pause':'#icon-play');const album=$('#album');album.hidden=!media.art;if(media.art&&album.getAttribute('src')!==media.art)album.src=media.art;if(!media.art)album.removeAttribute('src');
}
clock();const clockTimer=setInterval(clock,1000);const dispose=[];
if(bridge){dispose.push(bridge.onState(render),bridge.onBlur(()=>{if(!root.matches(':hover')){pointerInside=false;open(false);}}),bridge.onExpand(()=>open(true,{explicit:true,focus:true})));if(bridge.onPointer)dispose.push(bridge.onPointer(pointer));bridge.read().then(render).catch(e=>message(e.message));}else message('Island masaüstü uygulamasından açılır.');
window.addEventListener('pagehide',()=>{clearInterval(clockTimer);clearTimeout(volumeTimer);clearTimeout(enterTimer);clearTimeout(leaveTimer);clearTimeout(statusTimer);cancelAnimationFrame(hitFrame);dispose.forEach(fn=>fn());},{once:true});reportHit();
