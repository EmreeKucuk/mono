import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require=createRequire(import.meta.url);
let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=require(process.env.CODEX_PLAYWRIGHT_PATH||'C:/Users/emre.kucuk/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let processHandle,base,browser;
const freePort=()=>new Promise(resolve=>{const server=createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
before(async()=>{const port=await freePort();base=`http://127.0.0.1:${port}`;processHandle=spawn(process.execPath,['server.mjs'],{cwd:project,env:{...process.env,PORT:String(port)}});for(let attempt=0;attempt<60;attempt++){try{const response=await fetch(base);if(response.ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}browser=await chromium.launch({channel:process.env.MONO_BROWSER_CHANNEL||'msedge',headless:true});});
after(async()=>{await browser?.close();processHandle?.kill();});

test('dashboard capture, reminders, Zones, weather and clipboard reflow without runtime errors',async()=>{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/api/weather?**',route=>route.fulfill({json:{city:'Ankara',temperature:18,summary:'Açık'}}));
  await page.goto(base);await page.locator('#weather').click();await page.locator('.name-dialog input').fill('Ankara');await page.locator('.name-dialog [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#weather').textContent.includes('18°'));
  await page.keyboard.press('Control+Shift+Space');await page.locator('[name=capture]').fill('yarın 14:30 proje toplantısı');await page.locator('[data-parse]').click();assert.equal(await page.locator('[name=text]').inputValue(),'proje toplantısı');await page.locator('.capture-form [type=submit]').click();
  await page.locator('#quick-capture-open').click();await page.locator('[name=capture]').fill('20 dakika sonra su iç hatırlat');await page.locator('[data-parse]').click();assert.equal(await page.locator('[name=kind]').inputValue(),'reminder');await page.locator('.capture-form [type=submit]').click();await page.locator('#reminders-open').click();assert.match(await page.locator('.reminder-list').textContent(),/su iç/);await page.keyboard.press('Escape');
  await page.locator('#zone-open').click();await page.locator('.dashboard-dialog [name=minutes]').fill('0');await page.locator('.dashboard-dialog form .primary').click();assert.match(await page.locator('#zone-open').textContent(),/Working Zone.*Süresiz/);await page.locator('#zone-open').click();await page.locator('[data-stop]').click();assert.equal(await page.locator('#zone-open').textContent(),'Zone');
  await page.locator('#tool-toggle').click();await page.locator('[data-add=clipboard]').click();assert.equal(await page.locator('[data-clipboard-watch],[data-clipboard-read],[data-clipboard-clear],[data-clipboard-search]').count(),0);assert.match(await page.locator('.clipboard-list').textContent(),/Henüz/);
  await page.setViewportSize({width:320,height:700});if(await page.locator('#workspace-sidebar').isVisible())await page.locator('#sidebar-toggle').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await page.locator('[data-live-clock]').isVisible());await page.locator('#zone-open').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.keyboard.press('Escape');await page.locator('.dashboard-dialog').waitFor({state:'detached'});assert.equal(await page.locator('.dashboard-dialog').count(),0);assert.deepEqual(errors,[]);await context.close();
});

test('password-protected notes save no plaintext, reopen, edit and keep commands/selection after relocking',async()=>{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:900}});let remote={widgets:[{id:'note',type:'note',title:'Aklımdakiler',text:'Confidential note',grid:{slot:0,cols:1,rows:1}}],events:[],gridColumns:2},revision=1;
  await context.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;if(path==='/api/session')return route.fulfill({json:{configured:true,user:{id:'vault-user',email:'vault@example.com'}}});if(path==='/api/workspace'){if(route.request().method()==='GET')return route.fulfill({json:{state:remote,revision}});remote=route.request().postDataJSON().state;return route.fulfill({json:{revision:++revision}});}return route.fulfill({json:{}});});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.waitForFunction(()=>document.querySelector('.profile')?.textContent.includes('vault@example.com'));assert.equal(await page.locator('.widget-title').textContent(),'Notlar');
  await page.locator('[data-page-protect]').click();assert.equal(await page.locator('.name-dialog [name=password]').getAttribute('inputmode'),'numeric');assert.equal(await page.locator('.name-dialog [name=password]').getAttribute('maxlength'),'4');await page.locator('.name-dialog [name=password]').fill('12a4');await page.locator('[name=confirm]').fill('12a4');await page.locator('.name-dialog [type=submit]').click();assert.equal(await page.locator('dialog.name-dialog[open]').count(),1);await page.locator('.name-dialog [name=password]').fill('0427');await page.locator('[name=confirm]').fill('0427');await page.locator('.name-dialog [type=submit]').click();await page.locator('.note-locked').waitFor();await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('Kaydedildi'));assert.ok(!JSON.stringify(remote).includes('Confidential note'));assert.deepEqual(remote.widgets[0].pages[0].blocks,[]);
  await page.reload();await page.waitForFunction(()=>document.querySelector('.profile')?.textContent.includes('vault@example.com'));assert.equal(await page.locator('.note-document').count(),0);await page.keyboard.press('Alt+1');assert.ok(await page.locator('[data-page-unlock]').evaluate(e=>e===document.activeElement));await page.locator('[data-page-unlock]').click();await page.locator('.name-dialog [name=password]').fill('9999');await page.locator('.name-dialog [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('PIN yanlış'));assert.equal(await page.locator('.note-document').count(),0);
  await page.locator('[data-page-unlock]').click();await page.locator('.name-dialog [name=password]').fill('0427');await page.locator('.name-dialog [type=submit]').click();await page.locator('.note-document').waitFor();assert.match(await page.locator('.note-document').textContent(),/Confidential note/);await page.locator('.note-document').click();await page.keyboard.press('Control+a');await page.keyboard.type('/title ');await page.keyboard.type('Changed secret');await page.keyboard.press('Enter');await page.keyboard.type('Second block');await page.keyboard.press('Control+a');assert.match(await page.evaluate(()=>getSelection().toString()),/Changed secret.*Second block/s);await page.locator('[data-page-lock]').click();await page.locator('.note-locked').waitFor();await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('Kaydedildi'));assert.ok(!JSON.stringify(remote).includes('Changed secret'));
  await page.reload();await page.waitForFunction(()=>document.querySelector('.profile')?.textContent.includes('vault@example.com'));await page.locator('[data-page-unlock]').click();await page.locator('.name-dialog [name=password]').fill('0427');await page.locator('.name-dialog [type=submit]').click();await page.locator('.note-document').waitFor();assert.equal(await page.locator('.block-title .block-input').textContent(),'Changed secret');assert.match(await page.locator('.note-document').textContent(),/Second block/);await page.locator('[data-page-repin]').click();await page.locator('.name-dialog [name=password]').fill('0056');await page.locator('.name-dialog [name=confirm]').fill('0056');await page.locator('.name-dialog [type=submit]').click();await page.locator('.note-locked').waitFor();await page.locator('[data-page-unlock]').click();await page.locator('.name-dialog [name=password]').fill('0056');await page.locator('.name-dialog [type=submit]').click();await page.locator('.note-document').waitFor();assert.match(await page.locator('.note-document').textContent(),/Second block/);assert.deepEqual(errors,[]);await context.close();
});

