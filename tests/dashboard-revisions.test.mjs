import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeWorkspace} from '../public/state-schema.js';
import {trashPage,restorePage,deleteDesk,restoreDesk} from '../public/recycle-bin.js';
import {protectPage,unlockPage,openedPage} from '../public/note-vault.js';
import {changeColumns,normalizeGrid,snapSpan,validSpan,compactAroundLarge,applyLayout} from '../public/grid-layout.js';
import {preferences,adaptiveColumns} from '../public/preferences.js';
import {clipboardItems} from '../public/clipboard-model.js';
import {sanitizeDrawing} from '../public/drawing.js';
import {createWorkspaceBridge} from '../desktop/workspace.mjs';
const seed=()=>sanitizeWorkspace({widgets:[{id:'note',type:'note',text:'Keep',grid:{slot:0,cols:1,rows:1}}],events:[],gridColumns:3});
test('deleted encrypted pages preserve identity and restore with original PIN; desks retain independent layouts',async()=>{
  const state=seed(),page={id:'private',name:'Secret',blocks:[{id:'b',type:'text',text:'Protected text',indent:0,done:false}]};await protectPage(page,'note','0042');
  state.widgets[0].pages=[page];trashPage(state,state.widgets[0],page);state.widgets[0].pages=[];
  const loaded=sanitizeWorkspace(JSON.parse(JSON.stringify(state)));assert.ok(!JSON.stringify(loaded).includes('Protected text'));restorePage(loaded,loaded.deletedPages[0].id);const restored=loaded.widgets[0].pages[0];await unlockPage(restored,'note','0042');assert.equal(openedPage(restored).blocks[0].text,'Protected text');
  deleteDesk(loaded,'default');assert.equal(loaded.desks.length,1);assert.equal(loaded.widgets.length,0);const deleted=loaded.deletedDesks[0];restoreDesk(loaded,deleted.id);assert.equal(loaded.desks.length,2);assert.equal(loaded.desks.find(d=>d.id==='default').workspace.widgets[0].id,'note');assert.equal(loaded.deletedDesks.length,0);
});
test('schema upgrades existing records and supports six-column grids and 1x3 rectangles',()=>{
  const state=seed();assert.equal(state.schemaVersion,4);assert.deepEqual(state.settings,preferences());assert.equal(validSpan(1,3),true);assert.deepEqual(snapSpan(1,3,3),{cols:1,rows:3});
  state.widgets=Array.from({length:3},(_,i)=>({id:'w'+i,type:'tasks',grid:{slot:i,cols:1,rows:3}}));normalizeGrid(state);applyLayout(state,compactAroundLarge(state.widgets,3));assert.deepEqual(state.widgets.map(w=>w.grid),[{slot:0,cols:1,rows:3},{slot:1,cols:1,rows:3},{slot:2,cols:1,rows:3}]);changeColumns(state,5);assert.equal(sanitizeWorkspace(state).gridColumns,5);assert.equal(adaptiveColumns(1550),5);assert.equal(adaptiveColumns(900),3);
});
test('clipboard expires all records after chosen age, keeps unlimited age and never persists disabled cloud history',()=>{
  const now=Date.now(),items=[{id:'old',text:'Old private',at:now-4*86400000,pinned:true},{id:'new',text:'Current',at:now,pinned:false}];assert.deepEqual(clipboardItems(items,3,now).map(i=>i.id),['new']);assert.equal(clipboardItems(items,0,now).length,2);
  const state=seed();state.clipboardItems=items;state.clipboardRemoved=[{text:'Old private',at:now}];assert.deepEqual(sanitizeWorkspace(state).clipboardItems,[]);assert.deepEqual(sanitizeWorkspace(state).clipboardRemoved,[]);state.settings.clipboardCloud=true;assert.equal(sanitizeWorkspace(state).clipboardItems.length,1);
});
test('drawing model rejects executable colors, unbounded coordinates and unsupported tools without rendering HTML',()=>{
  const drawing=sanitizeDrawing([{id:'bad" attr',tool:'script',color:'url(javascript:evil)',points:[[.2,.4],[100,-2],[NaN,3]],text:'<img onerror=evil>',width:300}]);assert.equal(drawing[0].color,'#e8eeef');assert.equal(drawing[0].tool,'pen');assert.equal(drawing[0].width,30);assert.deepEqual(drawing[0].points,[[.2,.4],[1,0]]);assert.ok(!drawing[0].id.includes('"'));
});
test('detached widget commits validate scope and reject concurrent changes without silent overwrite',()=>{
  const bridge=createWorkspaceBridge(),state=seed();state.widgets[0].pages=[{id:'p',name:'Note',blocks:[{id:'b',type:'text',text:'Original'}]}];bridge.publish(state);const a=bridge.read('note'),b=bridge.read('note');a.state.widgets[0].pages[0].blocks[0].text='Window A';bridge.commit('note',{version:a.version,widget:a.state.widgets[0],deletedPages:[]});b.state.widgets[0].pages[0].blocks[0].text='Window B';assert.throws(()=>bridge.commit('note',{version:b.version,widget:b.state.widgets[0]}),/başka bir pencerede/);assert.equal(bridge.read('note').state.widgets[0].pages[0].blocks[0].text,'Window A');assert.throws(()=>bridge.commit('note',{version:bridge.read('note').version,widget:{id:'other',type:'note'}}),/Geçersiz/);
});
