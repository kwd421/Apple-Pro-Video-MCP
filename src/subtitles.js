import { constants as fsConstants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { chmod, copyFile, link, mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname } from 'node:path';
import { assertPlainObject, expandUserPath, InputError, numberInRange, optionalBoolean } from './paths.js';

const SENTENCE_END = /[.!?…。！？]$/u;
const ATTACH_LEFT = /^[,.:;!?%\)\]\}…。！？、，。：；]+$/u;
const ATTACH_RIGHT = /^[\(\[\{“‘]+$/u;

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function normalizeToken(token) {
  return token.trim().toLocaleLowerCase();
}

function joinTokens(tokens) {
  let text = '';
  let previous = '';
  for (const token of tokens) {
    if (text === '') {
      text = token;
    } else if (ATTACH_LEFT.test(token) || ATTACH_RIGHT.test(previous)) {
      text += token;
    } else {
      text += ` ${token}`;
    }
    previous = token;
  }
  return text;
}

function splitLongToken(token, maxCharactersPerLine) {
  const pieces = [];
  for (let index = 0; index < token.length; index += maxCharactersPerLine) {
    pieces.push(token.slice(index, index + maxCharactersPerLine));
  }
  return pieces;
}

function splitIntoLines(text, maxCharactersPerLine, maxLines) {
  if (text.length <= maxCharactersPerLine) return [text];
  const rawWords = text.includes(' ') ? text.split(/\s+/u) : splitLongToken(text, maxCharactersPerLine);
  const words = rawWords.flatMap((word) => (
    word.length > maxCharactersPerLine ? splitLongToken(word, maxCharactersPerLine) : [word]
  ));

  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (candidate.length <= maxCharactersPerLine || current === '') {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current !== '') lines.push(current);

  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines - 1);
  kept.push(lines.slice(maxLines - 1).join(' '));
  return kept;
}

function normalizeWord(raw, index, previousStart) {
  const word = assertPlainObject(raw, `words[${index}]`);
  if (typeof word.text !== 'string' || word.text.trim() === '') {
    throw new InputError(`words[${index}].text must be a non-empty string.`);
  }
  const startSeconds = numberInRange(word.startSeconds, `words[${index}].startSeconds`, {
    min: 0,
    max: 24 * 60 * 60
  });
  const endSeconds = numberInRange(word.endSeconds, `words[${index}].endSeconds`, {
    min: Number.EPSILON,
    max: 24 * 60 * 60
  });
  if (endSeconds <= startSeconds) {
    throw new InputError(`words[${index}].endSeconds must be greater than startSeconds.`);
  }
  if (startSeconds < previousStart) {
    throw new InputError('words must be sorted by startSeconds.');
  }
  return {
    text: word.text.trim(),
    startSeconds,
    endSeconds,
    ...(word.confidence === undefined
      ? {}
      : { confidence: numberInRange(word.confidence, `words[${index}].confidence`, { min: 0, max: 1 }) })
  };
}

function normalizeCue(raw, index) {
  const cue = assertPlainObject(raw, `cues[${index}]`);
  const startSeconds = numberInRange(cue.startSeconds, `cues[${index}].startSeconds`, {
    min: 0,
    max: 24 * 60 * 60
  });
  const endSeconds = numberInRange(cue.endSeconds, `cues[${index}].endSeconds`, {
    min: Number.EPSILON,
    max: 24 * 60 * 60
  });
  if (endSeconds <= startSeconds) {
    throw new InputError(`cues[${index}].endSeconds must be greater than startSeconds.`);
  }
  const lines = Array.isArray(cue.lines)
    ? cue.lines.map((line, lineIndex) => {
        if (typeof line !== 'string' || line.trim() === '') {
          throw new InputError(`cues[${index}].lines[${lineIndex}] must be non-empty.`);
        }
        return line.trim();
      })
    : undefined;
  const text = typeof cue.text === 'string' && cue.text.trim() !== ''
    ? cue.text.trim()
    : lines?.join('\n');
  if (!text) throw new InputError(`cues[${index}] must contain text or lines.`);
  return {
    index: index + 1,
    startSeconds,
    endSeconds,
    text,
    lines: lines ?? text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
  };
}

function cueFromWords(words, options) {
  const tokens = words.map((word) => word.text);
  const text = joinTokens(tokens);
  const lines = splitIntoLines(text, options.maxCharactersPerLine, options.maxLines);
  const confidences = words.map((word) => word.confidence).filter((value) => value !== undefined);
  return {
    startSeconds: words[0].startSeconds,
    endSeconds: words[words.length - 1].endSeconds,
    text,
    lines,
    wordCount: words.length,
    ...(confidences.length === 0
      ? {}
      : { averageConfidence: round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length, 4) })
  };
}

function applyMinimumDurations(cues, minimumSeconds) {
  return cues.map((cue, index) => {
    const nextStart = cues[index + 1]?.startSeconds;
    const requestedEnd = cue.startSeconds + minimumSeconds;
    const maximumEnd = nextStart === undefined ? requestedEnd : Math.max(cue.endSeconds, nextStart - 0.01);
    const endSeconds = cue.endSeconds - cue.startSeconds >= minimumSeconds
      ? cue.endSeconds
      : Math.min(requestedEnd, maximumEnd);
    return { ...cue, endSeconds: Math.max(cue.endSeconds, endSeconds) };
  });
}

function formatSrtTimestamp(seconds) {
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const milliseconds = totalMilliseconds % 1000;
  const totalSeconds = Math.floor(totalMilliseconds / 1000);
  const second = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minute = totalMinutes % 60;
  const hour = Math.floor(totalMinutes / 60);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

export function renderSrt(cues) {
  if (!Array.isArray(cues) || cues.length === 0) {
    throw new InputError('cues must be a non-empty array.');
  }
  let previousStart = -Infinity;
  const normalized = cues.map((cue, index) => {
    const value = normalizeCue(cue, index);
    if (value.startSeconds < previousStart) throw new InputError('cues must be sorted by startSeconds.');
    previousStart = value.startSeconds;
    return value;
  });

  return `${normalized.map((cue, index) => [
    String(index + 1),
    `${formatSrtTimestamp(cue.startSeconds)} --> ${formatSrtTimestamp(cue.endSeconds)}`,
    ...cue.lines,
    ''
  ].join('\n')).join('\n')}\n`;
}

export function segmentSubtitles(args) {
  assertPlainObject(args);
  if (!Array.isArray(args.words) || args.words.length === 0) {
    throw new InputError('words must be a non-empty array.');
  }
  if (args.words.length > 100000) {
    throw new InputError('words must contain no more than 100000 items.');
  }

  const maxCharactersPerLine = args.maxCharactersPerLine === undefined
    ? 18
    : numberInRange(args.maxCharactersPerLine, 'maxCharactersPerLine', { min: 4, max: 80, integer: true });
  const maxLines = args.maxLines === undefined
    ? 2
    : numberInRange(args.maxLines, 'maxLines', { min: 1, max: 4, integer: true });
  const maxCueDurationSeconds = args.maxCueDurationSeconds === undefined
    ? 3.5
    : numberInRange(args.maxCueDurationSeconds, 'maxCueDurationSeconds', { min: 0.25, max: 15 });
  const minCueDurationSeconds = args.minCueDurationSeconds === undefined
    ? 0.7
    : numberInRange(args.minCueDurationSeconds, 'minCueDurationSeconds', { min: 0.1, max: 10 });
  if (minCueDurationSeconds > maxCueDurationSeconds) {
    throw new InputError('minCueDurationSeconds must not exceed maxCueDurationSeconds.');
  }
  const gapBreakSeconds = args.gapBreakSeconds === undefined
    ? 0.45
    : numberInRange(args.gapBreakSeconds, 'gapBreakSeconds', { min: 0, max: 5 });
  const maxWordsPerCue = args.maxWordsPerCue === undefined
    ? 10
    : numberInRange(args.maxWordsPerCue, 'maxWordsPerCue', { min: 1, max: 50, integer: true });
  const punctuationBreak = optionalBoolean(args.punctuationBreak, 'punctuationBreak', true);
  const omitTokens = args.omitTokens === undefined
    ? new Set()
    : (() => {
        if (!Array.isArray(args.omitTokens)) throw new InputError('omitTokens must be an array.');
        return new Set(args.omitTokens.map((token, index) => {
          if (typeof token !== 'string' || token.trim() === '') {
            throw new InputError(`omitTokens[${index}] must be a non-empty string.`);
          }
          return normalizeToken(token);
        }));
      })();

  const words = [];
  let previousStart = -Infinity;
  for (let index = 0; index < args.words.length; index += 1) {
    const word = normalizeWord(args.words[index], index, previousStart);
    previousStart = word.startSeconds;
    if (!omitTokens.has(normalizeToken(word.text))) words.push(word);
  }
  if (words.length === 0) throw new InputError('All words were removed by omitTokens.');

  const options = { maxCharactersPerLine, maxLines };
  const capacity = maxCharactersPerLine * maxLines;
  const groups = [];
  let current = [];

  const flush = () => {
    if (current.length > 0) groups.push(current);
    current = [];
  };

  for (const word of words) {
    if (current.length > 0) {
      const first = current[0];
      const previous = current[current.length - 1];
      const prospectiveText = joinTokens([...current.map((item) => item.text), word.text]);
      const prospectiveDuration = word.endSeconds - first.startSeconds;
      const gap = Math.max(0, word.startSeconds - previous.endSeconds);
      const shouldBreak = gap >= gapBreakSeconds
        || current.length >= maxWordsPerCue
        || prospectiveText.length > capacity
        || prospectiveDuration > maxCueDurationSeconds
        || (punctuationBreak && SENTENCE_END.test(previous.text));
      if (shouldBreak) flush();
    }
    current.push(word);
  }
  flush();

  const rawCues = groups.map((group) => cueFromWords(group, options));
  const cues = applyMinimumDurations(rawCues, minCueDurationSeconds).map((cue, index) => ({
    index: index + 1,
    startSeconds: round(cue.startSeconds, 3),
    endSeconds: round(cue.endSeconds, 3),
    durationSeconds: round(cue.endSeconds - cue.startSeconds, 3),
    text: cue.text,
    lines: cue.lines,
    wordCount: cue.wordCount,
    ...(cue.averageConfidence === undefined ? {} : { averageConfidence: cue.averageConfidence }),
    overflow: cue.lines.some((line) => line.length > maxCharactersPerLine)
  }));

  return {
    cueCount: cues.length,
    durationSeconds: round(cues[cues.length - 1].endSeconds - cues[0].startSeconds, 3),
    settings: {
      maxCharactersPerLine,
      maxLines,
      maxCueDurationSeconds,
      minCueDurationSeconds,
      gapBreakSeconds,
      maxWordsPerCue,
      punctuationBreak
    },
    cues,
    srt: renderSrt(cues),
    note: 'Segmentation uses caller-provided word timestamps. It does not transcribe audio by itself.'
  };
}

async function writeTextSafely(outputPath, contents, overwrite) {
  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, contents, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  try {
    if (overwrite) {
      await rename(temporaryPath, outputPath);
    } else {
      try {
        await link(temporaryPath, outputPath);
      } catch (error) {
        if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV'].includes(error?.code)) throw error;
        await copyFile(temporaryPath, outputPath, fsConstants.COPYFILE_EXCL);
      }
      await unlink(temporaryPath);
    }
    await chmod(outputPath, 0o644).catch(() => {});
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    if (error?.code === 'EEXIST') {
      throw new InputError(`Output already exists: ${outputPath}. Set overwrite to true to replace it.`);
    }
    throw error;
  }
}

export async function writeSubtitleSrt(args) {
  assertPlainObject(args);
  const outputPath = expandUserPath(args.outputPath, 'outputPath');
  if (extname(outputPath).toLowerCase() !== '.srt') {
    throw new InputError('outputPath must end in .srt.');
  }
  const overwrite = optionalBoolean(args.overwrite, 'overwrite', false);
  const srt = renderSrt(args.cues);
  await writeTextSafely(outputPath, srt, overwrite);
  return {
    path: outputPath,
    cueCount: args.cues.length,
    bytes: Buffer.byteLength(srt, 'utf8'),
    overwritten: overwrite
  };
}

export const subtitleInternals = {
  formatSrtTimestamp,
  joinTokens,
  splitIntoLines
};
