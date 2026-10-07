import {escape} from './ui-utils.js';
import {clipboardItems,mergeClipboard} from './clipboard-model.js';
let memory={enabled:true,durable:true,items:[]},lastError='',api,refreshScheduled=false,configKey='';
const preferences=()=>api?.state().settings||{clipboardDays:3,clipboardCloud:false};
const visible=()=>{
  const p=preferences(),removed=api?.state().clipboardRemoved||[];
  return (p.clipboardCloud?mergeClipboard(memory.items,api?.state().clipboardItems||[],p.clipboardDays):clipboardItems(memory.items,p.clipboardDays)).filter(item=>!p.clipboardCloud||!removed.some(r=>r.text===item.text&&r.at>=item.at));
};
function synchronize(){if(!api||!preferences().clipboardCloud)return;const state=api.state(),days=preferences().clipboardDays,removed=(state.clipboardRemoved||[]).filter(r=>!days||r.at>=Date.now()-days*86400000),items=visible();if(JSON.stringify(items)!==JSON.stringify(state.clipboardItems||[])||JSON.stringify(removed)!==JSON.stringify(state.clipboardRemoved||[])){state.clipboardItems=items;state.clipboardRemoved=removed;api.changed();}}
function refresh(){if(refreshScheduled)return;refreshScheduled=true;queueMicrotask(()=>{refreshScheduled=false;synchronize();document.querySelectorAll('.clipboard-widget').forEach(paint);});}
globalThis.window?.monoDesktop?.clipboard?.onChange(value=>{memory=value;refresh();});
globalThis.window?.monoDesktop?.clipboard?.onAction?.(action=>{
  if(!api||!preferences().clipboardCloud)return;const state=api.state();
  if(action.kind==='remove'){state.clipboardRemoved=[{text:action.text,at:action.at},...(state.clipboardRemoved||[])].slice(0,100);state.clipboardItems=(state.clipboardItems||[]).filter(i=>i.text!==action.text);}
  else state.clipboardItems=(state.clipboardItems||[]).map(i=>i.text===action.text?{...i,pinned:action.pinned,at:action.at}:i);
  api.changed();refresh();
});
async function load(){if(window.monoDesktop?.clipboard){memory=await window.monoDesktop.clipboard.list();if(!memory.enabled)memory=await window.monoDesktop.clipboard.watch(true);}refresh();}
export function configureClipboard(options){api=options;const key=String(preferences().clipboardDays);if(configKey!==key){configKey=key;window.monoDesktop?.clipboard?.configure?.({days:preferences().clipboardDays}).then(value=>{memory=value;refresh();}).catch(e=>{lastError=e.message;refresh();});}refresh();}
export function renderClipboard(){return '<section class="clipboard-widget"><p class="clipboard-message" role="status" hidden></p><div class="clipboard-list" role="list" tabindex="0" aria-label="Clipboard geçmişi"></div></section>';}
function paint(root){
  if(!root.isConnected)return;const message=root.querySelector('.clipboard-message');message.textContent=lastError||memory.error||(window.monoDesktop&&!memory.durable?'Şifreli kayıt kullanılamıyor; geçmiş yalnızca bellekte.':'');message.hidden=!message.textContent;
  const list=root.querySelector('.clipboard-list'),active=document.activeElement,focused=list.contains(active)?['copy','pin','delete'].map(key=>({key,id:active.dataset?.[key]})).find(v=>v.id):null,items=visible();
  list.innerHTML=items.map(i=>`<article class="clipboard-item" role="listitem"><p>${escape(i.text)}</p><div><small>${i.pinned?'Sabitlendi · ':''}${escape(new Date(i.at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}))}</small><button type="button" data-copy="${escape(i.id)}" aria-label="Metni panoya kopyala">Kopyala</button><button type="button" data-pin="${escape(i.id)}" aria-pressed="${i.pinned}">${i.pinned?'Çöz':'Sabitle'}</button><button type="button" data-delete="${escape(i.id)}" aria-label="Clipboard kaydını sil">×</button></div></article>`).join('')||`<p class="widget-empty">Henüz kopyalanmış metin yok.${window.monoDesktop?'':' Otomatik yakalama masaüstü uygulamasında çalışır.'}</p>`;
  list.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>run(async()=>{const item=items.find(i=>i.id===b.dataset.copy),native=window.monoDesktop?.clipboard;if(native){if(memory.items.some(i=>i.id===item.id))await native.copy(item.id);else if(native.copyText)await native.copyText(item.text);else throw Error('Bulut kaydını kopyalamak için masaüstü sürümünü güncelle.');}else await navigator.clipboard.writeText(item.text);lastError='Panoya kopyalandı.';}));
  list.querySelectorAll('[data-pin]').forEach(b=>b.onclick=()=>run(async()=>{const item=items.find(i=>i.id===b.dataset.pin);if(memory.items.some(i=>i.id===item.id)&&window.monoDesktop)memory=await window.monoDesktop.clipboard.pin(item.id);if(preferences().clipboardCloud){if(globalThis.window?.monoDesktop?.clipboard.cloudAction){await globalThis.window.monoDesktop.clipboard.cloudAction({kind:'pin',text:item.text,pinned:!item.pinned});return;}api.state().clipboardItems=items.map(i=>i.id===item.id?{...i,pinned:!i.pinned,at:Date.now()}:i);memory.items=memory.items.map(i=>i.text===item.text?{...i,pinned:!item.pinned,at:Date.now()}:i);api.changed();}}));
  list.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>run(async()=>{const item=items.find(i=>i.id===b.dataset.delete);if(memory.items.some(i=>i.id===item.id)&&window.monoDesktop)memory=await window.monoDesktop.clipboard.remove(item.id);else memory.items=memory.items.filter(i=>i.text!==item.text);if(preferences().clipboardCloud){if(globalThis.window?.monoDesktop?.clipboard.cloudAction){await globalThis.window.monoDesktop.clipboard.cloudAction({kind:'remove',text:item.text});return;}api.state().clipboardRemoved=[{text:item.text,at:Date.now()},...(api.state().clipboardRemoved||[])].slice(0,100);api.state().clipboardItems=items.filter(i=>i.text!==item.text);api.changed();}}));
  if(focused)([...list.querySelectorAll(`[data-${focused.key}]`)].find(b=>b.dataset[focused.key]===focused.id)||list).focus({preventScroll:true});
}
async function run(action){try{lastError='';await action();}catch(e){lastError='Clipboard işlemi yapılamadı: '+e.message;}refresh();}
export function bindClipboard(container){paint(container.querySelector('.clipboard-widget'));run(load);}
if(globalThis.window)setInterval(refresh,60000);
