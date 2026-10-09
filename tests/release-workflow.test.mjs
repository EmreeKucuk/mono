import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
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
  assert.match(workflow.jobs.release.steps[0].with.ref,/release.tag_name/);
  const upload=workflow.jobs.release.steps.find(step=>step.name?.startsWith('Upload')).run;
  assert.ok(upload.indexOf('"$installer.blockmap"')<upload.indexOf("gh release upload $tag 'release/latest.yml'"));
  assert.match(upload,/assets.Count -gt 0/);assert.ok(!upload.includes('--clobber'));
});
