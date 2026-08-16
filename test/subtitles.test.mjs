import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderSrt, segmentSubtitles, writeSubtitleSrt } from '../src/subtitles.js';

test('subtitle segmentation breaks on punctuation and pauses and produces SRT', () => {
  const result = segmentSubtitles({
    maxCharactersPerLine: 8,
    maxLines: 2,
    gapBreakSeconds: 0.4,
    words: [
      { text: '제가', startSeconds: 0, endSeconds: 0.3 },
      { text: '놀란', startSeconds: 0.31, endSeconds: 0.6 },
      { text: '건.', startSeconds: 0.61, endSeconds: 0.9 },
      { text: '돈이', startSeconds: 1.5, endSeconds: 1.8 },
      { text: '문제가', startSeconds: 1.81, endSeconds: 2.1 },
      { text: '아니었어요', startSeconds: 2.11, endSeconds: 2.7 }
    ]
  });

  assert.equal(result.cueCount, 2);
  assert.equal(result.cues[0].text, '제가 놀란 건.');
  assert.equal(result.cues[1].text, '돈이 문제가 아니었어요');
  assert.match(result.srt, /00:00:00,000 --> 00:00:00,900/);
  assert.match(result.srt, /돈이 문제가\n아니었어요/);
});

test('subtitle segmentation can omit filler tokens', () => {
  const result = segmentSubtitles({
    omitTokens: ['음', '어'],
    words: [
      { text: '음', startSeconds: 0, endSeconds: 0.2 },
      { text: '결론은', startSeconds: 0.21, endSeconds: 0.6 },
      { text: '간단합니다', startSeconds: 0.61, endSeconds: 1.1 }
    ]
  });
  assert.equal(result.cues[0].text, '결론은 간단합니다');
});

test('SRT writing preserves existing files unless overwrite is explicit', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'apple-pro-video-srt-'));
  const outputPath = join(directory, 'captions.srt');
  const cues = [{ startSeconds: 1.25, endSeconds: 2.5, lines: ['Hello', 'world'] }];
  try {
    const rendered = renderSrt(cues);
    assert.match(rendered, /00:00:01,250 --> 00:00:02,500/);
    await writeSubtitleSrt({ outputPath, cues });
    assert.equal(await readFile(outputPath, 'utf8'), rendered);
    await assert.rejects(() => writeSubtitleSrt({ outputPath, cues }), /Output already exists/);
    await writeFile(outputPath, 'old');
    await writeSubtitleSrt({ outputPath, cues, overwrite: true });
    assert.equal(await readFile(outputPath, 'utf8'), rendered);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
