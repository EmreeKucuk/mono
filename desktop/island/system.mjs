import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {EMPTY_SYSTEM,systemSnapshot,systemCommand} from './model.mjs';
export function startSystemBridge({executable,publish,spawnProcess=spawn}){
  let child,retry,timer,stopped=false,sequence=0,attempt=0;const waiting=new Map();
  const fail=()=>{for(const p of waiting.values()){clearTimeout(p.timer);p.reject(Error('Windows bağlantısı kesildi.'));}waiting.clear();publish({...EMPTY_SYSTEM});};
  function start(){
    if(stopped)return;
    child=spawnProcess(executable,[],{stdio:['pipe','pipe','ignore'],windowsHide:true});const current=child;
    // Bound newline-free or malicious output before readline buffers it indefinitely.
    let bytes=0;current.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>1_000_000)current.kill();if(chunk.includes(10))bytes=0;});
    const lines=createInterface({input:current.stdout});
    lines.on('line',line=>{try{if(line.length>600000)throw Error();const message=JSON.parse(line);if(message.type==='system.snapshot'){attempt=0;publish(systemSnapshot(message));}else if(message.type==='command.result'){const entry=waiting.get(message.id);if(entry){clearTimeout(entry.timer);waiting.delete(message.id);message.ok?entry.resolve(true):entry.reject(Error('Windows bu işlemi tamamlayamadı.'));}}}catch{/* Ignore invalid, untrusted helper output. */}});
    const ended=()=>{if(child!==current)return;child=null;lines.close();fail();if(!stopped)retry=setTimeout(start,Math.min(30000,1000*2**Math.min(attempt++,5)));};
    current.on('error',ended);current.on('exit',ended);current.stdin.on('error',()=>{});
  }
  start();
  return {command(input){const command=systemCommand(input);if(!child?.stdin.writable)return Promise.reject(Error('Windows bağlantısı hazır değil.'));if(waiting.size>=12)return Promise.reject(Error('Önceki işlemin tamamlanmasını bekle.'));const id=String(++sequence);return new Promise((resolve,reject)=>{timer=setTimeout(()=>{waiting.delete(id);reject(Error('Windows yanıt vermedi.'));},5000);waiting.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({type:'command',id,...command})+'\n');});},stop(){stopped=true;clearTimeout(retry);child?.kill();fail();}};
}
