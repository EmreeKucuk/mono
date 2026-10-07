export function confirmAction(title,message){
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='name-dialog';dialog.setAttribute('aria-label',title);
    dialog.innerHTML='<form><h2></h2><p></p><div class="actions"><button type="button" data-cancel>Vazgeç</button><button type="submit" class="primary">Sil</button></div></form>';
    dialog.querySelector('h2').textContent=title;dialog.querySelector('p').textContent=message;
    document.body.append(dialog);dialog.querySelector('form').onsubmit=e=>{e.preventDefault();dialog.close('yes');};dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>{const result=dialog.returnValue==='yes';dialog.remove();resolve(result);},{once:true});dialog.showModal();dialog.querySelector('[data-cancel]').focus();
  });
}