test('desk picker isolates layouts, renames safely and keeps every desk through offline reload',async()=>{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:900}});
  let remote={schemaVersion:1,gridColumns:2,autoArrange:false,widgets:[{id:'personal-note',type:'note',title:'Personal note',text:'Personal text',grid:{slot:0,cols:1,rows:1}},{id:'personal-tasks',type:'tasks',title:'Tasks',tasks:[],grid:{slot:1,cols:1,rows:1}}],events:[]},revision=1,offline=false;
  await context.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/session')return route.fulfill({json:{configured:true,user:{id:'desks-user',email:'desks@example.com'}}});
    if(path==='/api/workspace'){
      if(offline)return route.abort('failed');
      if(route.request().method()==='GET')return route.fulfill({json:{state:remote,revision}});
      const input=route.request().postDataJSON();if(input.revision!==revision)return route.fulfill({status:409,json:{error:'Conflict'}});
      remote=input.state;revision++;return route.fulfill({json:{revision}});
    }
    return route.fulfill({json:{}});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.waitForFunction(()=>document.querySelector('.profile')?.textContent.includes('desks@example.com'));
  assert.equal(await page.locator('#desk-select option:checked').textContent(),'Kişisel alan');
  const personal=await page.locator('#desk-select').inputValue();
  await page.locator('#desk-add').click();await page.locator('.name-dialog input').fill('İş');await page.locator('.name-dialog [type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#desk-select option:checked').textContent==='İş');
  const work=await page.locator('#desk-select').inputValue();assert.notEqual(work,personal);assert.equal(await page.locator('.widget').count(),0);
  await page.locator('#tool-toggle').click();await page.locator('[data-add=note]').click();
  await page.locator('.note-document').click();await page.keyboard.type('Work text');await page.locator('#grid-select').selectOption('3');
  await page.locator('#desk-rename').click();await page.locator('.name-dialog input').fill('İş <img onerror=evil>');await page.locator('.name-dialog [type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#desk-select option:checked').textContent==='İş <img onerror=evil>');
  assert.equal(await page.locator('#desk-select option:checked').textContent(),'İş <img onerror=evil>');assert.equal(await page.locator('[onerror]').count(),0);
  await page.locator('#desk-select').selectOption(personal);assert.match(await page.locator('.note-document').textContent(),/Personal text/);assert.equal(await page.locator('#grid-select').inputValue(),'2');
  await page.locator('[data-view=tasks]').click();await page.locator('[name=task]').fill('Personal task');await page.locator('.add-task button').click();
  await page.locator('[data-view=board]').click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('Kaydedildi'));
  assert.equal(remote.desks.length,2);assert.equal(remote.desks.find(desk=>desk.id===work).workspace.widgets[0].pages[0].blocks[0].text,'Work text');
  offline=true;await page.locator('.note-document').click();await page.keyboard.press('Control+a');await page.keyboard.type('Offline personal');await page.waitForTimeout(800);
  await page.reload();await page.waitForFunction(()=>document.querySelector('.profile')?.textContent.includes('desks@example.com'));assert.equal(await page.locator('#desk-select').inputValue(),personal);assert.match(await page.locator('.note-document').textContent(),/Offline personal/);
  await page.locator('#desk-select').selectOption(work);assert.match(await page.locator('.note-document').textContent(),/Work text/);assert.equal(await page.locator('#grid-select').inputValue(),'3');
  offline=false;await page.locator('#save-status').click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('Kaydedildi'));
  await page.reload();await page.waitForFunction(()=>document.querySelector('.profile')?.textContent.includes('desks@example.com'));assert.equal(await page.locator('#desk-select').inputValue(),work);assert.match(await page.locator('.note-document').textContent(),/Work text/);
  await page.locator('#desk-select').selectOption(personal);assert.match(await page.locator('.note-document').textContent(),/Offline personal/);assert.match(await page.locator('.task-text').textContent(),/Personal task/);
  await page.setViewportSize({width:320,height:700});if(!await page.locator('#workspace-sidebar').isVisible())await page.locator('#sidebar-toggle').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);await context.close();
});

test('one-cell Spotify advances one full stage per wheel gesture and exits paging on resize',async()=>{
  const page=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'block',reducedMotion:'reduce'});
  const id='37i9dQZF1DXcBWIGoYBM5M';
  await page.route('https://open.spotify.com/embed/**',route=>route.fulfill({body:'Playlist'}));
  await page.route('**/api/spotify/**',route=>{
    const path=new URL(route.request().url()).pathname;
    const data=path.endsWith('/status')?{configured:true,connected:true}:path.endsWith('/playlists')?{items:[{id,name:'Focus',owner:'Me'}],nextOffset:null}:path.endsWith('/devices')?{devices:[{id:'phone',name:'Phone',active:true}]}:path.endsWith('/playlist')?{name:'Focus',cover:null,items:Array.from({length:40},(_,position)=>({position,name:'Song '+position,artist:'Artist',duration:90000,playable:true})),nextOffset:null}:{playing:false,position:0,duration:0,track:null};
    return route.fulfill({json:data});
  });
  await page.goto(base);await page.locator('#tool-toggle').click();await page.locator('[data-add=spotify]').click();
  const card=page.locator('.widget').filter({has:page.locator('.spotify-account')}),account=card.locator('.spotify-account');
  await card.locator('[data-spotify-lists] option').nth(1).waitFor({state:'attached'});
  await card.locator('[data-spotify-lists]').selectOption(id);await card.locator('.spotify-track-row').first().waitFor({state:'attached'});
  assert.ok(await card.evaluate(node=>node.classList.contains('spotify-paged')));
  const stageIndex=()=>account.evaluate(node=>Math.round(node.scrollTop/node.clientHeight));
  const visibleStages=()=>account.evaluate(node=>{const rect=node.getBoundingClientRect();return [...node.querySelectorAll('[data-spotify-stage]')].filter(stage=>{const box=stage.getBoundingClientRect();return Math.min(box.bottom,rect.bottom)-Math.max(box.top,rect.top)>2;}).length;});
  assert.equal(await stageIndex(),0);assert.equal(await visibleStages(),1);
  const bounds=await account.boundingBox();await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
  await page.mouse.wheel(0,120);await page.mouse.wheel(0,120);await page.mouse.wheel(0,120);
  await page.waitForTimeout(270);assert.equal(await stageIndex(),1);assert.equal(await visibleStages(),1);
  await page.mouse.wheel(0,120);await page.waitForTimeout(270);assert.equal(await stageIndex(),2);assert.equal(await visibleStages(),1);
  const list=card.locator('.spotify-tracks-scroll');await list.evaluate(node=>node.scrollTop=0);
  await card.locator('.spotify-track-row').nth(1).click();assert.equal(await stageIndex(),2);
  const listBounds=await list.boundingBox();await page.mouse.move(listBounds.x+listBounds.width/2,listBounds.y+listBounds.height/2);
  await page.mouse.wheel(0,150);await page.waitForTimeout(100);assert.ok(await list.evaluate(node=>node.scrollTop>0));assert.equal(await stageIndex(),2);
  await card.locator('[data-stage-go="0"]').click();assert.equal(await stageIndex(),0);
  await page.keyboard.press(await card.getAttribute('aria-keyshortcuts'));assert.ok(await page.evaluate(()=>document.activeElement.matches('[data-spotify-toggle]')));assert.equal(await stageIndex(),1);
  await page.keyboard.press('PageDown');assert.equal(await stageIndex(),2);
  await card.locator('.resize-handle').focus();await page.keyboard.press('ArrowRight');
  await page.waitForFunction(()=>!document.querySelector('.spotify-widget').closest('.widget').classList.contains('spotify-paged'));
  assert.equal(await card.locator('.spotify-stage-nav').isVisible(),false);
  await page.keyboard.press('ArrowLeft');await page.waitForFunction(()=>document.querySelector('.spotify-widget').closest('.widget').classList.contains('spotify-paged'));
  assert.equal(await stageIndex(),0);await page.close();
});

test('document-wide selection, slash commands, partial edit and undo',async()=>{
  const page=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'block'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await page.goto(base);
  const area=page.locator('.notebook .note-document').first();
  await area.click();await page.keyboard.press('Control+a');assert.match(await page.evaluate(()=>getSelection().toString()),/Bir düşünceyi/);
  await page.keyboard.type('/title ');assert.equal(await area.locator('.block-title').count(),1);
  await page.keyboard.type('Ana başlık');await page.keyboard.press('Enter');await page.keyboard.type('Birinci satır');await page.keyboard.press('Enter');await page.keyboard.type('İkinci satır');
  await page.keyboard.press('Control+Shift+ArrowUp');await page.keyboard.press('Control+Shift+ArrowUp');
  assert.match(await page.evaluate(()=>getSelection().toString()),/Birinci satır/);
  await page.keyboard.press('Backspace');assert.equal(await area.locator('.block-title').count(),1);
  await page.keyboard.press('Control+z');assert.match(await area.innerText(),/Birinci satır/);
  assert.deepEqual(errors,[]);await page.close();
});

