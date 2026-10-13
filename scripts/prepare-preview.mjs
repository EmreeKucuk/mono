import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {verifyDesktop} from './verify-desktop.mjs';

const require=createRequire(import.meta.url),yaml=require('js-yaml');
const pkg=JSON.parse(await readFile('package.json','utf8'));
const directory='release/island-preview/win-unpacked';
// --dir skips Electron Builder's installer metadata step. Supply the same
// public update feed so opening the preview does not produce a missing-file error.
await writeFile(directory+'/resources/app-update.yml',yaml.dump({
  ...pkg.build.publish,updaterCacheDirName:pkg.name+'-updater'
}));
await verifyDesktop(directory);
console.log(`MONO ${pkg.version} preview verified: ${directory}/MONO.exe`);
