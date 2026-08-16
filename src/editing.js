import { basename } from 'node:path';
import { assertPlainObject, expandUserPath, InputError, numberInRange, optionalBoolean } from './paths.js';

const METRIC_NAMES = Object.freeze([
  'hook',
  'payoff',
  'clarity',
  'emotion',
  'novelty',
  'editability',
  'visual'
]);

const PENALTY_CAPS = Object.freeze({
  contextDependency: 20,
  repetition: 15,
  disfluency: 15,
  noise: 15,
  longSetup: 10,
  weakEnding: 10
});

export const HIGHLIGHT_PROFILES = Object.freeze({
  interview_short: Object.freeze({
    hook: 0.25,
    payoff: 0.25,
    clarity: 0.15,
    emotion: 0.10,
    novelty: 0.10,
    editability: 0.10,
    visual: 0.05
  }),
  lecture: Object.freeze({
    hook: 0.10,
    payoff: 0.25,
    clarity: 0.25,
    emotion: 0.05,
    novelty: 0.15,
    editability: 0.15,
    visual: 0.05
  }),
  entertainment: Object.freeze({
    hook: 0.15,
    payoff: 0.20,
    clarity: 0.10,
    emotion: 0.25,
    novelty: 0.10,
    editability: 0.10,
    visual: 0.10
  }),
  vlog: Object.freeze({
    hook: 0.15,
    payoff: 0.15,
    clarity: 0.10,
    emotion: 0.20,
    novelty: 0.10,
    editability: 0.10,
    visual: 0.20
  }),
  product: Object.freeze({
    hook: 0.20,
    payoff: 0.20,
    clarity: 0.20,
    emotion: 0.05,
    novelty: 0.10,
    editability: 0.10,
    visual: 0.15
  })
});

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function normalizeMetricObject(value, names, label, defaultValue = undefined) {
  if (value === undefined && defaultValue !== undefined) {
    return Object.fromEntries(names.map((name) => [name, defaultValue]));
  }
  const object = assertPlainObject(value, label);
  const normalized = {};
  for (const name of names) {
    if (object[name] === undefined && defaultValue !== undefined) {
      normalized[name] = defaultValue;
      continue;
    }
    normalized[name] = numberInRange(object[name], `${label}.${name}`, { min: 0, max: 100 });
  }
  return normalized;
}

function intervalsOverlap(left, right) {
  return left.sourceId === right.sourceId
    && left.startSeconds < right.endSeconds
    && right.startSeconds < left.endSeconds;
}

function normalizeCandidate(raw, index, seenIds, profileWeights) {
  const candidate = assertPlainObject(raw, `candidates[${index}]`);
  const id = typeof candidate.id === 'string' && candidate.id.trim() !== ''
    ? candidate.id.trim()
    : `candidate-${index + 1}`;
  if (seenIds.has(id)) throw new InputError(`Duplicate candidate id: ${id}.`);
  seenIds.add(id);

  const sourceId = typeof candidate.sourceId === 'string' && candidate.sourceId.trim() !== ''
    ? candidate.sourceId.trim()
    : 'source-1';
  const startSeconds = numberInRange(candidate.startSeconds, `candidates[${index}].startSeconds`, {
    min: 0,
    max: 24 * 60 * 60
  });
  const endSeconds = numberInRange(candidate.endSeconds, `candidates[${index}].endSeconds`, {
    min: Number.EPSILON,
    max: 24 * 60 * 60
  });
  if (endSeconds <= startSeconds) {
    throw new InputError(`candidates[${index}].endSeconds must be greater than startSeconds.`);
  }
  if (typeof candidate.text !== 'string' || candidate.text.trim() === '') {
    throw new InputError(`candidates[${index}].text must be a non-empty string.`);
  }

  const metrics = normalizeMetricObject(candidate.metrics, METRIC_NAMES, `candidates[${index}].metrics`);
  const penalties = normalizeMetricObject(
    candidate.penalties,
    Object.keys(PENALTY_CAPS),
    `candidates[${index}].penalties`,
    0
  );

  const metricContributions = {};
  let weightedScore = 0;
  for (const name of METRIC_NAMES) {
    const contribution = metrics[name] * profileWeights[name];
    metricContributions[name] = round(contribution);
    weightedScore += contribution;
  }

  const penaltyContributions = {};
  let deduction = 0;
  for (const [name, cap] of Object.entries(PENALTY_CAPS)) {
    const contribution = (penalties[name] / 100) * cap;
    penaltyContributions[name] = round(contribution);
    deduction += contribution;
  }

  const score = round(Math.max(0, Math.min(100, weightedScore - deduction)), 2);
  return {
    id,
    sourceId,
    startSeconds: round(startSeconds, 6),
    endSeconds: round(endSeconds, 6),
    durationSeconds: round(endSeconds - startSeconds, 6),
    text: candidate.text.trim(),
    metrics,
    penalties,
    score,
    breakdown: {
      weightedMetrics: round(weightedScore, 2),
      penaltyDeduction: round(deduction, 2),
      metricContributions,
      penaltyContributions
    }
  };
}

