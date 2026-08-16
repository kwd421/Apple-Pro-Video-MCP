import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFcpxmlProject, fcpxmlInternals, inspectFcpxml, validateFcpxml } from '../src/fcpxml.js';

test('frame conversion is exact for 29.97 fps', () => {
  const rate = fcpxmlInternals.FRAME_RATES['29.97'];
  assert.equal(fcpxmlInternals.framesToTime(1, rate), '1001/30000s');
  assert.equal(fcpxmlInternals.framesToTime(300, rate), '1001/100s');
});

test('creates a project with frame-quantized clip offsets and preserves existing output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'apple-pro-video-'));
  const mediaA = join(directory, 'A.mov');
  const mediaB = join(directory, 'B.mov');
  const output = join(directory, 'project.fcpxml');
  try {
    await writeFile(mediaA, 'a');
    await writeFile(mediaB, 'b');
    const result = await createFcpxmlProject({
      outputPath: output,
      projectName: 'Interview',
      eventName: 'Generated',
      frameRate: '25',
      clips: [
        { path: mediaA, durationSeconds: 2 },
        { path: mediaB, sourceStartSeconds: 1, durationSeconds: 3 }
      ]
    });
    assert.equal(result.duration, '5s');
    const xml = await readFile(output, 'utf8');
    assert.match(xml, /offset="2s" name="B\.mov" start="1s" duration="3s"/);
    const validation = await validateFcpxml({ path: output });
    assert.equal(validation.valid, true, validation.errors.join('\n'));
    await assert.rejects(
      () => createFcpxmlProject({
        outputPath: output,
        projectName: 'Again',
        clips: [{ path: mediaA, durationSeconds: 1 }]
      }),
      /Output already exists/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('detects duplicate identifiers and unresolved references', async () => {
  const xml = '<?xml version="1.0"?><fcpxml version="1.11"><resources><format id="r1"/><asset id="r1"/></resources><library><event><project><sequence format="r9"><spine/></sequence></project></event></library></fcpxml>';
  const result = await validateFcpxml({ xml });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((message) => message.includes('Duplicate resource id r1')));
  assert.ok(result.errors.some((message) => message.includes('Unresolved format="r9"')));
});

test('reads an Info.fcpxml document from an .fcpxmld bundle', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'apple-pro-video-bundle-'));
  const bundle = join(directory, 'Demo.fcpxmld');
  try {
    await mkdir(bundle, { recursive: true });
    await writeFile(join(bundle, 'Info.fcpxml'), '<!DOCTYPE fcpxml><fcpxml version="1.11"><resources/><library><event name="E"><project name="P"><sequence duration="1s"><spine/></sequence></project></event></library></fcpxml>');
    const result = await inspectFcpxml({ path: bundle });
    assert.equal(result.names.events[0], 'E');
    assert.equal(result.names.projects[0], 'P');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