test('heading soft break, lists, pages and paste preserve block types',async()=>{
  const page=await browser.newPage({serviceWorkers:'block'});await page.goto(base);const note=page.locator('.notebook').first(),area=note.locator('.note-document');await area.click();await page.keyboard.press('Control+a');await page.keyboard.type('/title ');await page.keyboard.type('Başlık');await page.keyboard.press('Shift+Enter');await page.keyboard.type('Devam');
  assert.equal(await area.locator('.block-title').count(),1);assert.match(await area.locator('.block-title .block-input').textContent(),/Başlık\nDevam/);
  await page.keyboard.press('Enter');await page.keyboard.type('/bullet ');await page.keyboard.type('Birinci');await page.keyboard.press('Enter');await page.keyboard.type('İkinci');await page.keyboard.press('Tab');assert.match(await area.locator('.block-bullet').last().getAttribute('style'),/--indent:1/);
  await page.keyboard.press('Control+z');assert.match(await area.innerText(),/Birinci/);
  const firstPage=await note.locator('[data-page]').inputValue();await note.locator('[data-page-add]').click();await note.locator('.note-document').click();await page.keyboard.type('Diğer sayfa');await note.locator('[data-page]').selectOption(firstPage);assert.match(await area.innerText(),/Başlık/);
  await area.click();await area.evaluate(element=>{const data=new DataTransfer();data.setData('text/plain',' Yapıştırıldı');element.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));});assert.match(await area.innerText(),/Yapıştırıldı/);assert.equal(await area.locator('.block-title').count(),1);
  await page.close();
});

test('offline draft survives reload and mobile reflows to 320 pixels',async()=>{
  const context=await browser.newContext({viewport:{width:320,height:750}});
  await context.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;if(path==='/api/session')return route.fulfill({json:{configured:true,user:{id:'test-user',email:'test@example.com'}}});if(path==='/api/workspace'&&route.request().method()==='GET')return route.fulfill({json:{state:null,revision:0}});return route.abort('internetdisconnected');});
  const page=await context.newPage();await page.goto(base);await page.waitForFunction(()=>document.querySelector('.profile')?.textContent.includes('test@example.com'));
  await page.evaluate(()=>navigator.serviceWorker.ready);
  const area=page.locator('.notebook .note-document').first();await area.click();await page.keyboard.type('Çevrimdışı taslak');
  await page.waitForTimeout(150);
  await context.setOffline(true);await page.reload();await page.waitForFunction(()=>document.querySelector('.note-document')?.textContent.includes('Çevrimdışı taslak'));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.match(await page.locator('#save-status').innerText(),/Çevrimdışı|taslak/i);
  await context.close();
});

test('two tabs show a conflict instead of overwriting',async()=>{
  let remote=null,revision=0;
  const sharedContext=await browser.newContext({serviceWorkers:'block'});
  const contexts=[sharedContext];
  for(const context of contexts)await context.route('**/api/**',async route=>{const request=route.request(),path=new URL(request.url()).pathname;if(path==='/api/session')return route.fulfill({json:{configured:true,user:{id:'same-user',email:'same@example.com'}}});if(path==='/api/workspace'&&request.method()==='GET')return route.fulfill({json:{state:remote,revision}});if(path==='/api/workspace'&&request.method()==='PUT'){const value=request.postDataJSON();if(value.revision!==revision)return route.fulfill({status:409,json:{error:'Başka sekmede değişti.'}});remote=value.state;revision++;return route.fulfill({json:{revision}});}return route.fulfill({status:404,json:{error:'Unknown'}});});
  const pages=await Promise.all([sharedContext.newPage(),sharedContext.newPage()]);await Promise.all(pages.map(page=>page.goto(base)));await Promise.all(pages.map(page=>page.waitForFunction(()=>document.querySelector('.profile')?.textContent.includes('same@example.com'))));
  await pages[0].locator('.notebook .note-document').first().click();await pages[0].keyboard.type('İlk sekme');await pages[0].waitForFunction(()=>document.querySelector('#save-status')?.textContent.includes('Kaydedildi'));
  await pages[1].locator('.notebook .note-document').first().click();await pages[1].keyboard.type('İkinci sekme');await pages[1].locator('#conflict').waitFor({state:'visible'});
  assert.match(await pages[1].locator('#save-status').innerText(),/çakışması/i);
  assert.ok(remote.widgets.some(widget=>widget.type==='note'&&widget.text.includes('İlk sekme')));
  await pages[1].reload();await pages[1].locator('#conflict').waitFor({state:'visible'});
  assert.match(await pages[1].locator('.note-document').first().textContent(),/İkinci sekme/);
  assert.doesNotMatch(await pages[1].locator('.note-document').first().textContent(),/İlk sekme/);
  await Promise.all(contexts.map(context=>context.close()));
});

test('grid can be moved by keyboard',async()=>{const page=await browser.newPage({serviceWorkers:'block'});await page.goto(base);const widget=page.locator('.grid-surface>.widget').first(),id=await widget.getAttribute('data-id');await widget.locator('.widget-head').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator(`[data-id="${id}"]`).evaluate(element=>getComputedStyle(element).gridColumnStart),'2');await page.close();});

test('Alt digits focus widget actions, preserve note caret and respect modal boundaries and grid order',async()=>{
  const page=await browser.newPage({serviceWorkers:'block'}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(base);
  await page.keyboard.press('Alt+3');assert.ok(await page.evaluate(()=>document.activeElement.matches('.note-document')));
  await page.keyboard.press('Control+a');await page.keyboard.type('abcdef');await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Alt+1');assert.ok(await page.evaluate(()=>document.activeElement.matches('.add-task input[name="task"]')));
  await page.keyboard.press('Alt+3');await page.keyboard.type('X');assert.equal(await page.locator('.note-document .block-input').first().textContent(),'abcdXef');
  await page.keyboard.press('End');await page.keyboard.press('Enter');await page.keyboard.type('ikinci');
  await page.keyboard.press('Control+a');await page.keyboard.press('Alt+1');await page.keyboard.press('Alt+3');
  assert.match(await page.evaluate(()=>getSelection().toString()),/abcdXef[\s\S]*ikinci/);
  for(const selector of ['.event-form input','[data-start]','.habit-form input','.link-form input[name="name"]']){
    const shortcut=await page.locator(selector).evaluate(element=>element.closest('.widget').getAttribute('aria-keyshortcuts'));
    await page.keyboard.press(shortcut);assert.ok(await page.evaluate(selector=>document.activeElement.matches(selector),selector));
  }
  for(const type of ['journal','goal','dates','note']){await page.locator('#tool-toggle').click();await page.locator(`[data-add="${type}"]`).click();}
  await page.keyboard.press('Alt+7');assert.ok(await page.evaluate(()=>document.activeElement.matches('.journal-input')));
  await page.keyboard.press('Alt+8');assert.ok(await page.evaluate(()=>document.activeElement.matches('[data-goal-step="1"]')));
  await page.keyboard.press('Alt+9');assert.ok(await page.evaluate(()=>document.activeElement.matches('.dates-form input[name="name"]')));
  await page.keyboard.press('Alt+0');assert.ok(await page.evaluate(()=>document.activeElement.closest('.widget')?.getAttribute('aria-keyshortcuts')==='Alt+0'&&document.activeElement.matches('.note-document')));
  await page.locator('#widget-search-open').click();await page.locator('#widget-query').fill('not');await page.keyboard.press('Alt+1');assert.equal(await page.locator('#widget-query').inputValue(),'not');assert.ok(await page.evaluate(()=>document.activeElement.id==='widget-query'));await page.keyboard.press('Escape');
  const first=page.locator('.widget').first();await first.locator('.widget-head').focus();await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Alt+1');assert.equal(await page.evaluate(()=>document.activeElement.closest('.widget').dataset.id),await page.locator('.widget').first().getAttribute('data-id'));
  await page.keyboard.press('Control+Alt+2');assert.equal(await page.evaluate(()=>document.activeElement.closest('.widget').dataset.id),await page.locator('.widget').first().getAttribute('data-id'));
  assert.deepEqual(errors,[]);await page.close();
});

test('clipboard keeps block formatting, cut undo restores selection and word deletion uses the model',async()=>{
  const page=await browser.newPage({serviceWorkers:'block'});await page.goto(base);
  const area=page.locator('.notebook .note-document').first();
  await area.click();await page.keyboard.press('Control+a');await page.keyboard.type('/title ');await page.keyboard.type('Başlık');
  await page.keyboard.press('Enter');await page.keyboard.type('/bullet ');await page.keyboard.type('ilk ikinci');
  await page.keyboard.press('Control+Backspace');assert.equal(await area.locator('.block-bullet .block-input').textContent(),'ilk ');
  await page.keyboard.press('Control+a');
  const copied=await area.evaluate(element=>{const data=new DataTransfer();element.dispatchEvent(new ClipboardEvent('cut',{bubbles:true,cancelable:true,clipboardData:data}));return {text:data.getData('text/plain'),blocks:data.getData('application/x-mono-note-blocks')};});
  assert.equal(copied.text,'Başlık\nilk ');assert.equal(await area.locator('.block-input').textContent(),'');
  await page.keyboard.press('Control+z');assert.match(await page.evaluate(()=>getSelection().toString()),/Başlık/);
  await page.keyboard.press('Control+y');assert.equal(await area.locator('.block-input').textContent(),'');
  await page.keyboard.press('Control+z');assert.match(await page.evaluate(()=>getSelection().toString()),/Başlık/);
  await page.keyboard.press('Backspace');
  await area.evaluate((element,data)=>{const transfer=new DataTransfer();transfer.setData('text/plain',data.text);transfer.setData('application/x-mono-note-blocks',data.blocks);element.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:transfer}));},copied);
  assert.equal(await area.locator('.block-title').count(),1);assert.equal(await area.locator('.block-bullet').count(),1);
  await page.keyboard.type('😀');await page.keyboard.press('Backspace');assert.equal(await area.locator('.block-bullet .block-input').textContent(),'ilk ');
  await page.keyboard.press('Enter');await page.keyboard.type('Ön söz /');await page.locator('#slash-menu').waitFor({state:'visible'});
  await page.keyboard.press('Escape');assert.equal(await page.locator('#slash-menu').isVisible(),false);
  await page.keyboard.type('subtitle ');await page.keyboard.type('Alt başlık');assert.equal(await area.locator('.block-subtitle').count(),1);
  await page.close();
});

