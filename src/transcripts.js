import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { assertPlainObject, expandUserPath, InputError, optionalBoolean } from './paths.js';

const VIBE_SCHEMA = 'vibe-video-analyzer/transcript';
const VIBE_SCHEMA_VERSION = 1;
const MAX_TRANSCRIPT_BYTES = 100 * 1024 * 1024;
const MAX_SEGMENTS = 100_000;
const MAX_WORDS = 1_000_000;

function finiteNumber(value, label, { minimum = 0 } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InputError(`${label} must be a finite number.`);
  }
  if (value < minimum) {
    throw new InputError(`${label} must be at least ${minimum}.`);
  }
  return value;
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InputError(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function normalizeWord(raw, segmentIndex, wordIndex, previousStart) {
  const word = assertPlainObject(raw, `segments[${segmentIndex}].words[${wordIndex}]`);
  const text = nonEmptyString(word.text, `segments[${segmentIndex}].words[${wordIndex}].text`);
  const startSeconds = finiteNumber(
    word.startSeconds,
    `segments[${segmentIndex}].words[${wordIndex}].startSeconds`
  );
  const endSeconds = finiteNumber(
    word.endSeconds,
    `segments[${segmentIndex}].words[${wordIndex}].endSeconds`
  );
  if (endSeconds <= startSeconds) {
    throw new InputError(
      `segments[${segmentIndex}].words[${wordIndex}].endSeconds must be greater than startSeconds.`
    );
  }
  if (startSeconds < previousStart) {
    throw new InputError(`segments[${segmentIndex}].words must be sorted by startSeconds.`);
  }
  const normalized = {
    text,
    startSeconds: round(startSeconds),
    endSeconds: round(endSeconds)
  };
  if (word.confidence !== undefined) {
    const confidence = finiteNumber(
      word.confidence,
      `segments[${segmentIndex}].words[${wordIndex}].confidence`
    );
    if (confidence > 1) {
      throw new InputError(
        `segments[${segmentIndex}].words[${wordIndex}].confidence must be between 0 and 1.`
      );
    }
    normalized.confidence = round(confidence);
  }
  return normalized;
}

function normalizeSegment(raw, index, previousStart, seenIds) {
  const segment = assertPlainObject(raw, `segments[${index}]`);
  const id = segment.id === undefined
    ? `segment-${index + 1}`
    : nonEmptyString(segment.id, `segments[${index}].id`);
  if (seenIds.has(id)) throw new InputError(`Duplicate segment id: ${id}.`);
  seenIds.add(id);

  const startSeconds = finiteNumber(segment.startSeconds, `segments[${index}].startSeconds`);
  const endSeconds = finiteNumber(segment.endSeconds, `segments[${index}].endSeconds`);
  if (endSeconds <= startSeconds) {
    throw new InputError(`segments[${index}].endSeconds must be greater than startSeconds.`);
  }
  if (startSeconds < previousStart) {
    throw new InputError('segments must be sorted by startSeconds.');
  }
  const text = nonEmptyString(segment.text, `segments[${index}].text`);
  const rawWords = segment.words ?? [];
  if (!Array.isArray(rawWords)) throw new InputError(`segments[${index}].words must be an array.`);

  const words = [];
  let previousWordStart = -Infinity;
  const timingWarnings = [];
  for (let wordIndex = 0; wordIndex < rawWords.length; wordIndex += 1) {
    const word = normalizeWord(rawWords[wordIndex], index, wordIndex, previousWordStart);
    previousWordStart = word.startSeconds;
    if (word.startSeconds < startSeconds - 0.25 || word.endSeconds > endSeconds + 0.25) {
      timingWarnings.push(
        `word ${wordIndex + 1} (${word.text}) extends outside segment ${id} by more than 0.25 seconds.`
      );
    }
    words.push(word);
  }

  return {
    id,
    startSeconds: round(startSeconds),
    endSeconds: round(endSeconds),
    durationSeconds: round(endSeconds - startSeconds),
    text,
    words,
    timingWarnings
  };
}

async function resolveMediaPath(documentMedia, args) {
  const mediaPath = args.mediaPath === undefined
    ? expandUserPath(nonEmptyString(documentMedia.path, 'media.path'), 'media.path')
    : expandUserPath(args.mediaPath, 'mediaPath');
  const allowMissingMedia = optionalBoolean(args.allowMissingMedia, 'allowMissingMedia', false);
  let mediaExists = false;
  try {
    const mediaStat = await stat(mediaPath);
    mediaExists = mediaStat.isFile();
    if (!mediaExists && !allowMissingMedia) {
      throw new InputError(`${mediaPath} is not a regular media file.`);
    }
  } catch (error) {
    if (error instanceof InputError) throw error;
    if (error?.code === 'ENOENT') {
      if (!allowMissingMedia) throw new InputError(`Media file does not exist: ${mediaPath}`);
    } else {
      throw error;
    }
  }
  return { mediaPath, mediaExists, allowMissingMedia };
}

export async function importVibeTranscript(args) {
  assertPlainObject(args);
  const inputPath = expandUserPath(args.path);
  if (extname(inputPath).toLowerCase() !== '.json') {
    throw new InputError('path must end in .json.');
  }
  const inputStat = await stat(inputPath);
  if (!inputStat.isFile()) throw new InputError(`${inputPath} is not a regular file.`);
  if (inputStat.size > MAX_TRANSCRIPT_BYTES) {
    throw new InputError(`${inputPath} exceeds the ${MAX_TRANSCRIPT_BYTES}-byte limit.`);
  }

  let document;
  try {
    document = JSON.parse(await readFile(inputPath, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) throw new InputError(`Invalid transcript JSON: ${error.message}`);
    throw error;
  }
  assertPlainObject(document, 'transcript document');
  if (document.schema !== VIBE_SCHEMA) {
    throw new InputError(`Unsupported transcript schema: ${JSON.stringify(document.schema)}.`);
  }
  if (document.schemaVersion !== VIBE_SCHEMA_VERSION) {
    throw new InputError(`Unsupported transcript schemaVersion: ${JSON.stringify(document.schemaVersion)}.`);
  }
  const media = assertPlainObject(document.media, 'media');
  const { mediaPath, mediaExists, allowMissingMedia } = await resolveMediaPath(media, args);
  const rawSegments = document.segments;
  if (!Array.isArray(rawSegments)) throw new InputError('segments must be an array.');
  if (rawSegments.length > MAX_SEGMENTS) {
    throw new InputError(`segments must contain no more than ${MAX_SEGMENTS} items.`);
  }

  const segments = [];
  const words = [];
  const candidateRanges = [];
  const editPlanSegments = [];
  const warnings = [];
  const missingWordSegmentIds = [];
  const seenIds = new Set();
  let previousStart = -Infinity;

  for (let index = 0; index < rawSegments.length; index += 1) {
    const segment = normalizeSegment(rawSegments[index], index, previousStart, seenIds);
    previousStart = segment.startSeconds;
    if (words.length + segment.words.length > MAX_WORDS) {
      throw new InputError(`Transcript exceeds the ${MAX_WORDS}-word limit.`);
    }
    warnings.push(...segment.timingWarnings);
    if (segment.words.length === 0) missingWordSegmentIds.push(segment.id);

    const normalizedSegment = {
      id: segment.id,
      startSeconds: segment.startSeconds,
      endSeconds: segment.endSeconds,
      durationSeconds: segment.durationSeconds,
      text: segment.text,
      words: segment.words
    };
    segments.push(normalizedSegment);
    for (const word of segment.words) {
      words.push({ ...word, segmentId: segment.id });
    }
    candidateRanges.push({
      id: segment.id,
      sourceId: mediaPath,
      startSeconds: segment.startSeconds,
      endSeconds: segment.endSeconds,
      text: segment.text
    });
    editPlanSegments.push({
      id: segment.id,
      path: mediaPath,
      name: basename(mediaPath),
      sourceStartSeconds: segment.startSeconds,
      durationSeconds: segment.durationSeconds,
      hasAudio: true,
      words: segment.words
    });
  }

  const declaredDuration = media.durationSeconds === undefined
    ? null
    : round(finiteNumber(media.durationSeconds, 'media.durationSeconds'));
  if (declaredDuration !== null && segments.length > 0) {
    const latestEnd = segments[segments.length - 1].endSeconds;
    if (latestEnd > declaredDuration + 0.25) {
      warnings.push(
        `Last transcript segment ends at ${latestEnd}s, after declared media duration ${declaredDuration}s.`
      );
    }
  }

  return {
    source: inputPath,
    schema: document.schema,
    schemaVersion: document.schemaVersion,
    createdAt: typeof document.createdAt === 'string' ? document.createdAt : null,
    media: {
      path: mediaPath,
      fileName: basename(mediaPath),
      durationSeconds: declaredDuration,
      exists: mediaExists,
      allowMissingMedia
    },
    engine: document.engine && typeof document.engine === 'object' && !Array.isArray(document.engine)
      ? document.engine
      : null,
    summary: {
      segmentCount: segments.length,
      wordCount: words.length,
      segmentsWithoutWords: missingWordSegmentIds.length
    },
    segments,
    words,
    candidateRanges,
    editPlanSegments,
    warnings,
    missingWordSegmentIds,
    nextSteps: [
      'Add explicit metrics to candidateRanges before calling highlight_rank.',
      'Pass selected editPlanSegments, in narrative order, to edit_plan_build.',
      'Pass edit_plan_build.timelineWords to subtitle_segment.'
    ]
  };
}

export const vibeTranscriptMetadata = Object.freeze({
  schema: VIBE_SCHEMA,
  schemaVersion: VIBE_SCHEMA_VERSION
});
