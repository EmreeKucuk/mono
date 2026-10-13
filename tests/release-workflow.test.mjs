import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {updateFailure} from '../desktop/updates.mjs';
const require=createRequire(import.meta.url),yaml=require('js-yaml');
test('update errors explain missing release metadata without leaking upstream credentials',()=>{
  assert.equal(updateFailure({code:'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND',message:'https://secret/token'}).errorCode,'missing-metadata');
  assert.equal(updateFailure({message:'404 latest.yml https://secret/token'}).errorCode,'missing-metadata');
  assert.equal(updateFailure({code:'ERR_UPDATER_CHECKSUM_MISMATCH'}).errorCode,'checksum');
  assert.equal(updateFailure({code:'ENOTFOUND'}).errorCode,'network');
  assert.ok(!JSON.stringify(updateFailure(Error('offline secret-token'))).includes('secret-token'));
});
test('release automation supports website publishing and manual repair of empty version tags',async()=>{
  const workflow=yaml.load(await readFile(new URL('../.github/workflows/release.yml',import.meta.url),'utf8'));
  assert.deepEqual(workflow.on.release.types,['published']);
  assert.equal(workflow.on.workflow_dispatch.inputs.tag.required,true);
  const checkout=workflow.jobs.release.steps.find(step=>step.uses==='actions/checkout@v4');
  assert.equal(checkout.with.ref,'refs/tags/${{ env.RELEASE_TAG }}');
  const upload=workflow.jobs.release.steps.find(step=>step.name?.startsWith('Upload')).run;
  assert.ok(upload.indexOf('"$installer.blockmap"')<upload.indexOf("gh release upload $tag 'release/latest.yml'"));
  assert.match(upload,/assets.Count -gt 0/);assert.ok(!upload.includes('--clobber'));
});

test('release tag validation runs before checkout and rejects release titles',{skip:process.platform!=='win32'},async()=>{
  const workflow=yaml.load(await readFile(new URL('../.github/workflows/release.yml',import.meta.url),'utf8'));
  const steps=workflow.jobs.release.steps,validation=steps.find(step=>step.name==='Validate release tag before checkout');
  assert.ok(steps.indexOf(validation)<steps.findIndex(step=>step.uses==='actions/checkout@v4'));
  for(const [tag,valid] of [['v1.4.1',true],['v0.0.0',true],['MONO v1.4.1',false],['',false],['v1.4.1\n',false],['v1.4.1-beta.1',false]]){
    const result=spawnSync('pwsh',['-NoProfile','-NonInteractive','-Command',validation.run],{env:{...process.env,RELEASE_TAG:tag},encoding:'utf8',windowsHide:true});
    assert.ifError(result.error);
    assert.equal(result.status===0,valid,`Tag ${JSON.stringify(tag)}: ${result.stderr}`);
    if(!valid)assert.match(result.stderr,/Enter an existing Git tag/);
  }
});

test('packaging passes a single never policy to the installed Electron Builder parser',async()=>{
  const workflow=yaml.load(await readFile(new URL('../.github/workflows/release.yml',import.meta.url),'utf8'));
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  const step=workflow.jobs.release.steps.find(step=>step.name==='Package without publishing');
  assert.equal(step.run,'npm run desktop:build');
  assert.ok(!step.env?.GH_TOKEN,'Packaging must not require a publication token');
  const {configureBuildCommand,createYargs,normalizeOptions}=require('electron-builder/out/builder');
  const args=pkg.scripts['desktop:build'].split(/\s+/).slice(1);
  const parsed=normalizeOptions(configureBuildCommand(createYargs()).parse(args));
  assert.equal(parsed.publish,'never','Duplicate CLI flags turn the policy into an array and enable publishing');
  // Reproduce the original failure with the real installed parser.
  const broken=normalizeOptions(configureBuildCommand(createYargs()).parse([...args,'--publish','never']));
  assert.deepEqual(broken.publish,['never','never']);
});