test('widget updates and grid moves retain unrelated editor DOM and restore control focus',async()=>{
  const page=await browser.newPage({serviceWorkers:'block'});await page.goto(base);
  await page.evaluate(()=>window.savedNote=document.querySelector('.note-document'));
  const task=page.locator('[data-task]').first();await task.focus();await page.keyboard.press('Space');
  assert.ok(await page.evaluate(()=>document.activeElement.matches('[data-task]')&&window.savedNote===document.querySelector('.note-document')));
  await page.locator('.widget-head').first().focus();await page.keyboard.press('ArrowRight');
  assert.ok(await page.evaluate(()=>window.savedNote===document.querySelector('.note-document')));
  await page.locator('.resize-handle').first().focus();await page.keyboard.press('ArrowDown');assert.ok(await page.evaluate(()=>document.activeElement.matches('.resize-handle')));
  await page.close();
});

test('edits during a save remain queued and a saved workspace opens offline',async()=>{
  const context=await browser.newContext();let remote=null,revision=0,held,hold=true;
  await context.route('**/api/**',route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    if(path==='/api/session')return route.fulfill({json:{configured:true,user:{id:'race-user',email:'race@example.com'}}});
    if(request.method()==='GET')return route.fulfill({json:{state:remote,revision}});
    const save=()=>{const input=request.postDataJSON();remote=input.state;revision++;return route.fulfill({json:{revision}});};
    if(hold){held=save;return;}return save();
  });
  const page=await context.newPage();await page.goto(base);await page.waitForFunction(()=>document.querySelector('.profile')?.textContent.includes('race@example.com'));await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.evaluate(async()=>{const cloud=await import('/cloud.js');window.cloud=cloud;window.firstState={widgets:[{id:'race-note',type:'note',title:'Taslak',text:'ilk'}],events:[]};await cloud.stageWorkspace(firstState);window.saveJob=cloud.saveWorkspace(firstState);});
  for(let n=0;!held&&n<50;n++)await new Promise(resolve=>setTimeout(resolve,20));assert.ok(held);
  await page.evaluate(async()=>{window.secondState={...firstState,widgets:[{...firstState.widgets[0],text:'ikinci'}]};await cloud.stageWorkspace(secondState);});
  await held();hold=false;await page.evaluate(()=>window.saveJob);
  assert.equal(await page.evaluate(async()=>(await cloud.localDraft()).widgets[0].text),'ikinci');
  await page.evaluate(()=>cloud.saveWorkspace(secondState));assert.equal(await page.evaluate(()=>cloud.hasPendingDraft()),false);
  await context.setOffline(true);await page.reload();await page.waitForFunction(()=>document.querySelector('.note-document')?.textContent.includes('ikinci'));
  await context.close();
});

test('malicious cloud records render as text without attributes, URLs or CSS injection',async()=>{
  const context=await browser.newContext({serviceWorkers:'block'});
  const payload={widgets:[{id:'bad" autofocus onfocus="window.pwned=1',type:'note',title:'<img src=x onerror="window.pwned=1">',pages:[{id:'page" onclick="window.pwned=1',name:'" autofocus',blocks:[{id:'block" onclick="window.pwned=1',type:'title" onmouseover="window.pwned=1',text:'<svg onload="window.pwned=1">',indent:'1);background:url(javascript:alert(1))'}]}],grid:{slot:'1;background:red',cols:1,rows:1}},{id:'links',type:'links',title:'Bağlantılar',links:[{id:'evil',name:'Kötü',url:'javascript:window.pwned=1'},{id:'safe',name:'" onclick="window.pwned=1',url:'https://example.com/" onmouseover="window.pwned=1'}]}],events:[]};
  await context.route('**/api/**',route=>route.fulfill({json:new URL(route.request().url()).pathname==='/api/session'?{configured:true,user:{id:'safe-user',email:'safe@example.com'}}:{state:payload,revision:1}}));
  const page=await context.newPage();await page.goto(base);await page.waitForFunction(()=>document.querySelector('.profile')?.textContent.includes('safe@example.com'));
  assert.equal(await page.locator('[onerror],[onload],[onfocus],[onclick],[onmouseover]').count(),0);
  assert.equal(await page.locator('a[href^="javascript:"]').count(),0);
  assert.match(await page.locator('.note-document').textContent(),/<svg onload=/);
  assert.equal(await page.evaluate(()=>window.pwned),undefined);
  await context.close();
});

test('existing task, habit, link, focus and widget search flows remain usable',async()=>{
  const page=await browser.newPage({viewport:{width:1440,height:1000},serviceWorkers:'block'}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(base);
  await page.locator('.add-task input[name="task"]').first().fill('Yeni görev');await page.locator('.add-task button').first().click();assert.match(await page.locator('.task-groups').first().innerText(),/Yeni görev/);
  await page.locator('.habit-form input').fill('Oku');await page.locator('.habit-form button').click();await page.locator('[data-habit]').last().click();assert.equal(await page.locator('[data-habit]').last().getAttribute('aria-pressed'),'true');
  await page.getByLabel('Bağlantı adı',{exact:true}).fill('Belgeler');await page.getByLabel('Bağlantı adresi',{exact:true}).fill('https://example.com/docs');await page.getByRole('button',{name:'Bağlantı ekle'}).click();assert.match(await page.locator('.quick-link a').getAttribute('href'),/^https:\/\/example.com/);
  await page.locator('.focus-duration input').fill('15');await page.locator('.focus-duration button').click();assert.equal(await page.locator('.focus-duration input').inputValue(),'15');
  await page.locator('#widget-search-open').click();await page.locator('#widget-query').fill('günlük');assert.ok(await page.locator('#widget-results [role="option"]').count()>0);await page.keyboard.press('Escape');assert.equal(await page.locator('.widget-search').isVisible(),false);
  assert.deepEqual(errors,[]);await page.close();
});

test('IME composition keeps text and caret; completed text meets contrast in both themes',async()=>{
  const page=await browser.newPage({serviceWorkers:'block'});await page.goto(base);
  const area=page.locator('.notebook .note-document').first();await area.click();await page.keyboard.press('Control+a');await page.keyboard.type('ilk');
  const result=await area.evaluate(element=>{const content=element.querySelector('.block-input');element.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));content.textContent='日本語';const range=document.createRange(),selection=getSelection();range.setStart(content.firstChild,3);range.collapse(true);selection.removeAllRanges();selection.addRange(range);element.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));return {text:element.querySelector('.block-input').textContent,offset:getSelection().getRangeAt(0).startOffset};});
  assert.deepEqual(result,{text:'日本語',offset:3});
  const contrast=async()=>page.evaluate(()=>{const text=document.querySelector('.task-row.done .task-text'),panel=text.closest('.widget');const toRgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number),linear=value=>{const channels=toRgb(value).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;};const a=linear(getComputedStyle(text).color),b=linear(getComputedStyle(panel).backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
  assert.ok(await contrast()>=4.5);await page.locator('#theme-select').selectOption('navy');assert.ok(await contrast()>=4.5);await page.close();
});

