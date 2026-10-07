import {confirmAction} from './confirm-dialog.js';
import { clipboardType,readClipboardBlocks,deletionBoundary } from './editor-input.js';
import {isPageOpen,openedPage,protectPage,unlockPage,saveOpenedPage,lockPage,removePassword,askPassword} from './note-vault.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}
[char]));
const makeBlock=(type='text',text='')=>({
  id:crypto.randomUUID(),type,text,indent:0,done:false
});
const commands={
  title:'title',h1:'title',subtitle:'subtitle',h2:'subtitle',bullet:'bullet',list:'bullet',check:'check',todo:'check',number:'number',quote:'quote',text:'text'
};
const names={
  text:'Metin',title:'Başlık',subtitle:'Alt başlık',bullet:'Madde',check:'Kontrol maddesi',number:'Numaralı madde',quote:'Alıntı'
};
const histories=new Map();
export function forgetNotebook(widgetId,pageId=null){
  for(const key of histories.keys())if(pageId?key===widgetId+':'+pageId:key.startsWith(widgetId+':'))histories.delete(key);
}
function pageOf(w){
  if(!w.pages?.length)w.pages=[{
    id:crypto.randomUUID(),name:'İlk sayfa',blocks:(w.text||'').split('\n\n').map(text=>makeBlock('text',text))
  }];
  if(!w.pages.some(page=>page.id===w.pageId))w.pageId=w.pages[0].id;
  for(const page of w.pages)if(!page.encrypted&&!page.blocks?.length)page.blocks=[makeBlock()];
  return openedPage(w.pages.find(page=>page.id===w.pageId));
}
function slashAt(text,offset,space=false){
  const match=text.slice(0,offset).match(space?/(^|[\s(])\/([a-z0-9]+) $/i:/(^|[\s(])\/([a-z0-9]*)$/i);
  return match?{
    query:match[2].toLowerCase(),start:offset-match[0].length+match[1].length,end:offset
  }
  :null;
}
export function renderNotebook(w){
  const page=pageOf(w),raw=w.pages.find(page=>page.id===w.pageId),locked=!isPageOpen(raw);
  let number=0;
  const blocks=page.blocks.map((block,index)=>{
    number=block.type==='number'?number+1:0;
    return `<div class="note-block block-${block.type}" data-block="${block.id}" style="--indent:${block.indent||0}">${block.type==='check'?`<input type="checkbox" data-block-check="${block.id}" aria-label="${esc(block.text||'Kontrol maddesi')} tamamlandı" ${block.done?'checked':''}>`:`<span class="block-marker" aria-hidden="true">${block.type==='bullet'?'•':block.type==='number'?number+'.':block.type==='quote'?'│':''}</span>`}<span class="block-input ${block.done?'checked':''}" data-block-input="${block.id}" data-placeholder="${index===0&&page.blocks.every(item=>!item.text.trim())?'Yazmaya başla veya / komutunu kullan…':''}">${esc(block.text)}</span></div>`;
  }).join('');
  const security=raw.encrypted?`<button type="button" ${locked?'data-page-unlock':'data-page-lock'}>${locked?'Kilidi aç':'Kilitle'}</button>${locked?'':'<button type="button" data-page-repin>PIN değiştir</button><button type="button" data-page-unprotect>PIN / şifre kaldır</button>'}`:'<button type="button" data-page-protect>PIN koy</button>';
  if(locked)return `<div class="notebook" data-notebook-widget="${w.id}"><div class="notebook-pages"><select data-page aria-label="Not sayfası">${w.pages.map(item=>`<option value="${item.id}" ${item.id===w.pageId?'selected':''}>${esc(item.name)}</option>`).join('')}</select><button data-page-list class="icon" aria-label="Sayfa listesi ve silme">☷</button><button data-page-add aria-label="Yeni sayfa">+</button><button data-page-rename aria-label="Sayfayı yeniden adlandır">✎</button><button data-expand aria-label="Notu genişlet">↗</button></div><div class="note-security">${security}</div><div class="note-locked"><strong>Bu sayfa kilitli</strong><p>İçeriği görmek için sayfanın şifresini gir.</p></div></div>`;
  return `<div class="notebook" data-notebook-widget="${w.id}"><div class="notebook-pages"><select data-page aria-label="Not defteri sayfası">${w.pages.map(item=>`<option value="${item.id}" ${item.id===w.pageId?'selected':''}>${esc(item.name)}</option>`).join('')}</select><button data-page-list class="icon" aria-label="Sayfa listesi ve silme">☷</button><button data-page-add class="icon" aria-label="Yeni sayfa" title="Yeni sayfa · Ctrl+Shift+N">＋</button><button data-page-rename class="icon" aria-label="Sayfayı yeniden adlandır">✎</button><button data-expand class="icon" aria-label="Not defterini genişlet">⛶</button></div><div class="note-security">${security}</div><div class="note-document" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${esc(page.name)} içeriği" spellcheck="true">${blocks}</div><div class="note-bottom"><span data-page-count>${page.blocks.reduce((n,b)=>n+b.text.length,0)} karakter</span><span>${w.pages.length} sayfa</span></div><details class="command-guide"><summary>/ Komutlar ve kısayollar</summary><div class="command-list">${[['/title','Başlık'],['/subtitle','Alt başlık'],['/bullet','Madde listesi'],['/check','Kontrol listesi'],['/number','Numaralı liste'],['/quote','Alıntı'],['/text','Normal metin']].map(([cmd,label])=>`<button type="button" data-command="${cmd.slice(1)}"><code>${cmd}</code><span>${label}</span></button>`).join('')}</div><p>Komut + boşluk ile yazmaya başla. Shift+Enter: aynı blokta yeni satır. Enter: yeni blok; boş maddede listeden çık. Esc: normal metne geç. Tab / Shift+Tab: maddeyi içeri / dışarı al. Ctrl+Z: geri al.</p></details></div>`;
}
export function bindNotebook(w,root,{
  changed,askName,notify=()=>{},deleted=()=>{}
}){
  let active=pageOf(w).blocks[0]?.id,lastEdit=0,composing=false,menuIndex=0,menuItems=[],dismissedCommand=null;
  const menu=document.getElementById('slash-menu')||Object.assign(document.body.appendChild(document.createElement('div')),{
    id:'slash-menu',className:'slash-menu',hidden:true
  });
  const history=()=>{
    const key=w.id+':'+w.pageId;
    if(!histories.has(key))histories.set(key,{
      undo:[],redo:[]
    });
    return histories.get(key);
  };
  const record=(typing=false)=>{
    const now=Date.now();
    if(!typing||now-lastEdit>600){
      history().undo.push({
        blocks:structuredClone(pageOf(w).blocks),selection:selectedRange()
      });
      if(history().undo.length>100)history().undo.shift();
    }
    history().redo=[];
    lastEdit=typing?now:0;
  };
  const sync=()=>{
    const hints=root.querySelectorAll('.block-input'),empty=pageOf(w).blocks.every(b=>!b.text.trim());hints.forEach((input,index)=>{input.dataset.placeholder=index===0&&empty?'Yazmaya başla veya / komutunu kullan…':'';});
    const raw=w.pages.find(page=>page.id===w.pageId);
    w.text=w.pages.some(page=>page.encrypted)?'':pageOf(w).blocks.map(block=>block.text).join('\n\n');
    if(raw.encrypted&&isPageOpen(raw))saveOpenedPage(raw,w.id).then(changed).catch(error=>notify(error.message));
    else changed();
  };
  const editor=()=>root.querySelector('.note-document');
  menu.setAttribute('role','listbox');
  menu.setAttribute('aria-label','Not komutları');
  const hideMenu=()=>{
    menu.hidden=true;
    editor()?.removeAttribute('aria-activedescendant');
  };
  function selectionPoint(node,offset){
    const area=editor(),blocks=[...area.querySelectorAll(':scope > .note-block')];
    let element=node.nodeType===1?node:node.parentElement,block=element?.closest('.note-block');
    if(!block||!area.contains(block)){
      const index=Math.max(0,Math.min(blocks.length-1,offset-(node===area?1:0)));
      return {
        index,offset:offset>0?pageOf(w).blocks[index].text.length:0
      };
    }
    const index=blocks.indexOf(block),content=block.querySelector('.block-input'),probe=document.createRange();
    probe.selectNodeContents(content);
    try{
      probe.setEnd(node,offset);
    }
    catch{
      probe.selectNodeContents(content);
    }
    return {
      index,offset:Math.max(0,Math.min(content.textContent.length,probe.toString().length))
    };
  }
  function selectedRange(){
    const selection=window.getSelection();
    if(!selection?.rangeCount)return null;
    const range=selection.getRangeAt(0),area=editor();
    if(!area||!area.contains(range.commonAncestorContainer))return null;
    return {
      start:selectionPoint(range.startContainer,range.startOffset),end:selectionPoint(range.endContainer,range.endOffset),collapsed:range.collapsed,
      backward:selection.anchorNode===range.endContainer&&selection.anchorOffset===range.endOffset&&!range.collapsed
    };
  }
  function caretAt(index,offset){
    const area=editor(),block=area.children[index],content=block?.querySelector('.block-input');
    if(!content)return;
    let text=content.firstChild;
    if(!text||text.nodeType!==Node.TEXT_NODE){
      content.textContent=content.textContent||'';
      text=content.firstChild||content.appendChild(document.createTextNode(''));
    }
    const range=document.createRange(),selection=window.getSelection();
    range.setStart(text,Math.max(0,Math.min(offset,text.length)));
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    active=pageOf(w).blocks[index].id;
    area.focus({
      preventScroll:true
    });
    showMenu();
  }
  function draw(index=null,offset=null){
    root.innerHTML=renderNotebook(w);
    bind();
    if(index!==null&&editor())caretAt(Math.min(index,pageOf(w).blocks.length-1),offset??pageOf(w).blocks[Math.min(index,pageOf(w).blocks.length-1)].text.length);
  }
  function replaceRange(range,inserted,rich=null){
    const page=pageOf(w),start=range.start,end=range.end,before=page.blocks[start.index].text.slice(0,start.offset),after=page.blocks[end.index].text.slice(end.offset),pieces=rich?rich.map(block=>block.text):inserted.replace(/\r\n?/g,'\n').split('\n');
    record(true);
    const first=page.blocks[start.index],replacement=[first];
    if(rich&&start.offset===0)Object.assign(first,{
      type:rich[0].type,indent:rich[0].indent,done:rich[0].done
    });
    first.text=before+pieces[0]+(pieces.length===1?after:'');
    for(let i=1;
    i<pieces.length;
    i++){
      const next=makeBlock('text',pieces[i]+(i===pieces.length-1?after:''));
      if(rich)Object.assign(next,{
        type:rich[i].type,indent:rich[i].indent,done:rich[i].done
      });
      replacement.push(next);
    }
    page.blocks.splice(start.index,end.index-start.index+1,...replacement);
    sync();
    draw(start.index+replacement.length-1,pieces.length===1?before.length+pieces[0].length:pieces.at(-1).length);
  }
  function commandAtCaret(){
    const range=selectedRange();
    if(!range||!range.collapsed)return null;
    const block=pageOf(w).blocks[range.start.index];
    return {
      ...range.start,block,found:slashAt(block.text,range.start.offset)
    };
  }
  function showMenu(){
    const current=commandAtCaret();
    if(!current?.found){
      hideMenu();
      return;
    }
    const commandKey=current.block.id+':'+current.offset+':'+current.found.query;
    if(commandKey===dismissedCommand){hideMenu();return;}
    menuItems=Object.entries(commands).filter(([name])=>name.startsWith(current.found.query));
    if(!menuItems.length){
      hideMenu();
      return;
    }
    menuIndex=Math.min(menuIndex,menuItems.length-1);
    const bounds=editor().getBoundingClientRect();
    menu.style.left=Math.max(10,Math.min(bounds.left,innerWidth-245))+'px';
    menu.style.top=Math.max(10,Math.min(bounds.bottom+5,innerHeight-300))+'px';
    menu.innerHTML=menuItems.map(([name,type],i)=>`<button type="button" id="slash-option-${i}" data-suggestion="${name}" class="${i===menuIndex?'active':''}" role="option" aria-selected="${i===menuIndex}"><code>/${name}</code><span>${names[type]}</span></button>`).join('');
    menu.hidden=false;
    editor().setAttribute('aria-controls','slash-menu');
    editor().setAttribute('aria-activedescendant','slash-option-'+menuIndex);
    menu.querySelectorAll('button').forEach((button,i)=>{
      button.onpointerdown=e=>e.preventDefault();
      button.onclick=()=>applyCommand(menuItems[i][1]);
    });
  }
  function applyCommand(type){
    const current=commandAtCaret();
    if(!current)return;
    const page=pageOf(w),block=page.blocks[current.index],found=current.found||slashAt(block.text,current.offset,true);
    if(!found)return;
    const before=block.text.slice(0,found.start),after=block.text.slice(found.end);
    record();
    let index=current.index;
    if(before.trim()){
      block.text=before.trimEnd();
      page.blocks.splice(index+1,0,makeBlock(type,after));
      index++;
    }
    else{
      block.type=type;
      block.text=after;
      block.done=false;
    }
    hideMenu();
    sync();
    draw(index,0);
  }
  function enter(shift){
    let range=selectedRange();
    if(!range)return;
    if(shift){
      if(!range.collapsed){
        replaceRange(range,'');
        range=selectedRange();
      }
      const block=pageOf(w).blocks[range.start.index],offset=range.start.offset;
      record();
      block.text=block.text.slice(0,offset)+'\n'+block.text.slice(offset);
      sync();
      draw(range.start.index,offset+1);
      return;
    }
    const page=pageOf(w),block=page.blocks[range.start.index];
    if(!range.collapsed){
      replaceRange(range,'');
      return enter(false);
    }
    const command=block.text.match(/^\/(\w+)$/);
    if(command&&commands[command[1]]){
      record();
      block.type=commands[command[1]];
      block.text='';
      sync();
      draw(range.start.index,0);
      return;
    }
    if(!block.text.trim()&&block.type!=='text'){
      record();
      block.type='text';
      block.indent=0;
      sync();
      draw(range.start.index,0);
      return;
    }
    record();
    const next=makeBlock(['bullet','number','check'].includes(block.type)?block.type:'text',block.text.slice(range.start.offset));
    next.indent=next.type==='text'?0:block.indent;
    block.text=block.text.slice(0,range.start.offset);
    page.blocks.splice(range.start.index+1,0,next);
    sync();
    draw(range.start.index+1,0);
  }
  function deleteCollapsed(range,forward,word=false){
    const page=pageOf(w),{
      index,offset
    }
    =range.start,block=page.blocks[index];
    if(!forward&&offset===0){
      if(block.type!=='text'&&!block.text){
        record();
        block.type='text';
        block.indent=0;
        sync();
        draw(index,0);
        return;
      }
      if(index>0){
        record();
        const previous=page.blocks[index-1],caret=previous.text.length;
        previous.text+=block.text;
        page.blocks.splice(index,1);
        sync();
        draw(index-1,caret);
      }
      return;
    }
    if(forward&&offset===block.text.length){
      if(index<page.blocks.length-1){
        record();
        block.text+=page.blocks[index+1].text;
        page.blocks.splice(index+1,1);
        sync();
        draw(index,offset);
      }
      return;
    }
    const boundary=deletionBoundary(block.text,offset,forward,word);
    replaceRange({
      start:{
        index,offset:forward?offset:boundary
      },end:{
        index,offset:forward?boundary:offset
      }
    },'');
  }
  function restoreSelection(saved) {
    if(!saved)return;
    const point=p=>{
      const index=Math.min(p.index,pageOf(w).blocks.length-1);
      const content=editor().children[index].querySelector('.block-input');
      const node=content.firstChild||content.appendChild(document.createTextNode(''));
      return {
        node,offset:Math.min(p.offset,node.textContent.length)
      };
    };
    const start=point(saved.start),end=point(saved.end),selection=getSelection(),range=document.createRange();
    range.setStart(start.node,start.offset);
    range.setEnd(end.node,end.offset);
    selection.removeAllRanges();
    selection.addRange(range);
    if(saved.backward)selection.setBaseAndExtent(end.node,end.offset,start.node,start.offset);
    editor().focus({
      preventScroll:true
    });
  }
  function restoreHistory(redo=false) {
    const stack=history(),page=pageOf(w),from=redo?stack.redo:stack.undo,to=redo?stack.undo:stack.redo;
    if(!from.length)return;
    to.push({
      blocks:structuredClone(page.blocks),selection:selectedRange()
    });
    const saved=from.pop();
    page.blocks=saved.blocks;
    lastEdit=0;
    sync();
    draw();
    restoreSelection(saved.selection);
  }
  function copySelection(event,cut=false) {
    const range=selectedRange();
    if(!range||range.collapsed)return;
    const blocks=pageOf(w).blocks.slice(range.start.index,range.end.index+1).map((block,index,all)=>({
      ...block,text:block.text.slice(index===0?range.start.offset:0,index===all.length-1?range.end.offset:undefined)
    }));
    event.preventDefault();
    event.clipboardData.setData('text/plain',blocks.map(block=>block.text).join('\n'));
    event.clipboardData.setData(clipboardType,JSON.stringify(blocks));
    if(cut){lastEdit=0;replaceRange(range,'');}
  }
  function bind(){
    const area=editor();
    const picker=root.querySelector('[data-page]');picker.setAttribute('aria-haspopup','dialog');picker.onpointerdown=e=>{if(e.button===0){e.preventDefault();root.querySelector('[data-page-list]').click();}};
    root.querySelector('[data-page]').onchange=e=>{
      hideMenu();
      w.pageId=e.target.value;
      sync();
      draw();
    };
    root.querySelector('[data-page-list]').onclick=()=>{
      const dialog=document.createElement('dialog');dialog.className='manage-dialog';dialog.setAttribute('aria-label','Not sayfaları');
      dialog.innerHTML='<header><h2>Not sayfaları</h2><button data-close aria-label="Kapat">×</button></header><div class="manage-list"></div>';document.body.append(dialog);
      const list=dialog.querySelector('.manage-list');
      const paint=()=>{list.replaceChildren();for(const item of w.pages){const row=document.createElement('div'),select=document.createElement('button'),remove=document.createElement('button');select.textContent=item.name;select.onclick=()=>{w.pageId=item.id;dialog.close();sync();draw();};remove.textContent='×';remove.setAttribute('aria-label',item.name+' sayfasını sil');remove.onclick=async()=>{
        const nonempty=item.encrypted||item.blocks.some(block=>block.text.trim());if(nonempty&&!await confirmAction('Sayfayı sil',item.name+' Son silinenler alanına taşınacak.'))return;
        try{await deleted(w,item);forgetNotebook(w.id,item.id);await lockPage(item);w.pages=w.pages.filter(page=>page.id!==item.id);if(!w.pages.length)w.text='';pageOf(w);sync();draw();paint();}catch(error){notify(error.message);}
      };row.append(select,remove);list.append(row);}};paint();dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.onclose=()=>{dialog.remove();root.querySelector('[data-page-list]')?.focus();};dialog.showModal();
    };
    root.querySelector('[data-page-add]').onclick=()=>{
      const page={
        id:crypto.randomUUID(),name:`Sayfa ${w.pages.length+1}`,blocks:[makeBlock()]
      };
      w.pages.push(page);
      w.pageId=page.id;
      sync();
      draw(0,0);
    };
    root.querySelector('[data-page-rename]').onclick=async()=>{
      const page=pageOf(w),name=await askName({
        title:'Sayfa adını değiştir',value:page.name,maxLength:80
      });
      if(name){
        page.name=name;
        w.pages.find(item=>item.id===w.pageId).name=name;
        sync();
        draw();
      }
    };
    root.querySelector('[data-expand]').onclick=()=>{
      if(root.closest('dialog'))return;
      const dialog=document.createElement('dialog');
      dialog.className='notebook-modal';
      dialog.setAttribute('aria-label','Not defteri');
      dialog.innerHTML=`<header><div><span class="eyebrow">NOT DEFTERİ</span><h2>${esc(w.title)}</h2></div><button class="icon" aria-label="Not defterini kapat">×</button></header><div class="expanded-notebook">${renderNotebook(w)}</div>`;
      document.body.append(dialog);
      dialog.querySelector('header button').onclick=()=>dialog.close();
      dialog.onclose=()=>{
        dialog.remove();
        draw();
      };
      dialog.showModal();
      bindNotebook(w,dialog.querySelector('.expanded-notebook'),{
        changed,askName,notify,deleted
      });
      dialog.querySelector('.note-document')?.focus();
    };
    const raw=()=>w.pages.find(page=>page.id===w.pageId);
    const securityAction=async action=>{try{root.inert=true;if(await action()===false)return;histories.delete(w.id+':'+w.pageId);w.text=w.pages.some(page=>page.encrypted)?'':w.text;changed();hideMenu();draw();for(const sibling of document.querySelectorAll('[data-notebook-widget="'+w.id+'"]')){const owner=sibling.parentElement;if(owner===root)continue;owner.innerHTML=renderNotebook(w);bindNotebook(w,owner,{changed,askName,notify,deleted});}}catch(error){notify(error.message);}finally{root.inert=false;}};
    root.querySelector('[data-page-protect]')?.addEventListener('click',()=>securityAction(async()=>{const password=await askPassword({title:'Sayfaya PIN koy',confirm:true});if(password===null)return false;await protectPage(raw(),w.id,password);w.text='';}));
    root.querySelector('[data-page-unlock]')?.addEventListener('click',()=>securityAction(async()=>{const password=await askPassword({title:'Sayfanın kilidini aç',pin:raw().encrypted?.credential==='pin'});if(password===null)return false;await unlockPage(raw(),w.id,password);}));
    root.querySelector('[data-page-repin]')?.addEventListener('click',()=>securityAction(async()=>{const pin=await askPassword({title:raw().encrypted?.credential==='pin'?'PIN değiştir':'4 haneli PIN’e geç',confirm:true});if(pin===null)return false;await protectPage(raw(),w.id,pin);}));
    root.querySelector('[data-page-lock]')?.addEventListener('click',()=>securityAction(()=>lockPage(raw())));
    root.querySelector('[data-page-unprotect]')?.addEventListener('click',()=>securityAction(()=>removePassword(raw())));
    if(!area){root.onclick=null;return;}
    root.querySelectorAll('[data-command]').forEach(button=>button.onclick=()=>{
      const page=pageOf(w),index=Math.max(0,page.blocks.findIndex(block=>block.id===active));
      record();
      page.blocks[index].type=commands[button.dataset.command];
      sync();
      draw(index);
    });
    root.querySelectorAll('[data-block-check]').forEach(input=>input.onchange=()=>{
      record();
      const block=pageOf(w).blocks.find(item=>item.id===input.dataset.blockCheck);
      block.done=input.checked;
      sync();
      draw();
    });
    root.onclick=e=>{
      if(e.target.closest('button,select,input,summary,.command-guide,.notebook-pages'))return;
      if(e.target===area||e.target.closest('.note-document')&&!e.target.closest('.block-input')){
        const last=pageOf(w).blocks.length-1;
        caretAt(last,pageOf(w).blocks[last].text.length);
      }
    };
    area.onkeyup=e=>{
      if(!e.isComposing)showMenu();
    };
    area.onmouseup=showMenu;
    area.onblur=()=>setTimeout(()=>{
      if(!root.contains(document.activeElement))hideMenu();
    },0);
    area.oncopy=e=>copySelection(e);
    area.oncut=e=>copySelection(e,true);
    area.onpaste=e=>{
      e.preventDefault();
      lastEdit=0;
      const range=selectedRange();
      if(range)replaceRange(range,e.clipboardData.getData('text/plain'),readClipboardBlocks(e.clipboardData.getData(clipboardType)));
    };
    area.onbeforeinput=e=>{
      if(e.isComposing||composing)return;
      const range=selectedRange();
      if(!range)return;
      if(e.inputType==='insertText'||e.inputType==='insertReplacementText'){
        e.preventDefault();
        const before=pageOf(w).blocks[range.start.index],command=e.data===' '?slashAt(before.text,range.start.offset):null;
        replaceRange(range,e.data||'');
        if(command&&commands[command.query])applyCommand(commands[command.query]);
        return;
      }
      if(['deleteContentBackward','deleteContentForward','deleteByCut','deleteWordBackward','deleteWordForward'].includes(e.inputType)){
        e.preventDefault();
        if(!range.collapsed)replaceRange(range,'');
        else deleteCollapsed(range,e.inputType.endsWith('Forward'),e.inputType.startsWith('deleteWord'));
        return;
      }
      if(e.inputType==='insertParagraph'||e.inputType==='insertLineBreak'){
        e.preventDefault();
        enter(e.inputType==='insertLineBreak');
        return;
      }
      if(e.inputType==='historyUndo'||e.inputType==='historyRedo'){
        e.preventDefault();
        restoreHistory(e.inputType==='historyRedo');
        return;
      }
      // Unsupported native mutations must not desynchronize the structured model.
      e.preventDefault();
    };
    area.oncompositionstart=()=>{
      const range=selectedRange();
      if(range&&!range.collapsed)replaceRange(range,'');
      composing=true;
    };
    area.oncompositionend=()=>{
      composing=false;
      const range=selectedRange(),index=range?.start.index??0,offset=range?.start.offset??0;
      record(true);
      pageOf(w).blocks.forEach((block,i)=>{
        const node=area.children[i]?.querySelector('.block-input');
        if(node)block.text=node.textContent;
      });
      sync();
      draw(index,offset);
    };
    area.onkeydown=e=>{
      if(e.isComposing||composing)return;
      const range=selectedRange();
      if(!range)return;
      const page=pageOf(w),block=page.blocks[range.start.index];
      active=block.id;
      if(menu.hidden===false){
        if(['ArrowDown','ArrowUp'].includes(e.key)){
          e.preventDefault();
          menuIndex=(menuIndex+(e.key==='ArrowDown'?1:-1)+menuItems.length)%menuItems.length;
          showMenu();
          return;
        }
        if(e.key==='Tab'||e.key==='Enter'&&!e.shiftKey){
          e.preventDefault();
          applyCommand(menuItems[menuIndex][1]);
          return;
        }
        if(e.key==='Escape'){
          e.preventDefault();
          const command=commandAtCaret();
          if(command?.found)dismissedCommand=command.block.id+':'+command.offset+':'+command.found.query;
          hideMenu();
          return;
        }
      }
      if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='n'){
        e.preventDefault();
        root.querySelector('[data-page-add]').click();
        return;
      }
      if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){
        e.preventDefault();
        restoreHistory(e.shiftKey||e.key.toLowerCase()==='y');
        return;
      }
      if(e.key==='Escape'){
        e.preventDefault();
        if(block.type==='text')return;
        record();
        if(!block.text){
          block.type='text';
          block.indent=0;
          sync();
          draw(range.start.index,0);
        }
        else{
          page.blocks.splice(range.start.index+1,0,makeBlock());
          sync();
          draw(range.start.index+1,0);
        }
        return;
      }
      if(e.key==='Tab'&&['bullet','number','check'].includes(block.type)){
        e.preventDefault();
        record();
        block.indent=Math.max(0,Math.min(3,(block.indent||0)+(e.shiftKey?-1:1)));
        sync();
        draw(range.start.index,range.start.offset);
        return;
      }
      if(e.key==='Enter'){
        e.preventDefault();
        enter(e.shiftKey);
        return;
      }
      if(e.key==='Backspace'||e.key==='Delete'){
        e.preventDefault();
        if(!range.collapsed)replaceRange(range,'');
        else deleteCollapsed(range,e.key==='Delete',e.ctrlKey||e.altKey);
      }
    };
  }
  bind();
}
