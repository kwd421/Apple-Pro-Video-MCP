const XML_NAME_START = /[A-Za-z_:]/;
const XML_NAME_CHAR = /[A-Za-z0-9_.:-]/;

export class XmlParseError extends Error {
  constructor(message, position) {
    super(`${message} (character ${position})`);
    this.name = 'XmlParseError';
    this.position = position;
  }
}

function byteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}

function skipWhitespace(source, state) {
  while (state.index < source.length && /\s/.test(source[state.index])) {
    state.index += 1;
  }
}

function readName(source, state) {
  const start = state.index;
  const first = source[state.index];
  if (!first || !XML_NAME_START.test(first)) {
    throw new XmlParseError('Expected an XML name', state.index);
  }
  state.index += 1;
  while (state.index < source.length && XML_NAME_CHAR.test(source[state.index])) {
    state.index += 1;
  }
  return source.slice(start, state.index);
}

function decodeEntity(entity, position) {
  switch (entity) {
    case 'amp': return '&';
    case 'lt': return '<';
    case 'gt': return '>';
    case 'quot': return '"';
    case 'apos': return "'";
    default:
      if (/^#\d+$/.test(entity)) {
        const codePoint = Number(entity.slice(1));
        if (!Number.isSafeInteger(codePoint) || codePoint > 0x10ffff) {
          throw new XmlParseError(`Invalid numeric entity &${entity};`, position);
        }
        return String.fromCodePoint(codePoint);
      }
      if (/^#x[0-9a-f]+$/i.test(entity)) {
        const codePoint = Number.parseInt(entity.slice(2), 16);
        if (!Number.isSafeInteger(codePoint) || codePoint > 0x10ffff) {
          throw new XmlParseError(`Invalid hexadecimal entity &${entity};`, position);
        }
        return String.fromCodePoint(codePoint);
      }
      throw new XmlParseError(`Unknown XML entity &${entity};`, position);
  }
}

export function decodeXmlEntities(value, basePosition = 0) {
  let output = '';
  let cursor = 0;
  while (cursor < value.length) {
    const ampersand = value.indexOf('&', cursor);
    if (ampersand === -1) {
      output += value.slice(cursor);
      break;
    }
    output += value.slice(cursor, ampersand);
    const semicolon = value.indexOf(';', ampersand + 1);
    if (semicolon === -1) {
      throw new XmlParseError('Unterminated XML entity', basePosition + ampersand);
    }
    const entity = value.slice(ampersand + 1, semicolon);
    if (entity === '' || entity.includes('&') || entity.includes('<')) {
      throw new XmlParseError('Malformed XML entity', basePosition + ampersand);
    }
    output += decodeEntity(entity, basePosition + ampersand);
    cursor = semicolon + 1;
  }
  return output;
}

function findMarkupEnd(source, start, endToken) {
  const end = source.indexOf(endToken, start);
  if (end === -1) {
    throw new XmlParseError(`Unterminated ${endToken === '?>' ? 'processing instruction' : 'markup section'}`, start);
  }
  return end;
}

function findDoctypeEnd(source, start) {
  let quote = null;
  let bracketDepth = 0;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '[') bracketDepth += 1;
    if (character === ']') bracketDepth -= 1;
    if (character === '>' && bracketDepth === 0) return index;
  }
  throw new XmlParseError('Unterminated DOCTYPE declaration', start);
}

function appendText(stack, roots, value, position) {
  if (value === '') return;
  const decoded = decodeXmlEntities(value, position);
  if (stack.length === 0) {
    if (decoded.trim() !== '') {
      throw new XmlParseError('Text is not allowed outside the document element', position);
    }
    return;
  }
  stack[stack.length - 1].text += decoded;
}