test('sidebar preferences, persistent clock, full widget border and mobile controls',async()=>{
  const page=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'block'});
  await page.goto(base);
  assert.equal(await page.locator('#workspace-sidebar #grid-select').count(),1);
  assert.equal(await page.locator('#workspace-sidebar #theme-select').count(),1);
  await page.keyboard.press('Alt+3');
  const note=page.locator('.note-document').first();
  await page.evaluate(()=>window.originalNote=document.querySelector('.note-document'));
  const border=await note.evaluate(element=>{
    const style=getComputedStyle(element.closest('.widget'));
    return {edges:[style.borderTopColor,style.borderRightColor,style.borderBottomColor,style.borderLeftColor],shadow:style.boxShadow};
  });
  assert.equal(new Set(border.edges).size,1);assert.match(border.shadow,/inset/);
  await page.locator('#sidebar-toggle').click();
  assert.equal(await page.locator('#workspace-sidebar').isVisible(),false);
  assert.equal(await page.locator('#sidebar-toggle').getAttribute('aria-expanded'),'false');
  assert.ok(await page.evaluate(()=>window.originalNote===document.querySelector('.note-document')));
  await page.locator('[data-live-clock]').waitFor({state:'visible'});
  assert.match(await page.locator('[data-live-clock]').innerText(),/^\d{2}:\d{2}:\d{2}$/);
  await page.evaluate(()=>scrollTo(0,500));
  assert.equal(Math.round((await page.locator('.topbar').boundingBox()).y),0);
  await page.reload();assert.equal(await page.locator('#workspace-sidebar').isVisible(),false);
  await page.locator('#sidebar-toggle').focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('#workspace-sidebar').isVisible(),true);
  await page.locator('#theme-select').selectOption('navy');
  await page.keyboard.press('Alt+3');
  assert.match(await note.evaluate(element=>getComputedStyle(element.closest('.widget')).borderTopColor),/152, 185, 255/);
  await page.close();
  const mobile=await browser.newPage({viewport:{width:320,height:700},serviceWorkers:'block'});
  await mobile.goto(base);assert.equal(await mobile.locator('#workspace-sidebar').isVisible(),false);
  await mobile.locator('#sidebar-toggle').click();await mobile.locator('#theme-select').selectOption('navy');
  assert.equal(await mobile.locator('#grid-select').isVisible(),true);
  assert.ok(await mobile.locator('[data-live-date]').isVisible());
  assert.ok(await mobile.locator('[data-live-clock]').isVisible());
  assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await mobile.locator('#sidebar-toggle').click();assert.equal(await mobile.locator('#workspace-sidebar').isVisible(),false);
  await mobile.close();
});

test('saved Spotify playlist survives grid updates without the removed URL form and reflows on mobile',async()=>{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:900}});
  let remote={widgets:[{id:'music',type:'spotify',spotifyUrl:'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'}],events:[]},revision=0,loads=0;
  await context.route('https://open.spotify.com/embed/**',route=>{loads++;return route.fulfill({contentType:'text/html',body:'<!doctype html><button>Spotify test player</button>'});});
  await context.route('**/api/**',route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    if(path==='/api/session')return route.fulfill({json:{configured:true,user:{id:'music-user',email:'music@example.com'}}});
    if(request.method()==='GET')return route.fulfill({json:{state:remote,revision}});
    const input=request.postDataJSON();remote=input.state;revision++;return route.fulfill({json:{revision}});
  });
  const page=await context.newPage();await page.goto(base);await page.waitForFunction(()=>document.querySelector('.profile')?.textContent.includes('music@example.com'));
  const card=page.locator('.widget').filter({has:page.locator('.spotify-widget')});
  assert.equal(await card.locator('.spotify-form,.spotify-legacy,input[type=url]').count(),0);
  await card.locator('iframe').waitFor({state:'visible'});
  assert.equal(remote.widgets.find(widget=>widget.type==='spotify').spotifyUrl,'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M');
  const shortcut=await card.getAttribute('aria-keyshortcuts');await page.keyboard.press(shortcut);assert.ok(await page.evaluate(()=>document.activeElement.matches('.widget-head')));
  await card.locator('iframe').scrollIntoViewIfNeeded();await page.frameLocator('.spotify-player').getByRole('button').waitFor();
  const before=loads;await page.evaluate(()=>window.savedPlayer=document.querySelector('.spotify-player'));
  await page.locator('.widget-head').first().focus();await page.keyboard.press('ArrowRight');
  assert.ok(await page.evaluate(()=>window.savedPlayer===document.querySelector('.spotify-player')));
  await page.waitForTimeout(150);assert.equal(loads,before);
  await page.reload();await card.locator('iframe').waitFor({state:'visible'});assert.match(await card.locator('iframe').getAttribute('src'),/open.spotify.com\/embed\/playlist\//);
  await page.setViewportSize({width:320,height:700});
  if(await page.locator('#workspace-sidebar').isVisible())await page.locator('#sidebar-toggle').click();
  await card.scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.equal(await card.locator('a').getAttribute('rel'),'noopener noreferrer');
  await card.locator('[data-spotify-remove]').click();assert.equal(await card.locator('iframe').count(),0);
  await context.close();
});


