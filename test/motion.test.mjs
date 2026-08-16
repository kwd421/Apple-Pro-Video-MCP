import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectMotionTemplate, listMotionTemplates } from '../src/motion.js';

test('lists and inspects Motion templates from a custom root', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'apple-pro-video-motion-'));
  const titleFolder = join(directory, 'Titles', 'Demo');
  const titlePath = join(titleFolder, 'Demo.moti');
  try {
    await mkdir(titleFolder, { recursive: true });
    await writeFile(titlePath, '<?xml version="1.0"?><ozml version="5.0"><project name="Demo"><publish name="Text" published="1"/></project></ozml>');
    await writeFile(join(titleFolder, 'ignore.txt'), 'ignore');
    const listing = await listMotionTemplates({ roots: [directory] });
    assert.equal(listing.count, 1);
    assert.equal(listing.templates[0].kind, 'title');
    const inspection = await inspectMotionTemplate({ path: titlePath });
    assert.equal(inspection.xml.root, 'ozml');
    assert.equal(inspection.publishedParameters.length, 1);
    assert.equal(inspection.publishedParameters[0].attributes.name, 'Text');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
