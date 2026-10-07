import {switchDesk,addDesk} from './desks.js';
const layout=state=>structuredClone({widgets:state.widgets,events:state.events,gridColumns:state.gridColumns,autoArrange:state.autoArrange});
export function ensureTrash(state){state.deletedPages??=[];state.deletedDesks??=[];}
export function trashPage(state,widget,page){ensureTrash(state);state.deletedPages.unshift({id:crypto.randomUUID(),widgetId:widget.id,widgetTitle:widget.title,deskId:state.activeDeskId,page:structuredClone(page),deletedAt:Date.now()});state.deletedPages=state.deletedPages.slice(0,200);}
export function deleteDesk(state,id){
  ensureTrash(state);const desk=state.desks.find(d=>d.id===id);if(!desk)throw Error('Masa bulunamadı.');
  const archived={...structuredClone(desk),workspace:desk.id===state.activeDeskId?layout(state):structuredClone(desk.workspace)};
  if(id===state.activeDeskId){const other=state.desks.find(d=>d.id!==id);if(other)switchDesk(state,other.id);else addDesk(state,'Kişisel alan');}
  state.desks=state.desks.filter(d=>d.id!==id);state.deletedDesks.unshift({id:crypto.randomUUID(),desk:archived,deletedAt:Date.now()});state.deletedDesks=state.deletedDesks.slice(0,50);
}
export function restoreDesk(state,id){
  const entry=state.deletedDesks.find(item=>item.id===id);if(!entry)throw Error('Silinen masa bulunamadı.');
  const live=new Set([state,...state.desks.map(d=>d.workspace).filter(Boolean)].flatMap(s=>s.widgets.map(w=>w.id)));
  if(entry.desk.workspace.widgets.some(w=>live.has(w.id)))throw Error('Bu masanın bazı widgetları zaten geri getirildi. Önce onları kaldır veya sayfaları ilgili masaya taşı.');
  if(state.desks.some(d=>d.id===entry.desk.id))throw Error('Bu masa zaten var.');
  state.desks.push(structuredClone(entry.desk));state.deletedDesks=state.deletedDesks.filter(item=>item!==entry);
}
export function restorePage(state,id){
  const entry=state.deletedPages.find(item=>item.id===id);if(!entry)throw Error('Silinen sayfa bulunamadı.');
  const owner=state.desks.find(d=>d.id===entry.deskId),target=owner&&owner.id!==state.activeDeskId?owner.workspace:state;
  let widget=[state,...state.desks.map(d=>d.workspace).filter(Boolean)].flatMap(s=>s.widgets).find(w=>w.id===entry.widgetId);
  if(widget&&widget.pages.some(p=>p.id===entry.page.id))throw Error('Sayfa zaten geri getirildi.');
  if(!widget){widget={id:entry.widgetId,type:'note',title:entry.widgetTitle||'Notlar',pages:[],text:'',tasks:[],grid:{slot:target.widgets.length?Math.max(...target.widgets.map(w=>w.grid.slot+w.grid.rows*target.gridColumns)):0,cols:1,rows:1}};target.widgets.push(widget);}
  widget.pages.push(structuredClone(entry.page));widget.pageId=entry.page.id;widget.text=widget.pages.some(p=>p.encrypted)?'':entry.page.blocks.map(b=>b.text).join('\n\n');state.deletedPages=state.deletedPages.filter(item=>item!==entry);
}
