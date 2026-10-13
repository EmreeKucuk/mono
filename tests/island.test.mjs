import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {EMPTY_SYSTEM,systemSnapshot,systemCommand,workspaceSummary,islandBounds,insideSurface} from '../desktop/island/model.mjs';
import {startSystemBridge} from '../desktop/island/system.mjs';
import {parseForecast} from '../server/weather.mjs';

test('Island projects only active desk events, clamps system payloads and rejects arbitrary commands',()=>{
  const result=workspaceSummary({activeDeskId:'a',desks:[{id:'a',name:'İş'}],events:[{id:'e',date:'2026-10-13',time:'10:30',text:'Plan'}],widgets:[{type:'note',text:'private note'}],clipboardItems:[{text:'secret'}]});
  assert.equal(result.desk,'İş');assert.equal(result.events[0].text,'Plan');assert.ok(!JSON.stringify(result).includes('secret'));assert.ok(!JSON.stringify(result).includes('private'));
  const system=systemSnapshot({type:'system.snapshot',audio:{available:true,volume:10},media:{art:'javascript:alert(1)',title:'<img onerror=alert(1)>'},wifi:{status:'connected',signal:999}});
  assert.equal(system.audio.volume,1);assert.equal(system.media.art,'');assert.equal(system.wifi.signal,4);
  for(const value of [{action:'exec',value:'powershell'},{action:'audio.volume',value:Infinity},{action:'audio.volume',value:-1},{action:'audio.mute',value:'yes'}])assert.throws(()=>systemCommand(value));
  assert.deepEqual(systemCommand({action:'audio.volume',value:.4,extra:'discard'}),{action:'audio.volume',value:.4});
});
test('Island centres on monitor work area including negative coordinates and ignores transparent corners',()=>{
  const b=islandBounds({workArea:{x:-1920,y:40,width:1920,height:1040}});assert.equal(b.x,-1252);assert.equal(b.y,48);
  const hit={x:162,y:8,width:260,height:54};assert.equal(insideSurface({x:b.x+292,y:b.y+35},b,hit),true);assert.equal(insideSurface({x:b.x+162,y:b.y+8},b,hit),false);assert.equal(insideSurface({x:b.x+300,y:b.y+300},b,hit),false);
});
test('forecast validates current data and preserves legacy fields while filtering malformed hourly values',()=>{
  const data=parseForecast({name:'İstanbul'},{current:{temperature_2m:21,weather_code:0,is_day:1,time:'2026-10-13T14:00'},hourly:{time:['2026-10-13T15:00','<img>','2026-10-13T16:00'],temperature_2m:[22,23,'bad'],weather_code:[0,0,0],precipitation_probability:[150]},daily:{time:['2026-10-13'],temperature_2m_min:[14],temperature_2m_max:[24],weather_code:[0]}},123);
  assert.equal(data.temperature,21);assert.equal(data.summary,'Açık');assert.equal(data.hourly.length,1);assert.equal(data.hourly[0].rain,100);assert.equal(data.daily[0].max,24);assert.equal(data.updatedAt,123);assert.throws(()=>parseForecast({},{}));
});
test('Windows bridge correlates command results, validates commands and fails pending requests on shutdown',async()=>{
  const child=new EventEmitter(),sent=[],states=[];child.stdout=new PassThrough();child.stdin=new Writable({write(chunk,encoding,done){sent.push(JSON.parse(chunk));done();}});child.kill=()=>child.emit('exit',0);
  const bridge=startSystemBridge({executable:'test',spawnProcess:()=>child,publish:value=>states.push(value)});
  child.stdout.write(JSON.stringify({type:'system.snapshot',audio:{available:true,volume:.2}})+'\n');await new Promise(r=>setImmediate(r));assert.equal(states[0].audio.volume,.2);
  const command=bridge.command({action:'audio.mute',value:true});child.stdout.write(JSON.stringify({type:'command.result',id:sent[0].id,ok:true})+'\n');assert.equal(await command,true);
  assert.throws(()=>bridge.command({action:'exec'}));const pending=bridge.command({action:'media.next'});const failure=assert.rejects(pending,/kesildi/);bridge.stop();await failure;assert.deepEqual(states.at(-1),EMPTY_SYSTEM);
});
