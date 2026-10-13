import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {extractFile} from '@electron/asar';

const require=createRequire(import.meta.url),yaml=require('js-yaml');

export async function verifyDesktop(directory='release/win-unpacked'){
  const pkg=JSON.parse(await readFile('package.json','utf8'));
  const archive=join(directory,'resources','app.asar');
  const packaged=JSON.parse(extractFile(archive,'package.json'));
  if(packaged.version!==pkg.version||!packaged.dependencies?.['electron-updater'])throw Error('Missing or outdated packaged application.');
  extractFile(archive,join('node_modules','electron-updater','out','main.js'));
  extractFile(archive,join('desktop','updates.mjs'));
  for(const file of ['visibility.mjs','host.mjs','model.mjs','system.mjs','preload.cjs','index.html','island.js','island.css']){
    const path=join('desktop','island',file);
    if(!extractFile(archive,path).equals(await readFile(path)))throw Error('Packaged Island source is outdated: '+file);
  }
  for(const path of ['desktop/main.mjs','desktop/preload.cjs']){
    if(!extractFile(archive,path).equals(await readFile(path)))throw Error('Packaged desktop source is outdated: '+path);
  }
  const helper=await readFile(join(directory,'resources','native','Mono.System.exe'));
  if(helper.length<1000000||helper.subarray(0,2).toString()!=='MZ')throw Error('Missing Windows system helper.');
  if(!helper.equals(await readFile('.runtime-cache/native-publish/Mono.System.exe')))throw Error('Packaged Windows helper is outdated.');
  const config=yaml.load(await readFile(join(directory,'resources','app-update.yml'),'utf8'));
  if(config.provider!=='github'||config.owner!=='EmreeKucuk'||config.repo!=='mono')throw Error('Unexpected update feed.');
  return pkg;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const pkg=await verifyDesktop(process.argv[2]);
  console.log(`Verified MONO ${pkg.version}: packaged Island matches source, Windows helper and update feed are present.`);
}
