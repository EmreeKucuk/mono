let loading=false;
export async function updateWeather(){
  const button=document.querySelector('#weather');if(!button||loading)return;
  let city;try{city=localStorage.getItem('mono-weather-city');}catch{}
  if(!city){button.textContent='Hava durumu · Şehir seç';return;}
  loading=true;button.textContent=city+' · …';
  try{const response=await fetch('/api/weather?city='+encodeURIComponent(city),{cache:'no-store'}),data=await response.json();if(!response.ok)throw Error(data.error);const current=document.querySelector('#weather');if(current){current.textContent=`${data.city} · ${Math.round(data.temperature)}° · ${data.summary}`;current.title='Hava durumu · Şehri değiştir';}}
  catch{const current=document.querySelector('#weather');if(current){current.textContent=city+' · Hava durumu alınamadı';current.title='Yeniden denemek veya şehri değiştirmek için tıkla';}}
  finally{loading=false;}
}
export function bindWeather(askName){
  document.querySelector('#weather').onclick=async()=>{const city=await askName({title:'Hava durumu şehri',value:localStorage.getItem('mono-weather-city')||'',maxLength:80});if(city){localStorage.setItem('mono-weather-city',city);window.dispatchEvent(new Event('mono-weather-city'));updateWeather();}};updateWeather();
}
setInterval(updateWeather,1800000);
