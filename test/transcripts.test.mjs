import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importVibeTranscript } from '../src/transcripts.js';

function documentFor(mediaPath) {
  return {
    schema: 'vibe-video-analyzer/transcript',
    schemaVersion: 1,
    createdAt: '2026-08-16T00:00:00Z',
    media: {
      path: mediaPath,
      fileName: 'interview.mov',
      durationSeconds: 20
    },
    engine: {
      application: 'VibeCoding_VideoAnalyzer',
      modelId: 'large-v3-turbo',
      language: 'ko'
    },
    segments: [
      {
        id: 'segment-1',
        startSeconds: 1,
        endSeconds: 3,
        durationSeconds: 2,
        text: '첫 번째 문장',
        words: [
          { text: '첫', startSeconds: 1, endSeconds: 1.4 },
          { text: '번째', startSeconds: 1.41, endSeconds: 2 },
          { text: '문장', startSeconds: 2.01, endSeconds: 3 }
        ]
      },
      {
        id: 'segment-2',
        startSeconds: 5,
        endSeconds: 7,
        durationSeconds: 2,
        text: '두 번째 문장',
        words: []
      }
    ],
    summary: { segmentCount: 2, wordCount: 3 }
  };
}

test('imports Vibe transcript into candidate and edit-plan shapes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'apple-pro-video-vibe-'));
  const mediaPath = join(directory, 'interview.mov');
  const transcriptPath = join(directory, 'interview.vibe-transcript.json');
  try {
    await writeFile(mediaPath, 'media');
    await writeFile(transcriptPath, JSON.stringify(documentFor(mediaPath)));
    const result = await importVibeTranscript({ path: transcriptPath });

    assert.equal(result.schemaVersion, 1);
    assert.deepEqual(result.summary, {
      segmentCount: 2,
      wordCount: 3,
      segmentsWithoutWords: 1
    });
    assert.deepEqual(result.candidateRanges[0], {
      id: 'segment-1',
      sourceId: mediaPath,
      startSeconds: 1,
      endSeconds: 3,
      text: '첫 번째 문장'
    });
    assert.deepEqual(result.editPlanSegments[0], {
      id: 'segment-1',
      path: mediaPath,
      name: 'interview.mov',
      sourceStartSeconds: 1,
      durationSeconds: 2,
      hasAudio: true,
      words: [
        { text: '첫', startSeconds: 1, endSeconds: 1.4 },
        { text: '번째', startSeconds: 1.41, endSeconds: 2 },
        { text: '문장', startSeconds: 2.01, endSeconds: 3 }
      ]
    });
    assert.equal(result.words[2].segmentId, 'segment-1');
    assert.deepEqual(result.missingWordSegmentIds, ['segment-2']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('supports a media-path override for transcripts moved between machines', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'apple-pro-video-vibe-override-'));
  const localMediaPath = join(directory, 'local.mov');
  const transcriptPath = join(directory, 'moved.json');
  try {
    await writeFile(localMediaPath, 'media');
    await writeFile(transcriptPath, JSON.stringify(documentFor('/Users/other/interview.mov')));
    const result = await importVibeTranscript({
      path: transcriptPath,
      mediaPath: localMediaPath
    });
    assert.equal(result.media.path, localMediaPath);
    assert.equal(result.media.exists, true);
    assert.equal(result.editPlanSegments[1].path, localMediaPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects unsupported schemas and missing media by default', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'apple-pro-video-vibe-invalid-'));
  const transcriptPath = join(directory, 'invalid.json');
  try {
    const document = documentFor(join(directory, 'missing.mov'));
    document.schemaVersion = 2;
    await writeFile(transcriptPath, JSON.stringify(document));
    await assert.rejects(() => importVibeTranscript({ path: transcriptPath }), /schemaVersion/);

    document.schemaVersion = 1;
    await writeFile(transcriptPath, JSON.stringify(document));
    await assert.rejects(() => importVibeTranscript({ path: transcriptPath }), /does not exist/);
    const result = await importVibeTranscript({ path: transcriptPath, allowMissingMedia: true });
    assert.equal(result.media.exists, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