export function rankHighlights(args) {
  assertPlainObject(args);
  const profile = args.profile ?? 'interview_short';
  const profileWeights = HIGHLIGHT_PROFILES[profile];
  if (!profileWeights) {
    throw new InputError(`profile must be one of: ${Object.keys(HIGHLIGHT_PROFILES).join(', ')}.`);
  }
  if (!Array.isArray(args.candidates) || args.candidates.length === 0) {
    throw new InputError('candidates must be a non-empty array.');
  }
  if (args.candidates.length > 500) {
    throw new InputError('candidates must contain no more than 500 items.');
  }

  const targetDurationSeconds = args.targetDurationSeconds === undefined
    ? 60
    : numberInRange(args.targetDurationSeconds, 'targetDurationSeconds', { min: 1, max: 24 * 60 * 60 });
  const maxSelected = args.maxSelected === undefined
    ? 20
    : numberInRange(args.maxSelected, 'maxSelected', { min: 1, max: 100, integer: true });
  const maxOverrunSeconds = args.maxOverrunSeconds === undefined
    ? 3
    : numberInRange(args.maxOverrunSeconds, 'maxOverrunSeconds', { min: 0, max: 60 });
  const allowOverlaps = optionalBoolean(args.allowOverlaps, 'allowOverlaps', false);

  const seenIds = new Set();
  const ranked = args.candidates
    .map((candidate, index) => normalizeCandidate(candidate, index, seenIds, profileWeights))
    .sort((left, right) => (
      right.score - left.score
      || right.metrics.payoff - left.metrics.payoff
      || right.metrics.hook - left.metrics.hook
      || left.durationSeconds - right.durationSeconds
      || left.id.localeCompare(right.id)
    ))
    .map((candidate, index) => ({ rank: index + 1, ...candidate }));

  const selected = [];
  const skipped = [];
  let selectedDurationSeconds = 0;
  for (const candidate of ranked) {
    if (selected.length >= maxSelected) {
      skipped.push({ id: candidate.id, reason: 'max_selected' });
      continue;
    }
    if (!allowOverlaps && selected.some((existing) => intervalsOverlap(existing, candidate))) {
      skipped.push({ id: candidate.id, reason: 'source_overlap' });
      continue;
    }
    const nextDuration = selectedDurationSeconds + candidate.durationSeconds;
    if (selected.length > 0 && nextDuration > targetDurationSeconds + maxOverrunSeconds) {
      skipped.push({ id: candidate.id, reason: 'duration_budget' });
      continue;
    }
    selected.push(candidate);
    selectedDurationSeconds = nextDuration;
    if (selectedDurationSeconds >= targetDurationSeconds) break;
  }

  if (selected.length === 0 && ranked.length > 0) {
    selected.push(ranked[0]);
    selectedDurationSeconds = ranked[0].durationSeconds;
  }

  return {
    profile,
    weights: profileWeights,
    penaltyCaps: PENALTY_CAPS,
    targetDurationSeconds,
    ranked,
    selection: {
      candidates: selected,
      durationSeconds: round(selectedDurationSeconds, 3),
      remainingSeconds: round(targetDurationSeconds - selectedDurationSeconds, 3),
      withinBudget: selectedDurationSeconds <= targetDurationSeconds + maxOverrunSeconds,
      skipped
    },
    note: 'Scores are deterministic combinations of caller-supplied assessments. This tool does not watch or understand video by itself.'
  };
}

function normalizeWord(raw, segmentIndex, wordIndex, previousStart) {
  const word = assertPlainObject(raw, `segments[${segmentIndex}].words[${wordIndex}]`);
  if (typeof word.text !== 'string' || word.text.trim() === '') {
    throw new InputError(`segments[${segmentIndex}].words[${wordIndex}].text must be non-empty.`);
  }
  const startSeconds = numberInRange(
    word.startSeconds,
    `segments[${segmentIndex}].words[${wordIndex}].startSeconds`,
    { min: 0, max: 24 * 60 * 60 }
  );
  const endSeconds = numberInRange(
    word.endSeconds,
    `segments[${segmentIndex}].words[${wordIndex}].endSeconds`,
    { min: Number.EPSILON, max: 24 * 60 * 60 }
  );
  if (endSeconds <= startSeconds) {
    throw new InputError(`segments[${segmentIndex}].words[${wordIndex}].endSeconds must be greater than startSeconds.`);
  }
  if (startSeconds < previousStart) {
    throw new InputError(`segments[${segmentIndex}].words must be sorted by startSeconds.`);
  }
  return {
    text: word.text.trim(),
    startSeconds,
    endSeconds,
    confidence: word.confidence === undefined
      ? undefined
      : numberInRange(word.confidence, `segments[${segmentIndex}].words[${wordIndex}].confidence`, { min: 0, max: 1 })
  };
}

