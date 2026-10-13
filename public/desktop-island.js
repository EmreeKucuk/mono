let initialized=false,lastStatus={visible:false},statusEpoch=0,toggling=false;
const bridge=()=>window.monoDesktop?.overlayId?null:window.monoDesktop?.island;
function paint(){const button=document.querySelector('#desktop-island');if(button){button.hidden=!bridge();button.disabled=toggling;button.textContent=lastStatus.enabled===false?'Dynamic Island aç':'Dynamic Island gizle';button.setAttribute('aria-pressed',String(lastStatus.enabled!==false));}const header=document.querySelector('.topbar-date');if(header)header.hidden=lastStatus.visible===true;}
function applyStatus(value){statusEpoch++;lastStatus=value;paint();}
export function syncDesktopIsland(){const api=bridge();if(!api)return;let city='';try{city=localStorage.getItem('mono-weather-city')||'';}catch{}// Theme/weather acknowledgements must never overwrite a newer visibility event.
  api.sync({theme:document.documentElement.dataset.theme,city}).catch(()=>{});
}
export function bindDesktopIsland(){paint();const button=document.querySelector('#desktop-island');if(button)button.onclick=async()=>{if(toggling||!bridge())return;toggling=true;paint();try{applyStatus(await bridge().toggle());}catch(error){button.title=error.message;}finally{toggling=false;paint();}};}
export function installDesktopIsland({navigate,weather}){
  if(initialized||!bridge())return;initialized=true;const api=bridge();
  const status=value=>{applyStatus(value);if(value.city){try{localStorage.setItem('mono-weather-city',value.city);}catch{}}syncDesktopIsland();};
  api.onStatus(status);api.onCity(city=>{try{localStorage.setItem('mono-weather-city',city);}catch{}weather();});api.onNavigate(navigate);
  const epoch=statusEpoch;api.status().then(value=>{if(epoch===statusEpoch)status(value);}).catch(()=>{});window.addEventListener('mono-weather-city',syncDesktopIsland);window.addEventListener('mono-theme',syncDesktopIsland);
}