test('connected Spotify account lists playlists, sends playback controls and activates browser without storing tokens',async()=>{
  const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'}),commands=[];
  const playlist='37i9dQZF1DXcBWIGoYBM5M';
  let shuffle=false,failShuffle=false;
  let failTracks=false;
  await context.route('https://open.spotify.com/embed/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><p>Playlist tracks</p>'}));
  await context.route('**/api/spotify/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/status'))return route.fulfill({json:{configured:true,connected:true,loginRequired:false}});
    if(path.endsWith('/playlists'))return route.fulfill({json:{items:[{id:playlist,name:'My focus playlist <img onerror=evil>',owner:'Me'},{id:'7gwrt2C38WT1Z7sd409355',name:'Second playlist',owner:'Me'}],nextOffset:null}});
    if(path.endsWith('/playlist')){
      if(failTracks)return route.fulfill({status:403,json:{error:'Kendi listeni seç.'}});
      const offset=Number(new URL(route.request().url()).searchParams.get('offset'));
      return route.fulfill({json:{name:'My focus playlist <img onerror=evil>',cover:'javascript:evil',items:offset?Array.from({length:25},(_,index)=>({position:50+index,name:index?'More music '+index:'Page two',artist:'Artist',duration:120000,playable:true})):[{position:0,name:'Unavailable',artist:'',duration:0,playable:false},{position:1,name:'Heat Waves <img onerror=evil>',artist:'Glass Animals',duration:180000,playable:true}],nextOffset:offset?null:50}});
    }
    if(path.endsWith('/devices'))return route.fulfill({json:{devices:[{id:'phone',name:'My phone',active:true}]}});
    if(path.endsWith('/token'))return route.fulfill({json:{access_token:'memory-only-token'}});
    if(path.endsWith('/state'))return route.fulfill({json:{shuffle,playing:commands.at(-1)?.action==='play'||commands.at(-1)?.action==='resume',position:30000,duration:180000,track:{name:'Heat Waves',artist:'Glass Animals',album:'Dreamland',cover:'https://i.scdn.co/image/test-cover'}}});
    if(path.endsWith('/playback')){
      const command=route.request().postDataJSON();commands.push(command);
      if(command.action==='shuffle'){
        if(failShuffle)return route.fulfill({status:503,json:{error:'Spotify unavailable'}});
        shuffle=command.enabled;
      }
    }
    return route.fulfill({json:{ok:true}});
  });
  await context.route('https://sdk.scdn.co/spotify-player.js',route=>route.fulfill({contentType:'text/javascript',body:`window.Spotify={Player:class{constructor(options){this.options=options;this.handlers={};}addListener(name,fn){this.handlers[name]=fn;}connect(){return new Promise(resolve=>this.options.getOAuthToken(()=>{this.handlers.ready({device_id:'browser-device'});resolve(true);}));}activateElement(){return Promise.resolve();}disconnect(){window.playerDisconnected=true;}}};window.onSpotifyWebPlaybackSDKReady();`}));
  await context.route('https://i.scdn.co/image/test-cover',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#58434a"/></svg>'}));
  const page=await context.newPage();await page.goto(base);await page.locator('#tool-toggle').click();await page.locator('[data-add="spotify"]').click();
  const account=page.locator('.spotify-account');await account.locator('[data-spotify-lists] option').nth(1).waitFor({state:'attached'});
  assert.equal(await page.locator('.spotify-form,.spotify-legacy,input[name=spotifyUrl]').count(),0);
  assert.ok((await account.locator('[data-spotify-lists]').boundingBox()).y<(await account.locator('.spotify-media').boundingBox()).y);
  assert.ok(await account.locator('[data-spotify-lists]').evaluate(element=>parseFloat(getComputedStyle(element).borderRadius)>=14));
  // The larger layout retains the complete account/playback interaction flow.
  await account.evaluate(element=>element.closest('.widget').querySelector('.resize-handle').focus());await page.keyboard.press('ArrowRight');
  await page.waitForFunction(()=>!document.querySelector('.spotify-widget').closest('.widget').classList.contains('spotify-paged'));
  await account.locator('.spotify-settings summary').click();
  await account.locator('[data-spotify-lists]').selectOption(playlist);
  const frame=account.locator('.spotify-playlist-player');await frame.waitFor({state:'attached'});
  assert.equal(await frame.isVisible(),false);
  const rows=account.locator('.spotify-track-row');await rows.nth(1).waitFor({state:'visible'});
  assert.equal(await rows.first().isDisabled(),true);
  await rows.nth(1).click();await page.waitForFunction(()=>document.querySelector('.spotify-account').getAttribute('aria-busy')===null);
  assert.deepEqual(commands.at(-1),{action:'play',playlistId:playlist,position:1,deviceId:'phone'});
  assert.equal(await rows.first().isDisabled(),true);assert.equal(await account.locator('[onerror]').count(),0);
  await account.locator('[data-tracks-more]').click();await rows.nth(2).waitFor({state:'visible'});
  const scrollList=account.locator('.spotify-tracks-scroll');await scrollList.scrollIntoViewIfNeeded();
  const scrollInfo=await scrollList.evaluate(element=>({height:element.clientHeight,total:element.scrollHeight,contain:getComputedStyle(element).overscrollBehaviorY}));
  assert.ok(scrollInfo.total>scrollInfo.height);assert.equal(scrollInfo.contain,'contain');
  const widgetBody=account.locator('xpath=ancestor::*[contains(@class,"widget-body")][1]'),scrollBounds=await scrollList.boundingBox(),bodyBounds=await widgetBody.boundingBox();
  const oldOuter=await widgetBody.evaluate(element=>element.scrollTop);
  await page.mouse.move(scrollBounds.x+scrollBounds.width/2,(Math.max(scrollBounds.y,bodyBounds.y)+Math.min(scrollBounds.y+scrollBounds.height,bodyBounds.y+bodyBounds.height))/2);
  await page.mouse.wheel(0,600);await page.waitForTimeout(150);
  assert.ok(await scrollList.evaluate(element=>element.scrollTop>0));assert.equal(await widgetBody.evaluate(element=>element.scrollTop),oldOuter);
  await rows.nth(2).click();await page.waitForFunction(()=>document.querySelector('.spotify-account').getAttribute('aria-busy')===null);assert.equal(commands.at(-1).position,50);
  assert.equal(await frame.getAttribute('src'),'https://open.spotify.com/embed/playlist/'+playlist+'?theme=0');
  assert.match(await account.locator('[data-spotify-playlist-name]').textContent(),/My focus playlist <img onerror=evil>/);
  await frame.evaluate(element=>window.selectedPlaylistFrame=element);
  failTracks=true;await account.locator('[data-spotify-lists]').selectOption('7gwrt2C38WT1Z7sd409355');
  await account.locator('[data-tracks-retry]').waitFor({state:'visible'});
  failTracks=false;await account.locator('[data-tracks-retry]').click();await rows.nth(1).waitFor({state:'visible'});
  assert.equal(await frame.getAttribute('src'),'https://open.spotify.com/embed/playlist/7gwrt2C38WT1Z7sd409355?theme=0');
  assert.ok(await frame.evaluate(element=>element===window.selectedPlaylistFrame));
  await account.locator('[data-spotify-lists]').selectOption('');assert.equal(await frame.count(),0);
  await account.locator('[data-spotify-lists]').selectOption(playlist);await frame.waitFor({state:'attached'});await rows.nth(1).waitFor({state:'visible'});
  const shuffleButton=account.locator('[data-spotify-shuffle]');
  const waitForCommand=()=>page.waitForFunction(()=>document.querySelector('.spotify-account').getAttribute('aria-busy')===null);
  await shuffleButton.click();await waitForCommand();assert.equal(await shuffleButton.getAttribute('aria-pressed'),'true');
  assert.deepEqual(commands.at(-1),{action:'shuffle',enabled:true,deviceId:'phone'});
  failShuffle=true;await shuffleButton.click();await waitForCommand();assert.equal(await shuffleButton.getAttribute('aria-pressed'),'true');
  assert.match(await account.locator('[data-spotify-message]').textContent(),/Spotify unavailable/);
  failShuffle=false;await shuffleButton.click();await waitForCommand();assert.equal(await shuffleButton.getAttribute('aria-pressed'),'false');assert.equal(shuffle,false);
  await account.locator('[data-spotify-command="play"]').click();assert.deepEqual(commands.at(-1),{action:'play',playlistId:playlist,deviceId:'phone'});
  await account.locator('[data-spotify-command="pause"]').click();assert.equal(commands.at(-1).action,'pause');
  await account.locator('[data-spotify-browser]').click();await page.waitForFunction(()=>document.querySelector('[data-spotify-devices]').value==='browser-device');
  await account.locator('[data-spotify-toggle]').click();assert.equal(commands.at(-1).deviceId,'browser-device');
  await waitForCommand();await rows.nth(1).focus();await page.keyboard.press('Enter');await waitForCommand();
  assert.deepEqual(commands.at(-1),{action:'play',playlistId:playlist,position:1,deviceId:'browser-device'});
  assert.equal(new URL(page.url()).origin,new URL(base).origin);
  await page.keyboard.press(await account.evaluate(element=>element.closest('.widget').getAttribute('aria-keyshortcuts')));
  assert.ok(await page.evaluate(()=>document.activeElement.matches('[data-spotify-toggle]')));
  assert.equal(await account.locator('.spotify-list-cover').getAttribute('src'),null);
  assert.equal(await account.locator('[data-spotify-title]').textContent(),'Heat Waves');
  assert.equal(await account.locator('[data-spotify-album]').textContent(),'Dreamland');
  assert.equal(await account.locator('[data-spotify-cover]').getAttribute('src'),'https://i.scdn.co/image/test-cover');
  await account.locator('[data-spotify-progress]').evaluate(element=>{element.value='45000';element.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.waitForFunction(()=>document.querySelector('.spotify-account').getAttribute('aria-busy')===null);
  assert.equal(commands.at(-1).action,'seek');assert.equal(commands.at(-1).positionMs,45000);
  assert.equal(await account.locator('[onerror]').count(),0);
  assert.ok(await page.evaluate(()=>![...Object.values(localStorage),...Object.values(sessionStorage)].some(value=>value.includes('memory-only-token'))));
  await page.setViewportSize({width:320,height:700});if(await page.locator('#workspace-sidebar').isVisible())await page.locator('#sidebar-toggle').click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await account.locator('[data-spotify-disconnect]').click();await account.locator('[data-spotify-controls]').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.playerDisconnected),true);
  await context.close();
});

