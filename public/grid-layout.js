import {adaptiveColumns} from './preferences.js';
// Row-major placement. Persisted layout is independent of viewport pixels.
const integer=(n,fallback=0)=>Number.isInteger(n)&&n>=0?n:fallback;
export function validSpan(c,r){
  return Number.isInteger(c)&&Number.isInteger(r)&&c>=1&&c<=6&&r>=1&&r<=100;
}
export function snapSpan(c,r,columns){
  c=Math.max(1,Math.min(columns,Math.round(c)));
  r=Math.max(1,Math.min(100,Math.round(r)));
  if(validSpan(c,r))return {
    cols:c,rows:r
  };
  return {
    cols:c,rows:r+1
  };
}
const cells=(slot,c,r,columns)=>Array.from({
  length:r
},(_,y)=>Array.from({
  length:c
},(_,x)=>slot+y*columns+x)).flat();
function fit(start,c,r,columns,used){
  let slot=Math.max(0,start);
  while(true){
    if(slot%columns+c>columns){
      slot+=columns-slot%columns;
      continue;
    }
    if(cells(slot,c,r,columns).every(n=>!used.has(n)))return slot;
    slot++;
  }
}
export function arrange(widgets,columns,pinned=null,dense=false){
  const used=new Set(),result=new Map();
  const put=(w,slot,span)=>{
    cells(slot,span.cols,span.rows,columns).forEach(n=>used.add(n));
    result.set(w.id,{
      slot,cols:span.cols,rows:span.rows
    });
  };
  if(pinned){
    const span=snapSpan(pinned.cols,pinned.rows,columns);
    const slot=Math.floor(pinned.slot/columns)*columns+Math.min(pinned.slot%columns,columns-span.cols);
    put(pinned,slot,span);
  }
  let cursor=0;
  for(const w of [...widgets].sort((a,b)=>a.grid.slot-b.grid.slot)){
    if(w.id===pinned?.id)continue;
    let span=snapSpan(w.grid.cols,w.grid.rows,columns);
    if(w.grid.cols>columns)span=snapSpan(columns,Math.ceil(w.grid.cols*w.grid.rows/columns),columns);
    const slot=fit(dense?0:Math.max(cursor,w.grid.slot),span.cols,span.rows,columns,used);
    put(w,slot,span);
    cursor=slot+1;
  }
  return result;
}
// Multi-cell widgets keep their chosen footprint while smaller widgets fill around them.
export function compactAroundLarge(widgets,columns,pinned=null){
  const used=new Set(),result=new Map();
  const place=(w,preferred,span)=>{
    const slot=fit(preferred,span.cols,span.rows,columns,used);
    cells(slot,span.cols,span.rows,columns).forEach(n=>used.add(n));
    result.set(w.id,{
      slot,...span
    });
  };
  const large=[...widgets].filter(w=>w.grid.cols*w.grid.rows>1).sort((a,b)=>a.grid.slot-b.grid.slot);
  if(pinned&&pinned.cols*pinned.rows>1){
    const w=widgets.find(w=>w.id===pinned.id);
    if(w){
      place(w,Math.floor(pinned.slot/columns)*columns+Math.min(pinned.slot%columns,columns-pinned.cols),snapSpan(pinned.cols,pinned.rows,columns));
    }
  }
  for(const w of large){
    if(result.has(w.id)||w.id===pinned?.id)continue;
    const span=snapSpan(Math.min(w.grid.cols,columns),w.grid.rows,columns);
    place(w,w.grid.slot,span);
  }
  if(pinned&&!result.has(pinned.id)){
    const w=widgets.find(w=>w.id===pinned.id);
    if(w)place(w,pinned.slot,snapSpan(pinned.cols,pinned.rows,columns));
  }
  for(const w of [...widgets].sort((a,b)=>a.grid.slot-b.grid.slot)){
    if(result.has(w.id))continue;
    place(w,0,{
      cols:1,rows:1
    });
  }
  return result;
}
export function normalizeGrid(state){
  state.gridColumns=Math.max(2,Math.min(6,integer(state.gridColumns,3)));
  if(typeof state.autoArrange!=='boolean')state.autoArrange=true;
  if(state.widgets.some(w=>!w.grid)){
    const old=state.widgets.filter(w=>w.grid),fresh=state.widgets.filter(w=>!w.grid).sort((a,b)=>(a.y||0)-(b.y||0)||(a.x||0)-(b.x||0));
    let next=old.length?Math.max(...old.map(w=>w.grid.slot+w.grid.rows*state.gridColumns)):0;
    for(const w of fresh)w.grid={
      slot:next++,cols:1,rows:1
    };
  }
  for(const w of state.widgets){
    w.grid.slot=integer(w.grid.slot);
    w.grid.cols=Math.max(1,integer(w.grid.cols,1));
    w.grid.rows=Math.max(1,integer(w.grid.rows,1));
  }
  const used=new Set();
  let valid=true;
  for(const w of state.widgets){
    const g=w.grid;
    if(g.cols>state.gridColumns||g.slot%state.gridColumns+g.cols>state.gridColumns||!validSpan(g.cols,g.rows)){
      valid=false;
      break;
    }
    for(const cell of cells(g.slot,g.cols,g.rows,state.gridColumns)){
      if(used.has(cell)){
        valid=false;
        break;
      }
      used.add(cell);
    }
    if(!valid)break;
  }
  if(!valid)applyLayout(state,compactAroundLarge(state.widgets,state.gridColumns));
}
export function applyLayout(state,layout){
  for(const w of state.widgets)w.grid={
    ...layout.get(w.id)
  };
}
export function rowCount(state,layout=new Map(state.widgets.map(w=>[w.id,w.grid]))){
  return Math.max(1,...[...layout.values()].map(g=>Math.floor(g.slot/state.gridColumns)+g.rows));
}
export function gridStyle(g,columns){
  return `grid-column:${g.slot%columns+1}/span ${g.cols};grid-row:${Math.floor(g.slot/columns)+1}/span ${g.rows};`;
}
export function swapAndCompact(state,id,targetSlot){
  const columns=state.gridColumns,moved=state.widgets.find(w=>w.id===id);
  if(!moved)return new Map(state.widgets.map(w=>[w.id,w.grid]));
  const occupant=state.widgets.find(w=>w.id!==id&&cells(w.grid.slot,w.grid.cols,w.grid.rows,columns).includes(targetSlot));
  if(!occupant||occupant.grid.cols!==moved.grid.cols||occupant.grid.rows!==moved.grid.rows){
    return compactAroundLarge(state.widgets,columns,{
      id:moved.id,slot:targetSlot,cols:moved.grid.cols,rows:moved.grid.rows
    });
  }
  const preferred=state.widgets.map(w=>({
    ...w,grid:{
      ...w.grid
    }
  }));
  preferred.find(w=>w.id===id).grid.slot=occupant.grid.slot;
  preferred.find(w=>w.id===occupant.id).grid.slot=moved.grid.slot;
  return compactAroundLarge(preferred,columns);
}
export function placeFreely(state,id,targetSlot){
  const columns=state.gridColumns,moved=state.widgets.find(w=>w.id===id),layout=new Map(state.widgets.map(w=>[w.id,{
    ...w.grid
  }]));
  if(!moved)return layout;
  const slot=Math.floor(targetSlot/columns)*columns+Math.min(targetSlot%columns,columns-moved.grid.cols);
  if(slot===moved.grid.slot)return layout;
  const targetCells=cells(slot,moved.grid.cols,moved.grid.rows,columns);
  const conflicts=state.widgets.filter(w=>w.id!==id&&cells(w.grid.slot,w.grid.cols,w.grid.rows,columns).some(n=>targetCells.includes(n)));
  if(!conflicts.length){
    layout.get(id).slot=slot;
    return layout;
  }
  if(conflicts.length===1&&conflicts[0].grid.cols===moved.grid.cols&&conflicts[0].grid.rows===moved.grid.rows){
    layout.get(id).slot=slot;
    layout.get(conflicts[0].id).slot=moved.grid.slot;
    return layout;
  }
  return arrange(state.widgets,columns,{
    id,slot,cols:moved.grid.cols,rows:moved.grid.rows
  });
}
export function collapseFour(state){
  if(state.autoArrange!==false||state.gridColumns!==3||state.widgets.length!==4)return false;
  if(!state.widgets.every(w=>w.grid.cols===1&&w.grid.rows===1))return false;
  if(state.widgets.map(w=>w.grid.slot).sort((a,b)=>a-b).join(',')!=='0,1,3,4')return false;
  state.gridColumns=2;
  for(const w of state.widgets)w.grid.slot=Math.floor(w.grid.slot/3)*2+w.grid.slot%3;
  return true;
}
export function appendGridWidget(state,w,slot){
  normalizeGrid(state);
  const c=state.gridColumns;
  const last=state.widgets.length?Math.max(...state.widgets.flatMap(w=>cells(w.grid.slot,w.grid.cols,w.grid.rows,c)))+1:0;
  w.grid={
    slot:slot??last,cols:1,rows:1
  };
  state.widgets.push(w);
  applyLayout(state,state.autoArrange===false?arrange(state.widgets,c,slot===undefined?null:{
    id:w.id,...w.grid
  }):compactAroundLarge(state.widgets,c,slot===undefined?null:{
    id:w.id,...w.grid
  }));
  collapseFour(state);
}
export function changeColumns(state,columns){
  normalizeGrid(state);
  state.gridColumns=columns;
  applyLayout(state,arrange(state.widgets,columns,null,true));
}
export function pointSlot(surface,x,y,columns){
  const rect=surface.getBoundingClientRect(),columnStep=(surface.clientWidth+16)/columns,rowStep=parseFloat(getComputedStyle(surface).getPropertyValue('--cell-size'))+16;
  return Math.max(0,Math.floor((y-rect.top)/rowStep))*columns+Math.max(0,Math.min(columns-1,Math.floor((x-rect.left)/columnStep)));
}
let cleanup=()=>{
};
export function disposeGrid(){
  cleanup();
  cleanup=()=>{
  };
}
export function bindGrid(state,desk,{
  changed,render,announce,adapt=()=>{}
}){
  cleanup();
  const surface=desk.querySelector('.grid-surface');
  if(!surface)return;
  const columns=state.gridColumns;
  const size=()=>{
    const prefs=state.settings||{},scale=prefs.widgetScale||1;
    surface.style.setProperty('--cell-size',Math.round(Math.min(480,Math.max(260,(surface.clientWidth-(columns-1)*16)/columns*.75))*scale)+'px');
    if(prefs.gridMode==='auto'&&!surface.classList.contains('grid-editing')){const desired=adaptiveColumns(desk.clientWidth-6,prefs.minWidgetWidth||280);if(desired!==columns)adapt(desired);}
  };
  size();
  const observer=new ResizeObserver(size);
  observer.observe(surface);
  let cancelCurrent=null;
  cleanup=()=>{
    observer.disconnect();
    cancelCurrent?.();
  };
  const paint=layout=>{
    for(const w of state.widgets){
      const el=surface.querySelector(`[data-id="${w.id}"]`),g=layout.get(w.id);
      el.style.cssText=gridStyle(g,columns);
    }
    surface.style.gridTemplateRows=`repeat(${rowCount(state,layout)},var(--cell-size))`;
  };
  const commit=(layout,w,resize=false)=>{
    applyLayout(state,layout);
    collapseFour(state);
    changed();
    render();
    const selector=document.querySelector('#grid-select');
    if(selector)selector.value=String(state.gridColumns);
    const el=document.querySelector(`[data-id="${w.id}"] ${resize?'.resize-handle':'.widget-head'}`);
    el?.focus({
      preventScroll:true
    });
  };
  for(const w of state.widgets){
    const el=surface.querySelector(`[data-id="${w.id}"]`),head=el.querySelector('.widget-head'),handle=el.querySelector('.resize-handle');
    const start=(e,resize)=>{
      if(e.button!==0||(!resize&&e.target.closest('button,select,input')))return;
      e.preventDefault();
      const control=resize?handle:head,original={
        ...w.grid
      },sx=e.clientX,sy=e.clientY,rect=el.getBoundingClientRect(),offsetX=e.clientX-rect.left,offsetY=e.clientY-rect.top,initialSurface=surface.getBoundingClientRect();
      let layout=null,moved=false,lastX=e.clientX,lastY=e.clientY,frame;
      control.setPointerCapture(e.pointerId);
      el.classList.add('grid-dragging');
      surface.classList.add('grid-editing');
      const preview=document.createElement('div');
      preview.className='grid-preview';
      preview.setAttribute('aria-hidden','true');
      surface.append(preview);
      function update(x,y){
        const s=surface.getBoundingClientRect(),columnStep=(surface.clientWidth+16)/columns,rowStep=parseFloat(getComputedStyle(surface).getPropertyValue('--cell-size'))+16;
        let target;
        if(resize){
          const span=snapSpan(original.cols+(x-sx+initialSurface.left-s.left)/columnStep,original.rows+(y-sy+initialSurface.top-s.top)/rowStep,columns);
          target={
            id:w.id,slot:original.slot,...span
          };
        }
        else{
          const c=Math.max(0,Math.min(columns-original.cols,Math.round((x-s.left-offsetX)/columnStep))),r=Math.max(0,Math.round((y-s.top-offsetY)/rowStep));
          target={
            id:w.id,slot:r*columns+c,cols:original.cols,rows:original.rows
          };
        }
        layout=resize?(state.autoArrange===false?arrange(state.widgets,columns,target):compactAroundLarge(state.widgets,columns,target)):(state.autoArrange===false?placeFreely(state,w.id,target.slot):swapAndCompact(state,w.id,target.slot));
        paint(layout);
        const g=layout.get(w.id);
        preview.style.cssText=gridStyle(g,columns);
        preview.textContent=resize?`${g.cols} × ${g.rows} · ${g.cols*g.rows} hücre`:`${g.slot%columns+1}. sütun · ${Math.floor(g.slot/columns)+1}. satır`;
      }
      const move=e=>{
        lastX=e.clientX;
        lastY=e.clientY;
        if(Math.abs(lastX-sx)+Math.abs(lastY-sy)>5)moved=true;
        if(moved)update(lastX,lastY);
      };
      const scroll=()=>{
        if(moved){
          const bounds=desk.getBoundingClientRect();
          const dx=lastX>bounds.right-35?12:lastX<bounds.left+35?-12:0;
          const dy=lastY>innerHeight-55?14:lastY<70?-14:0;
          if(dx)desk.scrollLeft+=dx;
          if(dy)window.scrollBy(0,dy);
          if(dx||dy)update(lastX,lastY);
        }
        frame=requestAnimationFrame(scroll);
      };
      frame=requestAnimationFrame(scroll);
      const finish=cancel=>{
        cancelAnimationFrame(frame);
        control.removeEventListener('pointermove',move);
        control.removeEventListener('pointerup',up);
        control.removeEventListener('pointercancel',abort);
        document.removeEventListener('keydown',escape);
        cancelCurrent=null;
        preview.remove();
        el.classList.remove('grid-dragging');
        surface.classList.remove('grid-editing');
        if(control.hasPointerCapture(e.pointerId))control.releasePointerCapture(e.pointerId);
        if(!cancel&&moved&&layout)commit(layout,w,resize);
        else paint(new Map(state.widgets.map(w=>[w.id,w.grid])));
      };
      const up=()=>finish(false),abort=()=>finish(true),escape=e=>{
        if(e.key==='Escape'){
          e.preventDefault();
          e.stopPropagation();
          finish(true);
        }
      };
      cancelCurrent=abort;
      control.addEventListener('pointermove',move);
      control.addEventListener('pointerup',up);
      control.addEventListener('pointercancel',abort);
      document.addEventListener('keydown',escape);
    };
    head.onpointerdown=e=>start(e,false);
    handle.onpointerdown=e=>{if(state.settings?.resizeWidgets!==false)start(e,true);};
    head.onkeydown=e=>{
      if(e.target!==head||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
      e.preventDefault();
      const delta={
        ArrowLeft:-1,ArrowRight:1,ArrowUp:-columns,ArrowDown:columns
      }
      [e.key],slot=Math.max(0,w.grid.slot+delta);
      commit(state.autoArrange===false?placeFreely(state,w.id,slot):swapAndCompact(state,w.id,slot),w);
    };
    handle.onkeydown=e=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
      e.preventDefault();
      let c=w.grid.cols,r=w.grid.rows;
      const horizontal=e.key==='ArrowLeft'||e.key==='ArrowRight',step=e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:1;
      do{
        if(horizontal)c+=step;
        else r+=step;
        if(c<1||c>columns||r<1||r>100)return;
      }
      while(!validSpan(c,r));
      const target={
        id:w.id,slot:w.grid.slot,cols:c,rows:r
      };
      commit(state.autoArrange===false?arrange(state.widgets,columns,target):compactAroundLarge(state.widgets,columns,target),w,true);
    };
  }
}
