import {app,BrowserWindow} from 'electron';
import {installIsland} from '../../desktop/island/host.mjs';
app.setPath('userData',process.argv.at(-1));
// Electron waits for the ESM entry point to finish before emitting ready.
// Awaiting whenReady at module scope would prevent either from completing.
app.whenReady().then(async()=>{
  const main=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  await main.loadURL('about:blank');await installIsland({main,origin:'http://127.0.0.1:1',test:true});
}).catch(error=>{
  console.error('Island fixture failed to start:',error);
  app.exit(1);
});
