import { constants as fsConstants } from 'node:fs';
import { access, chmod, copyFile, link, mkdir, readFile, readdir, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertPlainObject, expandUserPath, InputError, numberInRange, optionalBoolean } from './paths.js';
import { escapeXmlAttribute, parseXml, walkXml, XmlParseError } from './xml.js';

const MAX_XML_BYTES = 10 * 1024 * 1024;
const MAX_CLIPS = 500;
const REFERENCE_ATTRIBUTES = new Set(['ref', 'format', 'effect']);
const TIME_ATTRIBUTES = new Set(['start', 'duration', 'offset', 'tcStart']);

const FRAME_RATES = Object.freeze({
  '23.976': { numerator: 1001n, denominator: 24000n, tcFormat: 'NDF' },
  '24': { numerator: 1n, denominator: 24n, tcFormat: 'NDF' },
  '25': { numerator: 1n, denominator: 25n, tcFormat: 'NDF' },
  '29.97': { numerator: 1001n, denominator: 30000n, tcFormat: 'NDF' },
  '30': { numerator: 1n, denominator: 30n, tcFormat: 'NDF' },
  '50': { numerator: 1n, denominator: 50n, tcFormat: 'NDF' },
  '59.94': { numerator: 1001n, denominator: 60000n, tcFormat: 'NDF' },
  '60': { numerator: 1n, denominator: 60n, tcFormat: 'NDF' }
});

function countElements(root) {
  const counts = {};
  walkXml(root, (node) => {
    counts[node.name] = (counts[node.name] ?? 0) + 1;
  });
  return counts;
}

function collectNames(root, elementName, limit = 100) {
  const values = [];
  walkXml(root, (node) => {
    if (node.name === elementName && values.length < limit) {
      const value = node.attributes.name;
      if (typeof value === 'string' && value !== '') values.push(value);
    }
  });
  return values;
}

function parseTimeValue(value) {
  if (typeof value !== 'string') return false;
  if (/^-?\d+s$/.test(value)) return true;
  if (/^-?\d+\/\d+s$/.test(value)) {
    const denominator = BigInt(value.slice(value.indexOf('/') + 1, -1));
    return denominator !== 0n;
  }
  if (/^-?(?:\d+\.\d+|\d+)s$/.test(value)) return true;
  return false;
}

function inspectReferences(root) {
  const ids = new Map();
  const duplicateIds = [];
  const references = [];

  walkXml(root, (node, path) => {
    const id = node.attributes.id;
    if (id) {
      if (ids.has(id)) duplicateIds.push({ id, first: ids.get(id), duplicate: path });
      else ids.set(id, path);
    }
    for (const [attribute, value] of Object.entries(node.attributes)) {
      if (REFERENCE_ATTRIBUTES.has(attribute) && value) {
        references.push({ attribute, value, path });
      }
    }
  });

  const unresolved = references.filter(({ value }) => !ids.has(value));
  return { ids, duplicateIds, unresolved };
}

function validateParsed(document) {
  const errors = [];
  const warnings = [];
  const { root, doctype } = document;

  if (root.name !== 'fcpxml') {
    errors.push(`Root element must be <fcpxml>, found <${root.name}>.`);
  }

  const version = root.attributes.version;
  if (!version) warnings.push('The <fcpxml> element has no version attribute.');
  else if (!/^1\.\d+$/.test(version)) warnings.push(`Unrecognized FCPXML version format: ${version}.`);

  if (doctype !== undefined && doctype.toLowerCase() !== 'fcpxml') {
    warnings.push(`DOCTYPE is ${doctype}; Final Cut exports normally use <!DOCTYPE fcpxml>.`);
  }

  const { duplicateIds, unresolved } = inspectReferences(root);
  for (const duplicate of duplicateIds) {
    errors.push(`Duplicate resource id ${duplicate.id} at ${duplicate.duplicate}; first seen at ${duplicate.first}.`);
  }
  for (const reference of unresolved) {
    errors.push(`Unresolved ${reference.attribute}="${reference.value}" at ${reference.path}.`);
  }

  walkXml(root, (node, path) => {
    for (const [attribute, value] of Object.entries(node.attributes)) {
      if (TIME_ATTRIBUTES.has(attribute) && !parseTimeValue(value)) {
        errors.push(`Invalid FCP time ${attribute}="${value}" at ${path}.`);
      }
    }
    if (node.attributes.duration === '0s' || node.attributes.duration === '0/1s') {
      warnings.push(`Zero duration at ${path}.`);
    }
  });

  const counts = countElements(root);
  if (!counts.project) warnings.push('No <project> element was found.');
  if (!counts.sequence) warnings.push('No <sequence> element was found.');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      version: version ?? null,
      doctype: doctype ?? null,
      resources: {
        format: counts.format ?? 0,
        asset: counts.asset ?? 0,
        media: counts.media ?? 0,
        effect: counts.effect ?? 0
      },
      projects: counts.project ?? 0,
      sequences: counts.sequence ?? 0,
      elements: Object.values(counts).reduce((sum, count) => sum + count, 0)
    }
  };
}

