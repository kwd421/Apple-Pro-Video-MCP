import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeXmlEntities, escapeXmlAttribute, parseXml, XmlParseError } from '../src/xml.js';

test('XML parser decodes predefined and numeric entities', () => {
  const document = parseXml('<root value="A&amp;B">&#x41;&#66;</root>');
  assert.equal(document.root.attributes.value, 'A&B');
  assert.equal(document.root.text, 'AB');
  assert.equal(decodeXmlEntities('&lt;x&gt;'), '<x>');
});

test('XML parser rejects bare ampersands and custom entities', () => {
  assert.throws(() => parseXml('<root>A & B</root>'), XmlParseError);
  assert.throws(() => parseXml('<!DOCTYPE root [<!ENTITY x "y">]><root>&x;</root>'), /Custom XML entities/);
});

test('XML parser enforces one root and quoted unique attributes', () => {
  assert.throws(() => parseXml('<a/><b/>'), /exactly one document element/);
  assert.throws(() => parseXml('<a x="1" x="2"/>'), /Duplicate attribute/);
  assert.throws(() => parseXml('<a x=1/>'), /must be quoted/);
});

test('XML attribute escaping covers markup-sensitive characters', () => {
  assert.equal(escapeXmlAttribute('A&B<"C">'), 'A&amp;B&lt;&quot;C&quot;&gt;');
});
