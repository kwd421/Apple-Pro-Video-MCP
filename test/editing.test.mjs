import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEditPlan, rankHighlights } from '../src/editing.js';

test('highlight ranking applies profile weights, penalties, overlap and duration budget', () => {
  const result = rankHighlights({
    profile: 'interview_short',
    targetDurationSeconds: 20,
    maxOverrunSeconds: 1,
    candidates: [
      {
        id: 'strong',
        sourceId: 'interview',
        startSeconds: 10,
        endSeconds: 20,
        text: 'Strong self-contained answer',
        metrics: { hook: 90, payoff: 95, clarity: 90, emotion: 70, novelty: 80, editability: 90, visual: 60 }
      },
      {
        id: 'overlap',
        sourceId: 'interview',
        startSeconds: 15,
        endSeconds: 25,
        text: 'Overlapping version',
        metrics: { hook: 95, payoff: 80, clarity: 80, emotion: 80, novelty: 70, editability: 70, visual: 60 },
        penalties: { repetition: 100 }
      },
      {
        id: 'support',
        sourceId: 'interview',
        startSeconds: 30,
        endSeconds: 39,
        text: 'Supporting conclusion',
        metrics: { hook: 70, payoff: 90, clarity: 95, emotion: 60, novelty: 75, editability: 95, visual: 50 }
      }
    ]
  });

  assert.equal(result.ranked[0].id, 'strong');
  assert.ok(result.ranked.find((candidate) => candidate.id === 'overlap').breakdown.penaltyDeduction > 0);
  assert.deepEqual(result.selection.candidates.map((candidate) => candidate.id), ['strong', 'support']);
  assert.equal(result.selection.durationSeconds, 19);
  assert.ok(result.selection.skipped.some((item) => item.id === 'overlap' && item.reason === 'source_overlap'));
});

test('edit plan retimes source words onto the assembled timeline', () => {
  const result = buildEditPlan({
    targetDurationSeconds: 8,
    segments: [
      {
        id: 'a',
        path: '/tmp/A.mov',
        sourceStartSeconds: 10,
        durationSeconds: 5,
        words: [
          { text: 'hello', startSeconds: 10.5, endSeconds: 11 },
          { text: 'outside', startSeconds: 20, endSeconds: 21 }
        ]
      },
      {
        id: 'b',
        path: '/tmp/B.mov',
        sourceStartSeconds: 3,
        durationSeconds: 3,
        words: [
          { text: 'world', startSeconds: 3.25, endSeconds: 4 }
        ]
      }
    ]
  });

  assert.equal(result.durationSeconds, 8);
  assert.equal(result.segments[1].timelineStartSeconds, 5);
  assert.deepEqual(result.fcpxmlClips, [
    { path: '/tmp/A.mov', name: 'A.mov', sourceStartSeconds: 10, durationSeconds: 5, hasAudio: true },
    { path: '/tmp/B.mov', name: 'B.mov', sourceStartSeconds: 3, durationSeconds: 3, hasAudio: true }
  ]);
  assert.deepEqual(result.timelineWords.map(({ text, startSeconds, endSeconds, segmentId }) => ({ text, startSeconds, endSeconds, segmentId })), [
    { text: 'hello', startSeconds: 0.5, endSeconds: 1, segmentId: 'a' },
    { text: 'world', startSeconds: 5.25, endSeconds: 6, segmentId: 'b' }
  ]);
  assert.deepEqual(result.warnings, []);
});
