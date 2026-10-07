import {clipboardItems} from '../public/clipboard-model.js';
import {randomUUID} from 'node:crypto';

// Electron 44's clipboard methods are asynchronous. Serialize reads, writes and
// clears so a slow poll cannot repopulate a freshly cleared history.
export function createClipboardController({clipboard,getHistory,persist}){
  let queue=Promise.resolve(),capturePending=null,lastText='';
  const enqueue=operation=>{
    const job=queue.catch(()=>{}).then(operation);
    queue=job;
    return job;
  };
  async function readText(){
    const value=await clipboard.readText();
    if(typeof value!=='string')throw Error('Pano geçerli bir metin döndürmedi.');
    return value;
  }
  function capture({automatic=false}={}){
    if(capturePending)return capturePending;
    const job=enqueue(async()=>{
      if(automatic&&!getHistory().enabled)return;
      const history=getHistory(),pruned=clipboardItems(history.items,history.days??3);
      if(pruned.length!==history.items.length){history.items=pruned;await persist();}
      const text=await readText();
      if(automatic&&!history.enabled)return;
      if(!text.trim()||text===lastText)return;
      const bounded=text.slice(0,20000),existing=history.items.find(item=>item.text===bounded);
      if(existing){existing.at=Date.now();history.items=history.items.filter(item=>item!==existing);history.items.unshift(existing);}
      else history.items.unshift({id:randomUUID(),text:bounded,at:Date.now(),pinned:false});
      lastText=text;
      history.items=[...history.items.filter(item=>item.pinned),...history.items.filter(item=>!item.pinned)].slice(0,100);
      await persist();
    });
    capturePending=job;
    job.finally(()=>{if(capturePending===job)capturePending=null;}).catch(()=>{});
    return job;
  }
  return {
    capture,
    copy:id=>enqueue(async()=>{
      const item=getHistory().items.find(item=>item.id===id);
      if(!item)return false;
      await clipboard.writeText(item.text);
      lastText=item.text;
      return true;
    }),
    clear:()=>enqueue(async()=>{
      lastText=await readText();
      getHistory().items=[];
      await persist();
    })
  };
}