export function buildEditPlan(args) {
  assertPlainObject(args);
  if (!Array.isArray(args.segments) || args.segments.length === 0) {
    throw new InputError('segments must be a non-empty array.');
  }
  if (args.segments.length > 500) {
    throw new InputError('segments must contain no more than 500 items.');
  }

  const targetDurationSeconds = args.targetDurationSeconds === undefined
    ? undefined
    : numberInRange(args.targetDurationSeconds, 'targetDurationSeconds', { min: 1, max: 24 * 60 * 60 });
  const seenIds = new Set();
  const segments = [];
  const timelineWords = [];
  let timelineCursor = 0;

  for (let index = 0; index < args.segments.length; index += 1) {
    const raw = assertPlainObject(args.segments[index], `segments[${index}]`);
    const id = typeof raw.id === 'string' && raw.id.trim() !== '' ? raw.id.trim() : `segment-${index + 1}`;
    if (seenIds.has(id)) throw new InputError(`Duplicate segment id: ${id}.`);
    seenIds.add(id);

    const path = expandUserPath(raw.path, `segments[${index}].path`);
    const sourceStartSeconds = raw.sourceStartSeconds === undefined
      ? 0
      : numberInRange(raw.sourceStartSeconds, `segments[${index}].sourceStartSeconds`, {
          min: 0,
          max: 24 * 60 * 60
        });
    const durationSeconds = numberInRange(raw.durationSeconds, `segments[${index}].durationSeconds`, {
      min: Number.EPSILON,
      max: 24 * 60 * 60
    });
    const sourceEndSeconds = sourceStartSeconds + durationSeconds;
    const timelineStartSeconds = timelineCursor;
    const timelineEndSeconds = timelineStartSeconds + durationSeconds;
    const name = typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name.trim() : basename(path);
    const hasAudio = optionalBoolean(raw.hasAudio, `segments[${index}].hasAudio`, true);

    const mappedWords = [];
    if (raw.words !== undefined) {
      if (!Array.isArray(raw.words)) throw new InputError(`segments[${index}].words must be an array.`);
      let previousStart = -Infinity;
      for (let wordIndex = 0; wordIndex < raw.words.length; wordIndex += 1) {
        const word = normalizeWord(raw.words[wordIndex], index, wordIndex, previousStart);
        previousStart = word.startSeconds;
        const clippedStart = Math.max(word.startSeconds, sourceStartSeconds);
        const clippedEnd = Math.min(word.endSeconds, sourceEndSeconds);
        if (clippedEnd <= clippedStart) continue;
        const mapped = {
          text: word.text,
          startSeconds: round(timelineStartSeconds + clippedStart - sourceStartSeconds, 6),
          endSeconds: round(timelineStartSeconds + clippedEnd - sourceStartSeconds, 6),
          sourceStartSeconds: round(clippedStart, 6),
          sourceEndSeconds: round(clippedEnd, 6),
          segmentId: id,
          ...(word.confidence === undefined ? {} : { confidence: word.confidence })
        };
        mappedWords.push(mapped);
        timelineWords.push(mapped);
      }
    }

    const score = raw.score === undefined
      ? undefined
      : numberInRange(raw.score, `segments[${index}].score`, { min: 0, max: 100 });
    segments.push({
      id,
      path,
      name,
      sourceStartSeconds: round(sourceStartSeconds, 6),
      sourceEndSeconds: round(sourceEndSeconds, 6),
      durationSeconds: round(durationSeconds, 6),
      timelineStartSeconds: round(timelineStartSeconds, 6),
      timelineEndSeconds: round(timelineEndSeconds, 6),
      hasAudio,
      ...(typeof raw.rationale === 'string' && raw.rationale.trim() !== '' ? { rationale: raw.rationale.trim() } : {}),
      ...(score === undefined ? {} : { score }),
      words: mappedWords,
      fcpxmlClip: {
        path,
        name,
        sourceStartSeconds: round(sourceStartSeconds, 6),
        durationSeconds: round(durationSeconds, 6),
        hasAudio
      }
    });
    timelineCursor = timelineEndSeconds;
  }

  const durationSeconds = round(timelineCursor, 6);
  const warnings = [];
  if (targetDurationSeconds !== undefined) {
    const difference = durationSeconds - targetDurationSeconds;
    if (Math.abs(difference) > 0.25) {
      warnings.push(
        difference > 0
          ? `Plan exceeds target duration by ${round(difference, 3)} seconds.`
          : `Plan is ${round(-difference, 3)} seconds shorter than target.`
      );
    }
  }

  return {
    durationSeconds,
    targetDurationSeconds: targetDurationSeconds ?? null,
    segments,
    fcpxmlClips: segments.map((segment) => segment.fcpxmlClip),
    timelineWords,
    warnings,
    note: 'This tool builds and retimes an edit decision plan. It does not modify a Final Cut Pro project by itself.'
  };
}