async function findFcpxmlInBundle(bundlePath) {
  const preferred = join(bundlePath, 'Info.fcpxml');
  try {
    const preferredStat = await stat(preferred);
    if (preferredStat.isFile()) return realpath(preferred);
  } catch {
    // Fall through to a bounded search for bundle variants.
  }

  const queue = [{ directory: bundlePath, depth: 0 }];
  while (queue.length > 0) {
    const { directory, depth } = queue.shift();
    if (depth > 4) continue;
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const child = join(directory, entry.name);
      if (entry.isFile() && extname(entry.name).toLowerCase() === '.fcpxml') {
        return realpath(child);
      }
      if (entry.isDirectory()) queue.push({ directory: child, depth: depth + 1 });
    }
  }
  throw new InputError(`No .fcpxml document was found inside bundle: ${bundlePath}`);
}

async function resolveXmlDocumentPath(path) {
  const fileStat = await stat(path);
  if (fileStat.isDirectory()) {
    if (extname(path).toLowerCase() !== '.fcpxmld') {
      throw new InputError(`${path} is a directory; only .fcpxmld bundles are supported.`);
    }
    return findFcpxmlInBundle(path);
  }
  if (!fileStat.isFile()) throw new InputError(`${path} is not a regular file.`);
  if (extname(path).toLowerCase() !== '.fcpxml') {
    throw new InputError('path must end in .fcpxml or .fcpxmld.');
  }
  return realpath(path);
}

async function readLimitedTextFile(path, maxBytes = MAX_XML_BYTES) {
  const documentPath = await resolveXmlDocumentPath(path);
  const fileStat = await stat(documentPath);
  if (fileStat.size > maxBytes) throw new InputError(`${documentPath} exceeds the ${maxBytes}-byte limit.`);
  return { xml: await readFile(documentPath, 'utf8'), documentPath };
}

export async function loadXmlInput(args) {
  assertPlainObject(args);
  const hasXml = typeof args.xml === 'string';
  const hasPath = typeof args.path === 'string';
  if (hasXml === hasPath) {
    throw new InputError('Provide exactly one of path or xml.');
  }

  if (hasXml) {
    if (Buffer.byteLength(args.xml, 'utf8') > MAX_XML_BYTES) {
      throw new InputError(`xml exceeds the ${MAX_XML_BYTES}-byte limit.`);
    }
    return { xml: args.xml, source: 'inline' };
  }

  const path = expandUserPath(args.path);
  const loaded = await readLimitedTextFile(path);
  return { xml: loaded.xml, source: path, documentPath: loaded.documentPath };
}

export async function validateFcpxml(args) {
  const { xml, source } = await loadXmlInput(args);
  try {
    const document = parseXml(xml, { maxBytes: MAX_XML_BYTES });
    return { source, ...validateParsed(document) };
  } catch (error) {
    if (error instanceof XmlParseError) {
      return {
        source,
        valid: false,
        errors: [error.message],
        warnings: [],
        summary: null
      };
    }
    throw error;
  }
}

