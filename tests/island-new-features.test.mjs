import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { writeFile, unlink, readFile } from 'node:fs/promises';
import { getAvailableFormats, convertFile } from '../desktop/island/converter.mjs';
import { workspaceSummary, islandBounds } from '../desktop/island/model.mjs';
import { startFocusWatcher } from '../desktop/island/focus.mjs';

test('converter exposes valid target formats for images, docs and sheets', () => {
  assert.deepEqual(getAvailableFormats('photo.png'), ['jpg', 'webp']);
  assert.deepEqual(getAvailableFormats('photo.jpg'), ['png', 'webp']);
  assert.deepEqual(getAvailableFormats('report.docx'), ['pdf', 'txt', 'md']);
  assert.deepEqual(getAvailableFormats('data.xlsx'), ['pdf', 'csv', 'json']);
  assert.deepEqual(getAvailableFormats('document.pdf'), ['txt', 'png']);
  assert.deepEqual(getAvailableFormats('unknown.xyz'), []);
});

test('workspaceSummary maps active widgets safely without sensitive block texts', () => {
  const summary = workspaceSummary({
    activeDeskId: 'desk-1',
    desks: [{ id: 'desk-1', name: 'Ana Masa' }],
    events: [{ id: 'e1', date: '2026-10-25', time: '14:00', text: 'Toplantı' }],
    widgets: [
      { id: 'w-note', type: 'note', title: 'Özel Not', text: 'Gizli Parola 12345' },
      { id: 'w-tasks', type: 'tasks', title: 'Görevler', tasks: [{ text: 'Görevi bitir' }] }
    ]
  });

  assert.equal(summary.desk, 'Ana Masa');
  assert.equal(summary.events.length, 1);
  assert.equal(summary.widgets.length, 2);
  assert.deepEqual(summary.widgets[0], { id: 'w-note', type: 'note', title: 'Özel Not' });
  assert.deepEqual(summary.widgets[1], { id: 'w-tasks', type: 'tasks', title: 'Görevler' });
  assert.ok(!JSON.stringify(summary).includes('Gizli Parola'));
});

test('islandBounds aligns to the top of the monitor bezel', () => {
  const bounds = islandBounds({ bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } });
  assert.equal(bounds.y, 0, 'Island sits directly flush at top y: 0');
  assert.equal(bounds.x, Math.round((1920 - 584) / 2));
  assert.equal(bounds.width, 584);
});

test('converter converts a test image buffer to PNG and JPG', async () => {
  // 1x1 transparent png base64
  const testPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const tempFile = resolve('.test-temp', `test-${Date.now()}.png`);
  await writeFile(tempFile, testPng);

  try {
    const resultJpg = await convertFile({ filePath: tempFile, targetFormat: 'jpg' });
    assert.ok(resultJpg.ok);
    assert.ok(resultJpg.outputPath.endsWith('.jpg'));
    const convertedBuf = await readFile(resultJpg.outputPath);
    assert.ok(convertedBuf.length > 0);
    await unlink(resultJpg.outputPath).catch(() => {});
  } finally {
    await unlink(tempFile).catch(() => {});
  }
});

test('converter converts image using dataUrl directly without external dependencies', async () => {
  const tempFile = resolve('.test-temp', `canvas-test-${Date.now()}.png`);
  await writeFile(tempFile, Buffer.from('dummy-content'));

  try {
    const fakeDataUrl = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';
    const resultWebp = await convertFile({ filePath: tempFile, targetFormat: 'webp', dataUrl: fakeDataUrl });
    assert.ok(resultWebp.ok);
    assert.ok(resultWebp.outputPath.endsWith('.webp'));
    const convertedBuf = await readFile(resultWebp.outputPath);
    assert.ok(convertedBuf.length > 0);
    await unlink(resultWebp.outputPath).catch(() => {});
  } finally {
    await unlink(tempFile).catch(() => {});
  }
});

test('startFocusWatcher initializes and stops cleanly in test mode', () => {
  const watcher = startFocusWatcher({ test: true, onFocusChange: () => {} });
  assert.ok(watcher);
  assert.equal(typeof watcher.stop, 'function');
  assert.doesNotThrow(() => watcher.stop());
});
