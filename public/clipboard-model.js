export function clipboardItems(items,days=3,now=Date.now()){
  const cutoff=days===0?0:now-days*86400000,seen=new Set();
  return (Array.isArray(items)?items:[]).filter(item=>typeof item?.id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(item.id)&&typeof item.text==='string'&&item.text.trim()&&Number.isFinite(item.at)&&item.at>=cutoff&&item.at<=now+300000).sort((a,b)=>b.at-a.at).filter(item=>{if(seen.has(item.text))return false;seen.add(item.text);return true;}).sort((a,b)=>Number(b.pinned===true)-Number(a.pinned===true)||b.at-a.at).slice(0,100).map(item=>({id:item.id,text:item.text.slice(0,20000),at:item.at,pinned:item.pinned===true}));
}
export function mergeClipboard(local,remote,days=3){return clipboardItems([...local,...remote],days);}