export async function inspectFcpxml(args) {
  const { xml, source } = await loadXmlInput(args);
  const document = parseXml(xml, { maxBytes: MAX_XML_BYTES });
  const validation = validateParsed(document);
  const counts = countElements(document.root);

  const selectedCounts = {};
  for (const name of [
    'library', 'event', 'project', 'sequence', 'spine', 'asset-clip', 'clip',
    'ref-clip', 'sync-clip', 'mc-clip', 'gap', 'title', 'transition', 'video',
    'audio', 'caption', 'marker', 'chapter-marker', 'keyword', 'rating', 'audition'
  ]) {
    selectedCounts[name] = counts[name] ?? 0;
  }

  const sequenceDurations = [];
  walkXml(document.root, (node) => {
    if (node.name === 'sequence' && node.attributes.duration) {
      sequenceDurations.push(node.attributes.duration);
    }
  });

  return {
    source,
    valid: validation.valid,
    version: document.root.attributes.version ?? null,
    errors: validation.errors,
    warnings: validation.warnings,
    names: {
      libraries: collectNames(document.root, 'library'),
      events: collectNames(document.root, 'event'),
      projects: collectNames(document.root, 'project'),
      clips: [
        ...collectNames(document.root, 'asset-clip'),
        ...collectNames(document.root, 'clip'),
        ...collectNames(document.root, 'ref-clip')
      ].slice(0, 100)
    },
    counts: selectedCounts,
    resources: validation.summary?.resources ?? null,
    sequenceDurations
  };
}

function greatestCommonDivisor(a, b) {
  let left = a < 0n ? -a : a;
  let right = b < 0n ? -b : b;
  while (right !== 0n) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }
  return left;
}

function rationalTime(numerator, denominator) {
  if (numerator === 0n) return '0s';
  const divisor = greatestCommonDivisor(numerator, denominator);
  const reducedNumerator = numerator / divisor;
  const reducedDenominator = denominator / divisor;
  if (reducedDenominator === 1n) return `${reducedNumerator}s`;
  return `${reducedNumerator}/${reducedDenominator}s`;
}

function framesToTime(frames, rate) {
  return rationalTime(BigInt(frames) * rate.numerator, rate.denominator);
}

function secondsToFrames(seconds, rate, label, allowZero = false) {
  numberInRange(seconds, label, { min: allowZero ? 0 : Number.EPSILON, max: 24 * 60 * 60 });
  const frames = Math.round(seconds * Number(rate.denominator) / Number(rate.numerator));
  if (!allowZero && frames < 1) throw new InputError(`${label} must be at least one frame.`);
  return frames;
}

function formatName(width, height, frameRate) {
  const scan = height >= 720 ? 'p' : '';
  return `FFVideoFormat${height}${scan}${frameRate.replace('.', '')}`;
}

async function assertMediaPath(path, allowMissingMedia) {
  if (allowMissingMedia) return;
  try {
    const mediaStat = await stat(path);
    if (!mediaStat.isFile()) throw new InputError(`${path} is not a regular media file.`);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new InputError(`Media file does not exist: ${path}`);
    throw error;
  }
}

