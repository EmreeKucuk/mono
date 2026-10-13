export function bindIslandSettings(dialog) {
  const input=dialog.querySelector('[data-island-enabled]');
  const message=dialog.querySelector('#island-setting-status');
  const bridge=window.monoDesktop?.overlayId?null:window.monoDesktop?.island;
  if(!bridge?.setEnabled) {
    input.checked=false;
    message.textContent=bridge?'Bu ayar için MONO masaüstü uygulamasını güncelle.':'Masaüstü uygulamasında kullanılabilir.';
    return;
  }
  let enabled=true,pending=false,disposed=false,epoch=0;
  const paint=()=>{input.checked=enabled;input.disabled=pending;};
  const receive=value=>{
    if(disposed)return;
    epoch++;
    enabled=value.enabled!==false;
    if(!pending)message.textContent=enabled?'Dynamic Island açık.':'Dynamic Island kapalı.';
    paint();
  };
  const unsubscribe=bridge.onStatus(receive);
  dialog.addEventListener('close',()=>{disposed=true;unsubscribe?.();},{once:true});
  input.onchange=async()=>{
    const requested=input.checked,requestEpoch=epoch;
    pending=true;input.disabled=true;message.textContent='Kaydediliyor…';
    try {
      const value=await bridge.setEnabled(requested);
      if(epoch===requestEpoch)receive(value);
      if(!disposed)message.textContent=enabled?'Dynamic Island açık.':'Dynamic Island kapalı.';
    } catch(error) {
      if(!disposed)message.textContent='Tercih kaydedilemedi. Yeniden dene. '+error.message;
    } finally {
      pending=false;if(!disposed)paint();
    }
  };
  const initialEpoch=epoch;
  bridge.status().then(value=>{if(initialEpoch===epoch)receive(value);}).catch(()=>{
    if(!disposed&&initialEpoch===epoch)message.textContent='Island durumu okunamadı. Ayarları yeniden aç.';
  });
}
