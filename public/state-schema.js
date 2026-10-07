import {preferences} from './preferences.js';
import {clipboardItems} from './clipboard-model.js';
import {sanitizeDrawing} from './drawing.js';
// A persisted workspace is untrusted input, even when it belongs to this account.
export const STATE_VERSION=4;
import { spotifyContent } from './spotify-url.js';
const types=new Set(['tasks','note','calendar','focus','habits','links','journal','goal','dates','spotify','clipboard','drawing']);
const blockTypes=new Set(['text','title','subtitle','bullet','check','number','quote']);
const str=(value,max=10000)=>String(typeof value==='string'?value:'').slice(0,max);
const list=(value,max=500)=>Array.isArray(value)?value.slice(0,max):[];
const number=(value,fallback=0,min=0,max=1e7)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
const integer=(value,fallback=0,min=0,max=1e7)=>Math.trunc(number(value,fallback,min,max));
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(value)?value:crypto.randomUUID();
const date=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const parsed=new Date(value+'T12:00:00');
  return !Number.isNaN(parsed.getTime())&&parsed.getFullYear()===Number(value.slice(0,4))&&parsed.getMonth()+1===Number(value.slice(5,7))&&parsed.getDate()===Number(value.slice(8,10))?value:null;
};
export function safeHttpUrl(value){
  try{
    const url=new URL(value);
    return url.protocol==='https:'||url.protocol==='http:'?url.href:null;
  }
  catch{
    return null;
  }
}
const block=value=>({
  id:id(value?.id),type:blockTypes.has(value?.type)?value.type:'text',text:str(value?.text,100000),indent:integer(value?.indent,0,0,3),done:value?.done===true
});
export const sanitizeNoteBlocks=value=>list(value,2000).map(block);
function encrypted(value){
  if(value===undefined)return null;
  if(!value||value.version!==1||value.iterations!==600000||typeof value.salt!=='string'||typeof value.iv!=='string'||typeof value.ciphertext!=='string'||!(/^[A-Za-z0-9+/]{22}==$/.test(value.salt))||!(/^[A-Za-z0-9+/]{16}$/.test(value.iv))||value.ciphertext.length<24||value.ciphertext.length>1500000||!(/^[A-Za-z0-9+/]+={0,2}$/.test(value.ciphertext)))throw Error('Şifreli sayfa verisi geçersiz.');
  if(value.credential!==undefined&&value.credential!=='pin')throw Error('Şifreli sayfanın koruma türü geçersiz.');
  return {version:1,iterations:600000,salt:value.salt,iv:value.iv,ciphertext:value.ciphertext,...(value.credential==='pin'?{credential:'pin'}:{})};
}
const task=value=>({
  id:id(value?.id),text:str(value?.text,300),done:value?.done===true,groupId:value?.groupId==null?null:id(value.groupId)
});
function widget(value){
  if(!value||!types.has(value.type))return null;
  const w={
    id:id(value.id),type:value.type,title:value.type==='note'&&value.title==='Aklımdakiler'?'Notlar':str(value.title,60)||value.type,x:number(value.x),y:number(value.y),width:number(value.width,320,100,3000)
  };
  if(value.grid&&typeof value.grid==='object')w.grid={
    slot:integer(value.grid.slot,0,0,10000),cols:integer(value.grid.cols,1,1,6),rows:integer(value.grid.rows,1,1,100)
  };
  w.text=str(value.text,200000);
  if(w.type==='drawing')w.drawing=sanitizeDrawing(value.drawing);
  if(w.type==='spotify')w.spotifyUrl=spotifyContent(value.spotifyUrl)?.url||'';
  w.tasks=list(value.tasks,1000).map(task);
  w.groups=list(value.groups,100).map(g=>({
    id:id(g?.id),name:str(g?.name,60),collapsed:g?.collapsed===true
  }));
  const groupIds=new Set(w.groups.map(g=>g.id));
  for(const t of w.tasks)if(!groupIds.has(t.groupId))t.groupId=null;
  w.generalCollapsed=value.generalCollapsed===true;
  w.pages=list(value.pages,100).map(p=>{const secret=encrypted(p?.encrypted);return {id:id(p?.id),name:str(p?.name,80)||'Sayfa',blocks:secret?[]:sanitizeNoteBlocks(p?.blocks),...(secret?{encrypted:secret}:{})};});
  if(w.pages.some(page=>page.encrypted)){
    if(w.id!==value.id||w.pages.some((p,i)=>p.encrypted&&p.id!==value.pages[i]?.id))throw Error('Şifreli sayfa kimliği geçersiz.');
    if(new Set(w.pages.map(p=>p.id)).size!==w.pages.length)throw Error('Şifreli sayfa kimlikleri benzersiz olmalı.');
    w.text='';
  }
  w.pageId=w.pages.some(p=>p.id===value.pageId)?value.pageId:w.pages[0]?.id;
  w.habits=list(value.habits,100).map(h=>({
    id:id(h?.id),name:str(h?.name,80),days:list(h?.days,2000).map(date).filter(Boolean)
  }));
  w.links=list(value.links,200).map(l=>({
    id:id(l?.id),name:str(l?.name,80),url:safeHttpUrl(l?.url)
  })).filter(l=>l.url);
  w.entries=Object.fromEntries(Object.entries(value.entries&&typeof value.entries==='object'&&!Array.isArray(value.entries)?value.entries:{
  }).filter(([day])=>date(day)).slice(0,1000).map(([day,text])=>[day,str(text,100000)]));
  w.entryDate=date(value.entryDate)||new Date().toISOString().slice(0,10);
  w.goal={
    name:str(value.goal?.name,80)||'Yeni hedef',current:number(value.goal?.current,0,0,1e9),target:number(value.goal?.target,10,1,1e9)
  };
  w.dates=list(value.dates,200).map(d=>({
    id:id(d?.id),name:str(d?.name,80),date:date(d?.date)
  })).filter(d=>d.date);
  w.duration=integer(value.duration,25,1,1440);
  w.remaining=integer(value.remaining,1500,0,86400);
  w.running=value.running===true;
  w.endAt=number(value.endAt,0,0,1e15)||null;
  return w;
}
function sanitizeLayout(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Çalışma alanı verisi geçersiz.');
  if(!Array.isArray(input.widgets)||!Array.isArray(input.events))throw new Error('Çalışma alanının widget ve etkinlik listeleri geçersiz.');
  const widgets=list(input.widgets,200).map(widget).filter(Boolean),ids=new Set();
  for(const w of widgets){
    if(ids.has(w.id)){if(w.pages.some(p=>p.encrypted))throw Error('Şifreli widget kimliği benzersiz olmalı.');w.id=crypto.randomUUID();}
    ids.add(w.id);
  }
  return {
    gridColumns:integer(input.gridColumns,3,2,6),autoArrange:input.autoArrange!==false,widgets,events:list(input.events,2000).map(e=>({
      id:id(e?.id),date:date(e?.date),text:str(e?.text,180),...(typeof e?.time==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time)?{time:e.time}:{})
    })).filter(e=>e.date)
  };
}
export function sanitizeWorkspace(input){
  const layout=sanitizeLayout(input),version=input.schemaVersion??0;
  if(!Number.isInteger(version)||version>STATE_VERSION||version<0)throw new Error('Desteklenmeyen çalışma alanı sürümü.');
  const settings=preferences(input.settings);
  const global={settings,clipboardItems:settings.clipboardCloud?clipboardItems(input.clipboardItems,settings.clipboardDays):[],
    clipboardRemoved:settings.clipboardCloud?list(input.clipboardRemoved,100).map(r=>({text:str(r?.text,20000),at:number(r?.at,0,0,1e15)})).filter(r=>r.text&&r.at<=Date.now()+300000&&(!settings.clipboardDays||r.at>=Date.now()-settings.clipboardDays*86400000)):[],
    deletedPages:list(input.deletedPages,200).map(entry=>{const owner=id(entry?.widgetId),page=entry?.page,secret=encrypted(page?.encrypted);if(!page||typeof page.id!=='string'||id(page.id)!==page.id||owner!==entry.widgetId)throw Error('Silinen sayfa kimliği geçersiz.');return {id:id(entry.id),widgetId:owner,widgetTitle:str(entry.widgetTitle,60),deskId:str(entry.deskId,80),deletedAt:number(entry.deletedAt,0,0,1e15),page:{id:page.id,name:str(page.name,80)||'Sayfa',blocks:secret?[]:sanitizeNoteBlocks(page.blocks),...(secret?{encrypted:secret}:{})}};}),
    deletedDesks:list(input.deletedDesks,50).map(entry=>({id:id(entry?.id),deletedAt:number(entry?.deletedAt,0,0,1e15),desk:{id:id(entry?.desk?.id),name:str(entry?.desk?.name,80)||'Masa',workspace:sanitizeLayout(entry?.desk?.workspace)}})),reminders:list(input.reminders,2000).map(item=>({id:id(item?.id),text:str(item?.text,300),at:number(item?.at,0,0,1e15),done:item?.done===true,deskId:str(item?.deskId,80)})).filter(item=>item.at>0),zoneProfiles:list(input.zoneProfiles,100).map(profile=>({id:id(profile?.id),name:str(profile?.name,60)||'Zone',minutes:integer(profile?.minutes,25,0,1440),allowed:list(profile?.allowed,3).filter(value=>['reminder','focus','zone'].includes(value))})),activeZone:input.activeZone&&typeof input.activeZone==='object'?{profileId:str(input.activeZone.profileId,80),endAt:number(input.activeZone.endAt,0,0,1e15),startedAt:number(input.activeZone.startedAt,0,0,1e15),allowed:list(input.activeZone.allowed,3).filter(value=>['reminder','focus','zone'].includes(value))}:null};
  if(input.desks===undefined)return {schemaVersion:STATE_VERSION,...layout,...global,activeDeskId:'default',desks:[{id:'default',name:'Kişisel alan'}]};
  if(!Array.isArray(input.desks)||!input.desks.length)throw new Error('Masa listesi geçersiz.');
  const used=new Set();
  const desks=input.desks.map(entry=>{
    const desk={id:id(entry?.id),name:str(entry?.name,80).trim()||'Yeni masa'};
    if(used.has(desk.id))throw new Error('Masa kimlikleri benzersiz olmalı.');
    used.add(desk.id);return {...desk,...(entry?.workspace?{workspace:sanitizeLayout(entry.workspace)}:{})};
  });
  if(!used.has(input.activeDeskId))throw new Error('Etkin masa bulunamadı.');
  const activeDeskId=input.activeDeskId;
  for(const desk of desks){
    if(desk.id===activeDeskId)delete desk.workspace;
    else if(!desk.workspace)throw new Error('Masanın çalışma alanı eksik.');
  }
  const widgetIds=new Set(layout.widgets.map(widget=>widget.id));
  for(const desk of desks)for(const widget of desk.workspace?.widgets||[]){
    if(widgetIds.has(widget.id)){if(widget.pages.some(p=>p.encrypted))throw Error('Şifreli widget kimliği benzersiz olmalı.');widget.id=crypto.randomUUID();}
    widgetIds.add(widget.id);
  }
  return {schemaVersion:STATE_VERSION,...layout,...global,activeDeskId,desks};
}