test('clipboard automatically enables capture and keeps a list-only UI with stable keyboard focus',async()=>{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:900}});
  await context.addInitScript(()=>{
    let state={enabled:false,durable:true,items:[]},listener;
    window.clipboardCalls=[];
    window.monoDesktop={zone:async()=>({}),reminders:{sync:async()=>true},clipboard:{
      onChange:fn=>{listener=fn;},list:async()=>state,
      watch:async enabled=>{window.clipboardCalls.push(['watch',enabled]);state={...state,enabled};return state;},
      copy:async id=>window.clipboardCalls.push(['copy',id]),
      pin:async id=>{state={...state,items:state.items.map(item=>item.id===id?{...item,pinned:!item.pinned}:item)};return state;},
      remove:async id=>{state={...state,items:state.items.filter(item=>item.id!==id)};return state;}
    }};
    window.addClipboardItem=(id,text)=>{state={...state,items:[{id,text,at:Date.now(),pinned:false},...state.items]};listener?.(state);};
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.locator('#tool-toggle').click();await page.locator('[data-add=clipboard]').click();
  await page.waitForFunction(()=>window.clipboardCalls.some(([name,value])=>name==='watch'&&value===true));
  assert.equal(await page.locator('[data-clipboard-watch],[data-clipboard-read],[data-clipboard-clear],[data-clipboard-search]').count(),0);
  await page.evaluate(()=>addClipboardItem('one','<img src=x onerror=alert(1)>'));
  await page.locator('[data-copy=one]').waitFor();assert.equal(await page.locator('.clipboard-list img').count(),0);
  await page.locator('[data-copy=one]').focus();await page.evaluate(()=>addClipboardItem('two','Second capture'));
  await page.locator('[data-copy=two]').waitFor();assert.ok(await page.locator('[data-copy=one]').evaluate(button=>button===document.activeElement));
  await page.locator('[data-copy=one]').click();assert.ok(await page.evaluate(()=>clipboardCalls.some(([name,id])=>name==='copy'&&id==='one')));
  await page.locator('[data-pin=one]').click();await page.waitForFunction(()=>document.querySelector('[data-pin=one]').getAttribute('aria-pressed')==='true');
  await page.locator('[data-delete=one]').click();await page.locator('[data-copy=one]').waitFor({state:'detached'});assert.ok(await page.locator('.clipboard-list').evaluate(list=>list===document.activeElement));
  const index=await page.locator('.widget').evaluateAll(widgets=>widgets.findIndex(widget=>widget.querySelector('.clipboard-widget'))+1);
  await page.keyboard.press(`Alt+${index}`);assert.ok(await page.locator('.clipboard-list').evaluate(list=>list===document.activeElement));
  assert.deepEqual(errors,[]);await context.close();
});

test('desktop update UI blocks offline unsaved edits, recovers install failures and prepares saved restart',async()=>{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:900}});
  await context.addInitScript(()=>{
    let listener;window.installCalls=0;window.failInstall=true;
    window.monoDesktop={clipboard:{onChange:()=>{}},zone:async()=>({}),reminders:{sync:async()=>true},updates:{
      status:async()=>({phase:'ready',currentVersion:'1.2.4',version:'1.2.5'}),check:async()=>({phase:'current'}),
      onChange:fn=>{listener=fn;},install:async()=>{window.installCalls++;if(window.failInstall)throw Error('Installer test failure');return true;}
    }};
    window.updateEvent=value=>listener?.(value);
  });
  let remote={widgets:[{id:'n',type:'note',text:'Original note',grid:{slot:0,cols:1,rows:1}}],events:[],gridColumns:2},revision=1,offline=false;
  await context.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;
    if(path==='/api/session')return route.fulfill({json:{configured:true,user:{id:'updates-user',email:'updates@example.com'}}});
    if(path==='/api/workspace'){
      if(offline)return route.abort('failed');
      if(route.request().method()==='GET')return route.fulfill({json:{state:remote,revision}});
      const input=route.request().postDataJSON();if(input.revision!==revision)return route.fulfill({status:409,json:{error:'Conflict'}});remote=input.state;return route.fulfill({json:{revision:++revision}});
    }return route.fulfill({json:{}});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
  await page.waitForFunction(()=>document.querySelector('.profile')?.textContent.includes('updates@example.com'));
  assert.equal(await page.locator('#desktop-update').textContent(),'Güncelle ve yeniden başlat');
  offline=true;await page.locator('.note-document').click();await page.keyboard.press('Control+a');await page.keyboard.type('Saved before update');await page.waitForTimeout(800);
  await page.locator('#desktop-update').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('henüz kaydedilmedi'));
  assert.equal(await page.evaluate(()=>installCalls),0);assert.equal(await page.locator('#app').evaluate(app=>app.inert),false);
  offline=false;await page.locator('#save-status').click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('Kaydedildi'));
  await page.locator('#desktop-update').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Installer test failure');assert.equal(await page.evaluate(()=>installCalls),1);assert.equal(await page.locator('#app').evaluate(app=>app.inert),false);
  await page.evaluate(()=>{failInstall=false;});await page.locator('#desktop-update').click();await page.waitForFunction(()=>installCalls===2&&document.querySelector('#app').inert);
  assert.equal(remote.widgets[0].pages[0].blocks[0].text,'Saved before update');assert.deepEqual(errors,[]);await context.close();
});

test('notes show one empty hint, delete pages with confirmation and restore them from account settings',async()=>{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:900}});let remote={widgets:[{id:'notes-rev',type:'note',title:'Notlar',pages:[{id:'blank',name:'Blank',blocks:[{id:'b1',type:'text',text:''},{id:'b2',type:'text',text:''}]},{id:'full',name:'Keep me',blocks:[{id:'f1',type:'text',text:'Recover this text'}]}],pageId:'blank',grid:{slot:0,cols:1,rows:1}}],events:[],gridColumns:3},revision=1;
  await context.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;if(path==='/api/session')return route.fulfill({json:{configured:true,user:{id:'rev-user',email:'rev@example.com'}}});if(path==='/api/workspace'){if(route.request().method()==='GET')return route.fulfill({json:{state:remote,revision}});remote=route.request().postDataJSON().state;return route.fulfill({json:{revision:++revision}});}return route.fulfill({json:{configured:false}});});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.waitForFunction(()=>document.querySelector('.profile')?.textContent.includes('rev@example.com'));
  assert.equal(await page.locator('.block-input[data-placeholder]:not([data-placeholder=""])').count(),1);
  await page.locator('.block-input').nth(1).click();await page.keyboard.type('Other line');assert.equal(await page.locator('.block-input:not([data-placeholder=""])').count(),0);await page.locator('.note-document').click();await page.keyboard.press('Control+a');await page.keyboard.press('Backspace');assert.equal(await page.locator('.block-input:not([data-placeholder=""])').count(),1);
  await page.locator('[data-page-list]').click();await page.getByRole('button',{name:'Blank sayfasını sil',exact:true}).click();assert.equal(await page.locator('.name-dialog[open]').count(),0);assert.equal(await page.locator('[data-page] option[value=blank]').count(),0);assert.match(await page.locator('.note-document').textContent(),/Recover this text/);
  await page.getByRole('button',{name:'Keep me sayfasını sil',exact:true}).click();await page.locator('.name-dialog').getByRole('button',{name:'Vazgeç'}).click();assert.match(await page.locator('.note-document').textContent(),/Recover this text/);
  await page.getByRole('button',{name:'Keep me sayfasını sil',exact:true}).click();await page.locator('.name-dialog button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('.note-document').textContent==='');await page.locator('.manage-dialog [data-close]').click();
  await page.locator('#profile-menu').click();await page.locator('[data-settings]').click();await page.locator('[data-tab=pages]').click();const row=page.locator('[data-page-trash]>div').filter({hasText:'Keep me'});await row.getByRole('button',{name:'Geri getir'}).click();await page.locator('.settings-dialog [data-close]').click();assert.match(await page.locator('.note-document').textContent(),/Recover this text/);
  await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('Kaydedildi'));await page.reload();await page.waitForFunction(()=>document.querySelector('.profile')?.textContent.includes('rev@example.com'));assert.match(await page.locator('.note-document').textContent(),/Recover this text/);assert.deepEqual(errors,[]);await context.close();
});

