import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, relative } from 'node:path';
import { homedir } from 'node:os';
import { assertPlainObject, expandUserPath, InputError, numberInRange } from './paths.js';
import { parseXml, walkXml } from './xml.js';

const TEMPLATE_KINDS = Object.freeze({
  '.moti': 'title',
  '.motr': 'transition',
  '.moef': 'effect',
  '.motn': 'generator'
});
const MAX_TEMPLATE_BYTES = 20 * 1024 * 1024;

export function defaultMotionTemplateRoots() {
  return [
    `${homedir()}/Movies/Motion Templates.localized`,
    `${homedir()}/Movies/Motion Templates`,
    '/Library/Application Support/Final Cut Pro/Templates.localized',
    '/Library/Application Support/Final Cut Pro/Templates'
  ];
}

async function walkDirectory(root, current, options, output, missing) {
  if (output.length >= options.maxResults) return;
  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT' && current === root) {
      missing.push(root);
      return;
    }
    if (error?.code === 'EACCES' || error?.code === 'EPERM') return;
    throw error;
  }

  for (const entry of entries) {
    if (output.length >= options.maxResults) return;
    if (entry.name === '.DS_Store') continue;
    const path = `${current}/${entry.name}`;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      const depth = relative(root, path).split('/').filter(Boolean).length;
      if (depth <= options.maxDepth) await walkDirectory(root, path, options, output, missing);
      continue;
    }
    if (!entry.isFile()) continue;
    const extension = extname(entry.name).toLowerCase();
    const kind = TEMPLATE_KINDS[extension];
    if (!kind) continue;
    if (options.kinds && !options.kinds.has(kind)) continue;
    const fileStat = await stat(path);
    output.push({
      name: basename(entry.name, extension),
      kind,
      extension,
      path,
      root,
      category: relative(root, current) || '.',
      size: fileStat.size,
      modifiedAt: fileStat.mtime.toISOString()
    });
  }
}

export async function listMotionTemplates(args = {}) {
  assertPlainObject(args);
  const roots = args.roots === undefined
    ? defaultMotionTemplateRoots()
    : (() => {
        if (!Array.isArray(args.roots) || args.roots.length === 0) {
          throw new InputError('roots must be a non-empty array when provided.');
        }
        return args.roots.map((root, index) => expandUserPath(root, `roots[${index}]`));
      })();

  const maxResults = args.maxResults === undefined
    ? 500
    : numberInRange(args.maxResults, 'maxResults', { min: 1, max: 2000, integer: true });
  const maxDepth = args.maxDepth === undefined
    ? 8
    : numberInRange(args.maxDepth, 'maxDepth', { min: 1, max: 20, integer: true });

  let kinds;
  if (args.kinds !== undefined) {
    if (!Array.isArray(args.kinds) || args.kinds.length === 0) {
      throw new InputError('kinds must be a non-empty array when provided.');
    }
    kinds = new Set();
    for (const kind of args.kinds) {
      if (!Object.values(TEMPLATE_KINDS).includes(kind)) {
        throw new InputError(`Unknown Motion template kind: ${kind}.`);
      }
      kinds.add(kind);
    }
  }

  const templates = [];
  const missingRoots = [];
  for (const rawRoot of roots) {
    const root = expandUserPath(rawRoot, 'root');
    await walkDirectory(root, root, { maxResults, maxDepth, kinds }, templates, missingRoots);
    if (templates.length >= maxResults) break;
  }

  templates.sort((left, right) => left.path.localeCompare(right.path));
  return {
    roots,
    missingRoots: [...new Set(missingRoots)],
    count: templates.length,
    truncated: templates.length >= maxResults,
    templates
  };
}

function selectedAttributes(attributes) {
  const selected = {};
  const preferred = ['name', 'displayName', 'id', 'key', 'value', 'published', 'publish', 'version', 'type'];
  for (const key of preferred) {
    if (attributes[key] !== undefined) selected[key] = attributes[key];
  }
  return selected;
}

export async function inspectMotionTemplate(args) {
  assertPlainObject(args);
  const path = expandUserPath(args.path);
  const extension = extname(path).toLowerCase();
  const kind = TEMPLATE_KINDS[extension];
  if (!kind) {
    throw new InputError(`path must end in one of: ${Object.keys(TEMPLATE_KINDS).join(', ')}.`);
  }
  const fileStat = await stat(path);
  if (!fileStat.isFile()) throw new InputError(`${path} is not a regular file.`);
  if (fileStat.size > MAX_TEMPLATE_BYTES) {
    throw new InputError(`${path} exceeds the ${MAX_TEMPLATE_BYTES}-byte limit.`);
  }
  const xml = await readFile(path, 'utf8');
  const document = parseXml(xml, { maxBytes: MAX_TEMPLATE_BYTES, maxDepth: 512 });

  const elementCounts = {};
  const published = [];
  let templateMetadata = null;
  let projectMetadata = null;

  walkXml(document.root, (node, nodePath) => {
    elementCounts[node.name] = (elementCounts[node.name] ?? 0) + 1;
    const lowerName = node.name.toLowerCase();
    const lowerAttributes = Object.fromEntries(
      Object.entries(node.attributes).map(([key, value]) => [key.toLowerCase(), String(value).toLowerCase()])
    );
    const appearsPublished = lowerName.includes('publish')
      || lowerAttributes.published === '1'
      || lowerAttributes.published === 'true'
      || lowerAttributes.publish === '1'
      || lowerAttributes.publish === 'true';
    if (appearsPublished && published.length < 200) {
      published.push({ path: nodePath, element: node.name, attributes: selectedAttributes(node.attributes) });
    }
    if (!templateMetadata && lowerName === 'template') templateMetadata = selectedAttributes(node.attributes);
    if (!projectMetadata && lowerName === 'project') projectMetadata = selectedAttributes(node.attributes);
  });

  return {
    path,
    name: basename(path, extension),
    kind,
    extension,
    size: fileStat.size,
    modifiedAt: fileStat.mtime.toISOString(),
    xml: {
      root: document.root.name,
      rootAttributes: document.root.attributes,
      doctype: document.doctype ?? null,
      declarations: document.declarations
    },
    templateMetadata,
    projectMetadata,
    publishedParameters: published,
    elementCounts
  };
}
