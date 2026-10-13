// Serialize explicit settings and tray toggles so a slow disk cannot reorder them.
export function createVisibilityPreference({prefs,persist,apply,status}) {
  let queue=Promise.resolve();
  const change=resolveValue=>{
    const result=queue.then(async()=>{
      const previous=prefs.enabled,next=resolveValue(previous);
      if(next===previous)return status();
      prefs.enabled=next;
      try { await persist(); }
      catch(error) { prefs.enabled=previous;throw error; }
      apply();
      return status();
    });
    queue=result.catch(()=>{});
    return result;
  };
  return {
    setEnabled(value) {
      if(typeof value!=='boolean')return Promise.reject(Error('Geçersiz Island tercihi.'));
      return change(()=>value);
    },
    toggle:()=>change(enabled=>!enabled)
  };
}
