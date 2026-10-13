const cache = new Map();
export function weatherSummary(code) {
  return code===0?'Açık':code<=3?'Bulutlu':code<=48?'Sisli':code<=67?'Yağmurlu':code<=77?'Karlı':code<=82?'Sağanak':code<=86?'Kar yağışı':'Fırtınalı';
}
export function parseForecast(location, raw, now=Date.now()) {
  const current=raw?.current;
  if(!Number.isFinite(current?.temperature_2m)||!Number.isInteger(current?.weather_code))throw Object.assign(Error('Hava durumu verisi geçersiz.'),{status:502});
  const hourly=raw.hourly||{},daily=raw.daily||{};
  const entries=(times, make)=>Array.isArray(times)?times.slice(0,168).flatMap((time,i)=>typeof time==='string'&&/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(time)?make(time,i):[]):[];
  return {
    city:String(location.name).slice(0,80),temperature:current.temperature_2m,code:current.weather_code,isDay:current.is_day!==0,summary:weatherSummary(current.weather_code),updatedAt:now,
    currentTime:typeof current.time==='string'?current.time:'',
    hourly:entries(hourly.time,(time,i)=>Number.isFinite(hourly.temperature_2m?.[i])&&Number.isInteger(hourly.weather_code?.[i])?[{time,temperature:hourly.temperature_2m[i],code:hourly.weather_code[i],rain:Math.max(0,Math.min(100,Number(hourly.precipitation_probability?.[i])||0))}]:[]),
    daily:entries(daily.time,(date,i)=>Number.isFinite(daily.temperature_2m_min?.[i])&&Number.isFinite(daily.temperature_2m_max?.[i])?[{date,min:daily.temperature_2m_min[i],max:daily.temperature_2m_max[i],code:daily.weather_code?.[i]||0}]:[]).slice(0,3)
  };
}
export async function getWeather(city){
  if(typeof city!=='string'||city.trim().length<2||city.length>80)throw Object.assign(Error('Bir şehir adı gir.'),{status:400});
  const key=city.trim().toLocaleLowerCase('tr'),cached=cache.get(key);if(cached&&cached.until>Date.now())return cached.data;
  const geo=await fetch('https://geocoding-api.open-meteo.com/v1/search?'+new URLSearchParams({name:city,count:'1',language:'tr',format:'json'}),{signal:AbortSignal.timeout(10000)});
  if(!geo.ok)throw Object.assign(Error('Şehir servisine ulaşılamadı.'),{status:502});
  const location=(await geo.json()).results?.[0];if(!location||!Number.isFinite(location.latitude)||!Number.isFinite(location.longitude))throw Object.assign(Error('Şehir bulunamadı.'),{status:404});
  const response=await fetch('https://api.open-meteo.com/v1/forecast?'+new URLSearchParams({latitude:location.latitude,longitude:location.longitude,current:'temperature_2m,weather_code,is_day',hourly:'temperature_2m,precipitation_probability,weather_code',daily:'temperature_2m_min,temperature_2m_max,weather_code',forecast_days:'3',timezone:'auto'}),{signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Object.assign(Error('Hava durumu alınamadı.'),{status:502});
  const data=parseForecast(location,await response.json());if(cache.size>=200)cache.delete(cache.keys().next().value);cache.set(key,{until:Date.now()+1800000,data});return data;
}
