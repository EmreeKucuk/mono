import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createVisibilityPreference} from '../desktop/island/visibility.mjs';

test('Island defaults on, persists off across restart and serializes tray and settings changes',async()=>{
  await mkdir('.test-temp',{recursive:true});
  const directory=await mkdtemp('.test-temp/island-preference-'),file=join(directory,'island.json');
  const load=async()=>{try{return JSON.parse(await readFile(file,'utf8'));}catch{return {enabled:true};}};
  let prefs=await load(),visible=true,writes=0;
  const create=()=>createVisibilityPreference({prefs,persist:async()=>{writes++;await writeFile(file,JSON.stringify(prefs));},apply:()=>{visible=prefs.enabled;},status:()=>({enabled:prefs.enabled,visible})});
  let controller=create();
  assert.equal(prefs.enabled,true);
  assert.deepEqual(await controller.setEnabled(false),{enabled:false,visible:false});
  prefs=await load();visible=prefs.enabled;controller=create();
  assert.equal(prefs.enabled,false,'A restarted process keeps the disabled preference');
  await controller.setEnabled(false);assert.equal(writes,1,'An explicit setting is idempotent');
  const changes=[controller.setEnabled(true),controller.toggle(),controller.toggle()];
  assert.deepEqual((await Promise.all(changes)).map(value=>value.enabled),[true,false,true]);
  assert.equal((await load()).enabled,true);assert.equal(visible,true);
});

test('Island rolls back a failed save, keeps the window unchanged and can retry',async()=>{
  const prefs={enabled:true};let fail=true,visible=true;
  const controller=createVisibilityPreference({prefs,persist:async()=>{if(fail)throw Error('Disk full');},apply:()=>{visible=prefs.enabled;},status:()=>({enabled:prefs.enabled,visible})});
  await assert.rejects(controller.setEnabled(false),/Disk full/);
  assert.equal(prefs.enabled,true);assert.equal(visible,true);
  for(const invalid of [null,'false',0,{},undefined])await assert.rejects(controller.setEnabled(invalid),/Geçersiz/);
  fail=false;assert.deepEqual(await controller.setEnabled(false),{enabled:false,visible:false});
});
