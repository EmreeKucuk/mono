import {app,BrowserWindow} from 'electron';
import {installIsland} from '../../desktop/island/host.mjs';
app.setPath('userData',process.argv.at(-1));await app.whenReady();
const main=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
await main.loadURL('about:blank');await installIsland({main,origin:'http://127.0.0.1:1',test:true});