function createFcpxmlString({ projectName, eventName, frameRate, width, height, clips }) {
  const rate = FRAME_RATES[frameRate];
  const totalFrames = clips.reduce((sum, clip) => sum + clip.durationFrames, 0);
  const resourceLines = clips.map((clip, index) => {
    const assetId = `r${index + 2}`;
    const assetDuration = framesToTime(clip.startFrames + clip.durationFrames, rate);
    return [
      `    <asset id="${assetId}" name="${escapeXmlAttribute(clip.name)}" start="0s" duration="${assetDuration}" hasVideo="1" hasAudio="${clip.hasAudio ? '1' : '0'}" format="r1">`,
      `      <media-rep kind="original-media" src="${escapeXmlAttribute(pathToFileURL(clip.path).href)}"/>`,
      '    </asset>'
    ].join('\n');
  });

  let offsetFrames = 0;
  const clipLines = clips.map((clip, index) => {
    const line = `          <asset-clip ref="r${index + 2}" offset="${framesToTime(offsetFrames, rate)}" name="${escapeXmlAttribute(clip.name)}" start="${framesToTime(clip.startFrames, rate)}" duration="${framesToTime(clip.durationFrames, rate)}"/>`;
    offsetFrames += clip.durationFrames;
    return line;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE fcpxml>',
    '<fcpxml version="1.11">',
    '  <resources>',
    `    <format id="r1" name="${formatName(width, height, frameRate)}" frameDuration="${framesToTime(1, rate)}" width="${width}" height="${height}" colorSpace="1-1-1 (Rec. 709)"/>`,
    ...resourceLines,
    '  </resources>',
    '  <library>',
    `    <event name="${escapeXmlAttribute(eventName)}">`,
    `      <project name="${escapeXmlAttribute(projectName)}">`,
    `        <sequence format="r1" duration="${framesToTime(totalFrames, rate)}" tcStart="0s" tcFormat="${rate.tcFormat}" audioLayout="stereo" audioRate="48k">`,
    '          <spine>',
    ...clipLines,
    '          </spine>',
    '        </sequence>',
    '      </project>',
    '    </event>',
    '  </library>',
    '</fcpxml>',
    ''
  ].join('\n');
}

async function writeFileSafely(outputPath, contents, overwrite) {
  const parent = dirname(outputPath);
  await mkdir(parent, { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, contents, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  try {
    if (overwrite) {
      await rename(temporaryPath, outputPath);
    } else {
      try {
        await link(temporaryPath, outputPath);
      } catch (linkError) {
        if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV'].includes(linkError?.code)) throw linkError;
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

export async function createFcpxmlProject(args) {
  assertPlainObject(args);
  const outputPath = expandUserPath(args.outputPath, 'outputPath');
  if (extname(outputPath).toLowerCase() !== '.fcpxml') {
    throw new InputError('outputPath must end in .fcpxml.');
  }
  if (typeof args.projectName !== 'string' || args.projectName.trim() === '') {
    throw new InputError('projectName must be a non-empty string.');
  }
  const projectName = args.projectName.trim();
  const eventName = typeof args.eventName === 'string' && args.eventName.trim() !== ''
    ? args.eventName.trim()
    : 'Generated by Apple Pro Video MCP';
  const frameRate = args.frameRate ?? '29.97';
  if (!Object.hasOwn(FRAME_RATES, frameRate)) {
    throw new InputError(`frameRate must be one of: ${Object.keys(FRAME_RATES).join(', ')}.`);
  }
  const width = args.width === undefined ? 1920 : numberInRange(args.width, 'width', { min: 16, max: 16384, integer: true });
  const height = args.height === undefined ? 1080 : numberInRange(args.height, 'height', { min: 16, max: 16384, integer: true });
  const overwrite = optionalBoolean(args.overwrite, 'overwrite', false);
  const allowMissingMedia = optionalBoolean(args.allowMissingMedia, 'allowMissingMedia', false);

  if (!Array.isArray(args.clips) || args.clips.length === 0) {
    throw new InputError('clips must be a non-empty array.');
  }
  if (args.clips.length > MAX_CLIPS) {
    throw new InputError(`clips must contain no more than ${MAX_CLIPS} items.`);
  }

  const rate = FRAME_RATES[frameRate];
  const clips = [];
  for (let index = 0; index < args.clips.length; index += 1) {
    const raw = assertPlainObject(args.clips[index], `clips[${index}]`);
    const path = expandUserPath(raw.path, `clips[${index}].path`);
    await assertMediaPath(path, allowMissingMedia);
    const durationFrames = secondsToFrames(raw.durationSeconds, rate, `clips[${index}].durationSeconds`);
    const startFrames = raw.sourceStartSeconds === undefined
      ? 0
      : secondsToFrames(raw.sourceStartSeconds, rate, `clips[${index}].sourceStartSeconds`, true);
    const name = typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name.trim() : basename(path);
    const hasAudio = optionalBoolean(raw.hasAudio, `clips[${index}].hasAudio`, true);
    clips.push({ path, name, durationFrames, startFrames, hasAudio });
  }

  const xml = createFcpxmlString({ projectName, eventName, frameRate, width, height, clips });
  const validation = validateParsed(parseXml(xml));
  if (!validation.valid) {
    throw new Error(`Generated FCPXML failed internal validation: ${validation.errors.join(' ')}`);
  }

  await writeFileSafely(outputPath, xml, overwrite);
  await access(outputPath, fsConstants.R_OK);

  const totalFrames = clips.reduce((sum, clip) => sum + clip.durationFrames, 0);
  return {
    path: outputPath,
    projectName,
    eventName,
    frameRate,
    resolution: { width, height },
    clips: clips.length,
    duration: framesToTime(totalFrames, rate),
    overwritten: overwrite,
    validation
  };
}

export const fcpxmlInternals = {
  FRAME_RATES,
  framesToTime,
  createFcpxmlString,
  validateParsed
};