export function parseXml(source, options = {}) {
  if (typeof source !== 'string') {
    throw new TypeError('XML source must be a string.');
  }

  const maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
  const maxDepth = options.maxDepth ?? 256;
  if (byteLength(source) > maxBytes) {
    throw new XmlParseError(`XML exceeds the ${maxBytes}-byte limit`, 0);
  }
  if (/<!ENTITY\b/i.test(source)) {
    throw new XmlParseError('Custom XML entities are not allowed', source.search(/<!ENTITY\b/i));
  }

  const state = { index: 0 };
  const roots = [];
  const stack = [];
  const declarations = [];
  let doctype;

  while (state.index < source.length) {
    if (source[state.index] !== '<') {
      const start = state.index;
      const next = source.indexOf('<', start);
      state.index = next === -1 ? source.length : next;
      appendText(stack, roots, source.slice(start, state.index), start);
      continue;
    }

    if (source.startsWith('<!--', state.index)) {
      const end = findMarkupEnd(source, state.index + 4, '-->');
      if (source.slice(state.index + 4, end).includes('--')) {
        throw new XmlParseError('XML comments must not contain --', state.index);
      }
      state.index = end + 3;
      continue;
    }

    if (source.startsWith('<![CDATA[', state.index)) {
      const contentStart = state.index + 9;
      const end = findMarkupEnd(source, contentStart, ']]>');
      if (stack.length === 0 && source.slice(contentStart, end).trim() !== '') {
        throw new XmlParseError('CDATA is not allowed outside the document element', state.index);
      }
      if (stack.length > 0) stack[stack.length - 1].text += source.slice(contentStart, end);
      state.index = end + 3;
      continue;
    }

    if (source.startsWith('<?', state.index)) {
      const end = findMarkupEnd(source, state.index + 2, '?>');
      declarations.push(source.slice(state.index + 2, end).trim());
      state.index = end + 2;
      continue;
    }

    if (/^<!DOCTYPE\b/i.test(source.slice(state.index))) {
      if (doctype !== undefined) {
        throw new XmlParseError('Only one DOCTYPE declaration is allowed', state.index);
      }
      const end = findDoctypeEnd(source, state.index + 9);
      const value = source.slice(state.index + 9, end).trim();
      if (/\[|\bSYSTEM\b|\bPUBLIC\b/i.test(value)) {
        throw new XmlParseError('External or internal-subset DOCTYPE declarations are not allowed', state.index);
      }
      doctype = value;
      state.index = end + 1;
      continue;
    }

    if (source.startsWith('</', state.index)) {
      const closePosition = state.index;
      state.index += 2;
      skipWhitespace(source, state);
      const name = readName(source, state);
      skipWhitespace(source, state);
      if (source[state.index] !== '>') {
        throw new XmlParseError('Expected > after closing tag', state.index);
      }
      state.index += 1;
      const node = stack.pop();
      if (!node) {
        throw new XmlParseError(`Unexpected closing tag </${name}>`, closePosition);
      }
      if (node.name !== name) {
        throw new XmlParseError(`Closing tag </${name}> does not match <${node.name}>`, closePosition);
      }
      continue;
    }

    if (source.startsWith('<!', state.index)) {
      throw new XmlParseError('Unsupported XML declaration', state.index);
    }

    const elementPosition = state.index;
    state.index += 1;
    const name = readName(source, state);
    const attributes = {};
    let selfClosing = false;

    while (state.index < source.length) {
      skipWhitespace(source, state);
      if (source.startsWith('/>', state.index)) {
        selfClosing = true;
        state.index += 2;
        break;
      }
      if (source[state.index] === '>') {
        state.index += 1;
        break;
      }

      const attributePosition = state.index;
      const attributeName = readName(source, state);
      if (Object.hasOwn(attributes, attributeName)) {
        throw new XmlParseError(`Duplicate attribute ${attributeName}`, attributePosition);
      }
      skipWhitespace(source, state);
      if (source[state.index] !== '=') {
        throw new XmlParseError(`Expected = after attribute ${attributeName}`, state.index);
      }
      state.index += 1;
      skipWhitespace(source, state);
      const quote = source[state.index];
      if (quote !== '"' && quote !== "'") {
        throw new XmlParseError(`Attribute ${attributeName} must be quoted`, state.index);
      }
      state.index += 1;
      const valueStart = state.index;
      const valueEnd = source.indexOf(quote, valueStart);
      if (valueEnd === -1) {
        throw new XmlParseError(`Unterminated attribute ${attributeName}`, valueStart);
      }
      const rawAttributeValue = source.slice(valueStart, valueEnd);
      if (rawAttributeValue.includes('<')) {
        throw new XmlParseError(`Attribute ${attributeName} must not contain <`, valueStart);
      }
      attributes[attributeName] = decodeXmlEntities(rawAttributeValue, valueStart);
      state.index = valueEnd + 1;
    }

    const node = { name, attributes, children: [], text: '', position: elementPosition };
    if (stack.length > 0) {
      stack[stack.length - 1].children.push(node);
    } else {
      roots.push(node);
      if (roots.length > 1) {
        throw new XmlParseError('XML must contain exactly one document element', elementPosition);
      }
    }

    if (!selfClosing) {
      stack.push(node);
      if (stack.length > maxDepth) {
        throw new XmlParseError(`XML exceeds the maximum depth of ${maxDepth}`, elementPosition);
      }
    }
  }

  if (stack.length > 0) {
    const node = stack[stack.length - 1];
    throw new XmlParseError(`Unclosed element <${node.name}>`, node.position);
  }
  if (roots.length !== 1) {
    throw new XmlParseError('XML must contain one document element', source.length);
  }

  return { root: roots[0], declarations, doctype };
}

export function walkXml(node, visitor, path = `/${node.name}`) {
  visitor(node, path);
  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    walkXml(child, visitor, `${path}/${child.name}[${index + 1}]`);
  }
}

export function escapeXmlAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
