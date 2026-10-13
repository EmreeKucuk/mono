// Runs in the actual Island document with the deterministic bridge fixture.
const results=[];const wait=ms=>new Promise(r=>setTimeout(r,ms));const check=(name,pass)=>{results.push({name,pass:!!pass});if(!pass)throw Error(name);};const $=s=>document.querySelector(s);
window.islandChecks=(async()=>{
  try{
    await wait(100);
    check('collapsed shows clock and weather; details are inert',$('#island').dataset.open==='false'&&$('#details').inert&&$('#compact-clock').textContent.length>0&&$('#compact-temperature').textContent==='21°');
    const active=document.activeElement;$('#island').dispatchEvent(new MouseEvent('mouseenter'));await wait(470);
    check('hover expands without stealing keyboard focus',$('#island').dataset.open==='true'&&document.activeElement===active&&!$('#details').inert);
    check('transparent hit region follows expanded shape',lastIslandHit.width>260&&lastIslandHit.height>54);
    $('#island').dispatchEvent(new MouseEvent('mouseleave'));await wait(580);check('mouse departure collapses',$('#island').dataset.open==='false');
    $('#summary').click();await wait(320);check('explicit open focuses a control',document.activeElement===$('#preferences')&&$('#island').dataset.open==='true');
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await wait(320);check('Escape collapses and returns focus',$('#details').inert&&document.activeElement===$('#summary'));
    $('#summary').click();await wait(320);$('#city-open').click();check('city configuration opens',$('#settings-panel').hidden===false);$('#city').value='Ankara';$('#city-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await wait(50);check('city is saved through bridge',$('#city-open').textContent==='Ankara');
    $('#mute').click();await wait(20);check('mute uses typed bridge command',islandCalls.some(c=>c.action==='audio.mute'&&c.value===true));
    $('#volume').value='63';$('#volume').dispatchEvent(new Event('input',{bubbles:true}));await wait(170);check('volume command is normalized',islandCalls.some(c=>c.action==='audio.volume'&&c.value===.63));
    $('#next').click();await wait(20);check('next uses native media command',islandCalls.some(c=>c.action==='media.next'));
    const date=$('.day.selected').dataset.date;emitIsland({summary:{desk:'<img src=x onerror=alert(1)>',events:[{id:'unsafe',date,time:'10:00',text:'<img src=x onerror=alert(1)>'}]}});check('saved text remains text, not markup',$('#desk-name img')===null&&$('#events img')===null&&$('#events').textContent.includes('<img'));
    const day=$('.day');day.click();const selected=day.dataset.date;emitIsland({system:{...islandFixture.system,audio:{available:false},media:{available:false}}});check('unavailable controls disable and calendar selection remains',$('#volume').disabled&&$('#play').disabled&&$('.day.selected').dataset.date===selected);
    check('no horizontal overflow',document.documentElement.scrollWidth<=innerWidth&&$('#details').scrollWidth<=$('#details').clientWidth);
  }catch(error){results.push({name:error.message,pass:false});}
  window.islandTestResults=results;const output=document.createElement('pre');output.id='test-results';output.textContent=JSON.stringify(results,null,2);output.style.cssText='position:fixed;inset:auto 10px 0;max-height:120px;overflow:auto;background:#111;color:white;pointer-events:auto';document.body.append(output);return results;
})();
