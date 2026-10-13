import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {_electron} from 'playwright';

test('native Island is framed transparently, topmost, sandboxed and restricts IPC',{skip:process.platform!=='win32',timeout:30000},async()=>{
  const data=resolve('.test-temp','island-'+Date.now());await mkdir(data,{recursive:true});let desktop;
  try{
    desktop=await _electron.launch({args:['tests/fixtures/island-electron.mjs',data],timeout:20000});
    let island;for(let i=0;i<100&&!island;i++){island=desktop.windows().find(page=>page.url().endsWith('/island/index.html'));if(!island)await new Promise(r=>setTimeout(r,50));}assert.ok(island,'Island window loaded');
    await desktop.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.getTitle()==='MONO Island');w.show();w.setIgnoreMouseEvents(false);});
    await island.waitForFunction(()=>!!window.monoIsland&&document.querySelector('#compact-clock').textContent.length>0);
    const shape=await desktop.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows().find(w=>w.getTitle()==='MONO Island'),p=w.webContents.getLastWebPreferences();return {top:w.isAlwaysOnTop(),resizable:w.isResizable(),background:w.getBackgroundColor(),bounds:w.getBounds(),workArea:screen.getPrimaryDisplay().workArea,sandbox:p.sandbox,context:p.contextIsolation,node:p.nodeIntegration};});
    assert.equal(shape.top,true);assert.equal(shape.resizable,false);assert.equal(shape.sandbox,true);assert.equal(shape.context,true);assert.equal(shape.node,false);
    // getBackgroundColor returns RGB only, without the alpha channel.
    assert.equal(shape.background,'#000000');
    const backgrounds=await island.evaluate(()=>[document.documentElement,document.body].map(element=>getComputedStyle(element).backgroundColor));
    assert.deepEqual(backgrounds,['rgba(0, 0, 0, 0)','rgba(0, 0, 0, 0)'],'Island document preserves the transparent window background');
    assert.equal(shape.bounds.x,shape.workArea.x+Math.round((shape.workArea.width-shape.bounds.width)/2));assert.equal(shape.bounds.y,shape.workArea.y+8);
    await island.locator('#summary').hover();await island.waitForFunction(()=>document.querySelector('#island').dataset.open==='true');await island.keyboard.press('Escape');await island.waitForFunction(()=>document.querySelector('#details').inert);
    await assert.rejects(island.evaluate(()=>monoIsland.command({action:'exec',value:'cmd'})));
    const display=await island.evaluate(async()=> (await monoIsland.read()).displayId);
    await island.evaluate(id=>monoIsland.display(id),display);
    assert.equal(await desktop.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.getTitle()==='MONO Island');w.hide();w.showInactive();return w.isAlwaysOnTop();}),true,'Topmost survives repositioning and hide/show');
  }finally{await desktop?.close();}
});
