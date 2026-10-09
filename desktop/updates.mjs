// Never expose raw upstream URLs, response bodies or credentials to the renderer.
export function updateFailure(error) {
  const code=String(error?.code||'');
  const detail=String(error?.message||'');
  if(code==='ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'||/latest\.yml.*(?:404|not found)|(?:404|not found).*latest\.yml/i.test(detail))
    return {errorCode:'missing-metadata',message:'Yeni GitHub release eksik: latest.yml bulunamadı. Yayına kurulum dosyası, blockmap ve latest.yml eklenmeli.'};
  if(/SHA512|CHECKSUM/.test(code))
    return {errorCode:'checksum',message:'Kurulum dosyasının bütünlüğü doğrulanamadı. Kurulum durduruldu; release dosyaları kontrol edilmeli.'};
  if(/ENOENT|NO_PUBLISHED|INVALID_RELEASE|INVALID_UPDATE/.test(code))
    return {errorCode:'invalid-release',message:'Güncelleme bilgileri eksik veya geçersiz. GitHub release dosyalarını kontrol et.'};
  if(/ENOTFOUND|ECONN|ETIMEDOUT|ERR_INTERNET|ERR_NETWORK/.test(code))
    return {errorCode:'network',message:'Güncelleme sunucusuna ulaşılamadı. İnternet bağlantısını kontrol edip yeniden dene.'};
  return {errorCode:'download',message:'Güncelleme alınamadı. Bağlantıyı ve GitHub release dosyalarını kontrol edip yeniden dene.'};
}

export function createUpdateController({updater,enabled,version,publish,prepareQuit,install}) {
  let state={phase:enabled?'idle':'disabled',currentVersion:version,version:null,percent:0,message:'',errorCode:null};
  let checking=null,installing=false;
  const emit=patch=>{state={...state,...patch};publish({...state});};
  const fail=error=>{installing=false;emit({phase:'error',...updateFailure(error)});};
  updater.autoDownload=true;
  updater.autoInstallOnAppQuit=false;
  updater.allowPrerelease=false;
  updater.allowDowngrade=false;
  updater.disableWebInstaller=true;
  updater.on('checking-for-update',()=>emit({phase:'checking',message:'',errorCode:null,percent:0,version:null}));
  updater.on('update-available',info=>emit({phase:'downloading',version:info.version,percent:0,message:'',errorCode:null}));
  updater.on('download-progress',progress=>emit({phase:'downloading',percent:Math.max(0,Math.min(100,Number(progress.percent)||0))}));
  updater.on('update-not-available',()=>emit({phase:'current',message:'',errorCode:null,version:null}));
  updater.on('update-downloaded',info=>emit({phase:'ready',version:info.version,percent:100,message:'',errorCode:null}));
  updater.on('error',fail);
  return {
    status:()=>({...state}),
    check(){
      if(!enabled||installing||['downloading','ready'].includes(state.phase))return Promise.resolve({...state});
      if(checking)return checking;
      checking=Promise.resolve().then(()=>updater.checkForUpdates()).catch(fail).finally(()=>{checking=null;});
      return checking.then(()=>({...state}));
    },
    async restart(){
      if(!enabled||state.phase!=='ready'||installing)throw Error('Önce güncellemenin indirilmesini bekle.');
      installing=true;
      try{await prepareQuit();emit({phase:'installing',message:'MONO kapanacak, güncelleme kurulacak ve tekrar açılacak.'});install();}
      catch(error){installing=false;emit({phase:'ready',message:'Yeniden başlatılamadı. Kaydı kontrol edip tekrar dene.'});throw error;}
    }
  };
}