test('settings resize widgets to 1x3, expand grid, archive desks and keep drawing across reload and mobile',async()=>{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1920,height:1080}});let remote={widgets:[{id:'todo-rev',type:'tasks',title:'Tasks',tasks:[],grid:{slot:0,cols:1,rows:1}}],events:[],gridColumns:3},revision=1;
  await context.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;if(path==='/api/session')return route.fulfill({json:{configured:true,user:{id:'layout-rev',email:'layout@example.com'}}});if(path==='/api/workspace'){if(route.request().method()==='GET')return route.fulfill({json:{state:remote,revision}});remote=route.request().postDataJSON().state;return route.fulfill({json:{revision:++revision}});}return route.fulfill({json:{configured:false}});});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.waitForFunction(()=>document.querySelector('.profile')?.textContent.includes('layout@example.com'));
  const handle=page.locator('.resize-handle');await handle.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');assert.match(await handle.getAttribute('aria-label'),/1 sütun, 3 satır/);
  await page.locator('#profile-menu').click();await page.locator('[data-settings]').click();await page.locator('[name=gridMode]').selectOption('auto');await page.locator('[name=widgetScale]').selectOption('1.2');await page.locator('[data-preferences] [type=submit]').click();await page.locator('.settings-dialog [data-close]').click();await page.waitForFunction(()=>Number(document.querySelector('#grid-select').value)>=5);
  await page.locator('#tool-toggle').click();await page.locator('[data-add=drawing]').click();const canvas=page.locator('.drawing-widget canvas'),rect=await canvas.boundingBox();await page.mouse.move(rect.x+20,rect.y+30);await page.mouse.down();await page.mouse.move(rect.x+120,rect.y+90,{steps:10});await page.mouse.up();await page.locator('[data-draw-tool]').selectOption('text');await page.locator('[data-draw-text]').fill('Sketch label');await canvas.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('Kaydedildi'));assert.equal(remote.widgets.find(w=>w.type==='drawing').drawing.length,2);
  await page.locator('#desk-add').click();await page.locator('.name-dialog input').fill('Temporary desk');await page.locator('.name-dialog [type=submit]').click();await page.locator('#desk-list').click();await page.getByRole('button',{name:'Temporary desk masasını sil',exact:true}).click();await page.locator('.name-dialog [type=submit]').click();await page.locator('.settings-dialog [data-close]').click();assert.equal(await page.locator('#desk-select option').count(),1);
  await page.locator('#profile-menu').click();await page.locator('[data-settings]').click();await page.locator('[data-tab=desks]').click();await page.locator('[data-desk-trash]').getByRole('button',{name:'Geri getir'}).click();await page.locator('.settings-dialog [data-close]').click();assert.equal(await page.locator('#desk-select option').count(),2);
  await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('Kaydedildi'));await page.reload();await page.waitForFunction(()=>document.querySelector('.profile')?.textContent.includes('layout@example.com'));assert.match(await page.locator('[data-draw-summary]').textContent(),/Sketch label/);await page.setViewportSize({width:320,height:700});await page.locator('#profile-menu').click();await page.locator('[data-settings]').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await context.close();
});

test('clipboard cloud is opt-in, filters expired entries, shares with another device and can be disabled',async()=>{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:900}});let remote={widgets:[{id:'clip-rev',type:'clipboard',title:'Clipboard',grid:{slot:0,cols:1,rows:1}}],events:[],gridColumns:3},revision=1;
  const accountRoute=route=>{const path=new URL(route.request().url()).pathname;if(path==='/api/session')return route.fulfill({json:{configured:true,user:{id:'clip-account',email:'clip@example.com'}}});if(path==='/api/workspace'){if(route.request().method()==='GET')return route.fulfill({json:{state:remote,revision}});remote=route.request().postDataJSON().state;return route.fulfill({json:{revision:++revision}});}return route.fulfill({json:{configured:false}});};await context.route('**/api/**',accountRoute);
  await context.addInitScript(()=>{let actionListener;let items=[{id:'local-secret',text:'Device-only text',at:Date.now(),pinned:false},{id:'expired-secret',text:'Expired private',at:Date.now()-4*86400000,pinned:true}];window.monoDesktop={zone:async()=>({}),reminders:{sync:async()=>true},clipboard:{onAction:fn=>{actionListener=fn;},cloudAction:async value=>{actionListener?.({...value,at:Date.now()});return true;},onChange:()=>{},list:async()=>({enabled:true,durable:true,items}),configure:async({days})=>{items=items.filter(i=>!days||i.at>=Date.now()-days*86400000);return {enabled:true,durable:true,items};},copy:async()=>true,pin:async()=>({enabled:true,durable:true,items}),remove:async()=>({enabled:true,durable:true,items:[]})}};});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.waitForFunction(()=>document.querySelector('.profile')?.textContent.includes('clip@example.com'));assert.match(await page.locator('.clipboard-list').textContent(),/Device-only text/);assert.ok(!(await page.locator('.clipboard-list').textContent()).includes('Expired private'));assert.ok(!JSON.stringify(remote).includes('Device-only text'));
  await page.locator('#profile-menu').click();await page.locator('[data-settings]').click();await page.locator('[data-tab=clipboard]').click();await page.locator('[name=clipboardCloud]').check();await page.locator('[data-clipboard-preferences] [type=submit]').click();await page.locator('.settings-dialog [data-close]').click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('Kaydedildi'));assert.equal(remote.settings.clipboardCloud,true);assert.equal(remote.clipboardItems[0].text,'Device-only text');assert.ok(!JSON.stringify(remote).includes('Expired private'));
  const second=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:900}});await second.route('**/api/**',accountRoute);const other=await second.newPage();await other.goto(base);await other.waitForFunction(()=>document.querySelector('.profile')?.textContent.includes('clip@example.com'));assert.match(await other.locator('.clipboard-list').textContent(),/Device-only text/);await second.close();
  await page.locator('[data-pin=local-secret]').click();await page.waitForFunction(()=>document.querySelector('[data-pin=local-secret]').getAttribute('aria-pressed')==='true');await page.locator('[data-delete=local-secret]').click();await page.locator('[data-copy=local-secret]').waitFor({state:'detached'});
  await page.locator('#profile-menu').click();await page.locator('[data-settings]').click();await page.locator('[data-tab=clipboard]').click();await page.locator('[name=clipboardCloud]').uncheck();await page.locator('[data-clipboard-preferences] [type=submit]').click();await page.locator('.name-dialog [type=submit]').click();await page.locator('.settings-dialog [data-close]').click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('Kaydedildi'));assert.equal(remote.settings.clipboardCloud,false);assert.deepEqual(remote.clipboardItems,[]);assert.deepEqual(errors,[]);await context.close();
});

test('detached notes render alone, commit edits through native bridge and can toggle always-on-top',async()=>{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:420,height:520}});
  await context.addInitScript(()=>{window.commits=[];window.topValue=true;let version=1;const state={widgets:[{id:'detached',type:'note',title:'Detached note',text:'Original',grid:{slot:0,cols:1,rows:1}}],events:[],gridColumns:3,settings:{},activeDeskId:'overlay',desks:[{id:'overlay',name:'Mini'}]};window.monoDesktop={overlayId:'detached',clipboard:{onChange:()=>{},list:async()=>({enabled:true,durable:true,items:[]})},workspace:{read:async()=>({state,version}),onChange:()=>{},onEdit:()=>{},commit:async value=>{window.commits.push(value);return {version:++version};},top:async value=>{topValue=value;return value;},close:async()=>{}}};});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.waitForFunction(()=>document.querySelector('.note-document')?.textContent==='Original');assert.equal(await page.locator('.widget').count(),1);assert.equal(await page.locator('#workspace-sidebar').count(),0);await page.locator('.note-document').click();await page.keyboard.press('Control+a');await page.keyboard.type('From compact window');await page.waitForFunction(()=>commits.some(value=>value.widget.text==='From compact window'));await page.locator('[data-overlay-top]').click();assert.equal(await page.evaluate(()=>topValue),false);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await context.close();
});
