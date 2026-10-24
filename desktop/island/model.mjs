const text=(v,n=180)=>typeof v==='string'?v.slice(0,n):'';
export const EMPTY_SYSTEM={available:false,audio:{available:false,volume:0,muted:false},wifi:{status:'unknown',name:'',signal:0},bluetooth:{status:'unknown'},media:{available:false,title:'',artist:'',playing:false}};
export function systemSnapshot(value){
  if(value?.type!=='system.snapshot')throw Error('Geçersiz sistem verisi.');
  const a=value.audio||{},w=value.wifi||{},b=value.bluetooth||{},m=value.media||{};
  return {available:true,audio:{available:a.available===true,volume:Number.isFinite(a.volume)?Math.max(0,Math.min(1,a.volume)):0,muted:a.muted===true},wifi:{status:['connected','disconnected','denied'].includes(w.status)?w.status:'unknown',name:text(w.name,80),signal:Number.isFinite(w.signal)?Math.max(0,Math.min(4,w.signal)):0},bluetooth:{status:['on','off','missing','denied'].includes(b.status)?b.status:'unknown'},media:{available:m.available===true,title:text(m.title),artist:text(m.artist),playing:m.playing===true,canPlay:m.canPlay===true,canPause:m.canPause===true,canNext:m.canNext===true,canPrevious:m.canPrevious===true,art:typeof m.art==='string'&&m.art.length<400000&&/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(m.art)?m.art:''}};
}
export function systemCommand(value){
  if(value?.action==='audio.volume'&&Number.isFinite(value.value)&&value.value>=0&&value.value<=1)return {action:value.action,value:value.value};
  if(value?.action==='audio.mute'&&typeof value.value==='boolean')return {action:value.action,value:value.value};
  if(['media.playPause','media.next','media.previous'].includes(value?.action))return {action:value.action};
  throw Error('Geçersiz sistem komutu.');
}
export function workspaceSummary(state){
  const desk=text(state?.desks?.find(d=>d.id===state.activeDeskId)?.name,80)||'Kişisel alan';
  const events=Array.isArray(state?.events)?state.events.filter(e=>/^\d{4}-\d{2}-\d{2}$/.test(e.date)&&typeof e.text==='string').slice(0,2000).map(e=>({id:text(e.id,100),date:e.date,time:/^\d{2}:\d{2}$/.test(e.time)?e.time:'',text:text(e.text)})):[];
  const widgets=Array.isArray(state?.widgets)?state.widgets.map(w=>({id:text(w.id,80),type:text(w.type,30),title:text(w.title,80)||w.type})):[];
  return {desk,events,widgets};
}
export function islandBounds(display){const a=display.bounds||display.workArea||display,width=Math.min(584,a.width),height=Math.min(660,a.height);return {x:a.x+Math.round((a.width-width)/2),y:a.y,width,height};}
export function insideSurface(point,bounds,hit){
  const x=point.x-bounds.x,y=point.y-bounds.y;
  if(x<hit.x||x>hit.x+hit.width||y<hit.y||y>hit.y+hit.height)return false;
  const r=Math.min(28,hit.height/2),cx=Math.max(hit.x+r,Math.min(x,hit.x+hit.width-r)),cy=Math.max(hit.y+r,Math.min(y,hit.y+hit.height-r));
  return (x-cx)**2+(y-cy)**2<=r*r;
}
