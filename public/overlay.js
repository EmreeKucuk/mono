let bridge,api,version=0,pending=false,conflicted=false,last='',ready=false;
const content=w=>JSON.stringify({...w,grid:null,x:0,y:0,width:0});
export const isOverlay=()=>!!window.monoDesktop?.overlayId;
export function publishWorkspace(state){if(!isOverlay())window.monoDesktop?.workspace?.publish(state).catch(()=>{});}
export async function startOverlay(options){
  api=options;bridge=window.monoDesktop.workspace;const initial=await bridge.read();version=initial.version;last=content(initial.state.widgets[0]);api.replace(initial.state);ready=true;
  bridge.onChange(value=>{if(pending||conflicted)return;version=value.version;const next=content(value.state.widgets[0]);if(next!==last||value.state.widgets[0].type==='clipboard'){last=next;api.replace(value.state);}});
}
export async function overlayChanged(){
  if(!ready||pending||conflicted||api.state().widgets[0]?.type==='clipboard')return;
  pending=true;
  try{
    await api.flush();
    while(true){const state=api.state(),widget=structuredClone(state.widgets[0]),signature=JSON.stringify({widget,events:state.events,deletedPages:state.deletedPages});
      const result=await bridge.commit({version,widget,events:state.events,deletedPages:state.deletedPages});version=result.version;last=content(widget);
      if(signature===JSON.stringify({widget:api.state().widgets[0],events:api.state().events,deletedPages:api.state().deletedPages}))break;
      await api.flush();
    }
  }catch(error){conflicted=true;api.notify(error.message);const box=document.createElement('dialog');box.className='name-dialog';box.setAttribute('aria-label','Mini pencere çakışması');box.innerHTML='<h2>Widget değişti</h2><p>Bu penceredeki düzenleme korunuyor. Yerel kopyayı indirip ardından güncel widgetı yükleyebilirsin.</p><div class="actions"><button data-export>Yerel kopyayı indir</button><button data-reload>Güncel widgetı yükle</button><button data-cancel>Kapat</button></div>';document.body.append(box);box.querySelector('[data-export]').onclick=api.export;box.querySelector('[data-reload]').onclick=async()=>{const current=await bridge.read();version=current.version;last=content(current.state.widgets[0]);api.replace(current.state);conflicted=false;box.close();};box.querySelector('[data-cancel]').onclick=()=>box.close();box.onclose=()=>box.remove();box.showModal();
  }finally{pending=false;}
}
export function bindOverlayButton(button,state,widget,notify){
  button.onclick=async()=>{try{if(!window.monoDesktop?.workspace)throw Error('Mini pencere için MONO masaüstü sürümünü güncelle.');await window.monoDesktop.workspace.publish(state);await window.monoDesktop.workspace.open(widget.id);}catch(error){notify(error.message);}};
}

export function hasOverlayPending(){return pending||conflicted;}
