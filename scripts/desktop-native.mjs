import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {mkdirSync} from 'node:fs';
if(process.platform!=='win32')throw Error('Windows yardımcı uygulaması Windows üzerinde derlenmeli.');
const cache=resolve('.runtime-cache');mkdirSync(cache,{recursive:true});
const result=spawnSync('dotnet',['publish','desktop/native/Mono.System.csproj','-c','Release','-o',resolve(cache,'native-publish'),'--nologo'],{stdio:'inherit',windowsHide:true,env:{...process.env,DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_SKIP_FIRST_TIME_EXPERIENCE:'1',DOTNET_CLI_HOME:resolve(cache,'dotnet'),NUGET_PACKAGES:resolve(cache,'nuget'),NUGET_HTTP_CACHE_PATH:resolve(cache,'nuget-http'),NUGET_SCRATCH:resolve(cache,'nuget-scratch')}});
if(result.error)throw Error('.NET 10 SDK gerekli: '+result.error.message);
if(result.status!==0)process.exit(result.status||1);
