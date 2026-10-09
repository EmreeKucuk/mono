let latest={phase:'idle'},api,running=false,restarting=false,dialog,uiFailure='';
const labels=()=>({disabled:'Geliştirme sürümü',checking:'Güncelleme kontrol ediliyor…',downloading:`Güncelleme · %${Math.round(latest.percent||0)}`,ready:'Güncelle ve yeniden başlat',installing:'Güncelleme kuruluyor…',error:'Güncellemeyi yeniden dene',current:'MONO güncel',idle:'Güncellemeleri kontrol et'});
function showWizard(){
  if(dialog?.isConnected){if(!dialog.open)dialog.showModal();return;}
  const prior=document.activeElement;
  dialog=document.createElement('dialog');dialog.className='name-dialog update-dialog';dialog.setAttribute('aria-labelledby','update-title');
  dialog.innerHTML='<h2 id="update-title">MONO güncellemesi</h2><p data-version></p><ol class="update-steps"><li>Kontrol</li><li>İndirme</li><li>Kurulum ve yeniden açılış</li></ol><p data-status role="status" aria-live="polite"></p><progress max="100" aria-label="Güncelleme indirme ilerlemesi"></progress><p data-explanation></p><p class="small">Release içinde aynı sürüme ait .exe, .exe.blockmap ve latest.yml bulunmalı. Kurulumdan önce çalışma alanın kaydedilir. İndirme sırasında MONO’yu kullanabilirsin.</p><div class="actions"><button type="button" data-close>Kapat</button><button type="button" class="primary" data-update></button></div>';
  document.body.append(dialog);
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.querySelector('[data-update]').onclick=perform;
  dialog.addEventListener('cancel',event=>{if(restarting||latest.phase==='installing')event.preventDefault();});
  dialog.addEventListener('close',()=>{dialog.remove();dialog=null;if(prior?.isConnected&&!prior.closest('[inert]'))prior.focus();},{once:true});
  dialog.showModal();paint();dialog.querySelector('[data-close]').focus();
}
function paint(){
  const button=document.querySelector('#desktop-update'),label=labels()[latest.phase]||labels().idle;
  if(button){
    button.hidden=!api;button.disabled=latest.phase==='disabled';button.textContent=label;
    button.title=latest.message||`MONO ${latest.currentVersion||''}${latest.version?' → '+latest.version:''}`;
    button.onclick=()=>{showWizard();if(!running&&!['checking','downloading','installing','ready'].includes(latest.phase))void perform();};
  }
  if(!dialog)return;
  dialog.querySelector('[data-version]').textContent=`Mevcut sürüm: ${latest.currentVersion||'—'}${latest.version?' · Yeni sürüm: '+latest.version:''}`;
  dialog.querySelector('[data-status]').textContent=label;
  const progress=dialog.querySelector('progress');progress.hidden=!['checking','downloading','ready','installing'].includes(latest.phase);
  if(latest.phase==='checking')progress.removeAttribute('value');else progress.value=latest.percent||0;
  dialog.querySelector('[data-explanation]').textContent=uiFailure||latest.message||({checking:'Yeni sürüm aranıyor.',downloading:'Kurulum dosyası indiriliyor ve bütünlüğü doğrulanıyor.',ready:'İndirme tamamlandı. Devam ettiğinde MONO kapanacak, yeni sürüm kurulacak ve yeniden açılacak.',installing:'Kurulum başlatıldı. MONO birazdan yeniden açılacak.',current:'Bu bilgisayarda en güncel sürüm kurulu.'}[latest.phase]||'');
  const action=dialog.querySelector('[data-update]');action.textContent=latest.phase==='ready'?'Kur ve yeniden aç':latest.phase==='error'?'Yeniden dene':'Kontrol et';
  action.disabled=running||['disabled','checking','downloading','installing'].includes(latest.phase);
  dialog.querySelector('[data-close]').disabled=restarting||latest.phase==='installing';
  const step=['checking','idle','error','current','disabled'].includes(latest.phase)?0:latest.phase==='downloading'?1:2;
  dialog.querySelectorAll('.update-steps li').forEach((item,index)=>{if(index===step)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');});
}
async function perform(){
  if(running)return;
  uiFailure='';running=true;paint();const app=document.querySelector('#app');
  try{
    if(latest.phase==='ready'){
      document.activeElement?.blur();if(app)app.inert=true;
      await api.prepare();restarting=true;await window.monoDesktop.updates.install();
    }else latest=await window.monoDesktop.updates.check();
  }catch(error){restarting=false;api.cancel();uiFailure=error.message;api.notify(error.message);}
  finally{if(!restarting){if(app)app.inert=false;running=false;}paint();}
}
export function bindDesktopUpdates(){paint();}
export function installDesktopUpdates(options){
  const bridge=window.monoDesktop?.updates;if(!bridge)return;
  api=options;
  bridge.onChange(value=>{
    latest=value;
    if(value.phase==='error'&&restarting){restarting=false;running=false;api.cancel();const app=document.querySelector('#app');if(app)app.inert=false;api.notify(value.message);}
    paint();
  });
  bridge.status().then(value=>{latest=value;paint();}).catch(error=>api.notify(error.message));
}
