import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newsUrl, parseRss, pickFresh, buildPrompt, parseClaude, payloadBody } from './pipeline.js';

const RSS = `<rss><channel>
<item><title><![CDATA[New HVAC rebates announced in Greenville]]></title><link>https://n.example/1</link><pubDate>Thu, 09 Oct 2026</pubDate><source url="x">Greenville News</source></item>
<item><title>Heat pump demand rises</title><link>https://n.example/2</link></item>
<item><title></title><link>https://n.example/3</link></item>
</channel></rss>`;

test('newsUrl encodes the query', () => {
  assert.match(newsUrl('HVAC', 'Greenville SC'), /q=HVAC%20Greenville%20SC%20when%3A7d/);
});

test('parseRss reads items, strips CDATA, drops untitled', () => {
  const items = parseRss(RSS);
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], { title: 'New HVAC rebates announced in Greenville', link: 'https://n.example/1', source: 'Greenville News', published: 'Thu, 09 Oct 2026' });
});

test('pickFresh skips already-posted links and caps the count', () => {
  const items = parseRss(RSS);
  assert.deepEqual(pickFresh(items, new Set(['https://n.example/1'])).map(i => i.link), ['https://n.example/2']);
  assert.equal(pickFresh(items, new Set(), 1).length, 1);
});

test('prompt forbids invented facts and asks for JSON', () => {
  const p = buildPrompt(parseRss(RSS)[0], { industry: 'HVAC', location: 'Greenville SC' });
  assert.match(p.system, /never invent/);
  assert.match(p.system, /200-400 words/);
  assert.match(p.messages[0].content, /New HVAC rebates/);
});

test('parseClaude tolerates chatter around the JSON', () => {
  const post = parseClaude({ content: [{ type: 'text', text: 'Sure!\n{"title":"T","body":"B"}\nEnjoy' }] });
  assert.deepEqual(post, { title: 'T', body: 'B' });
  assert.throws(() => parseClaude({ content: [{ type: 'text', text: '{"title":"T"}' }] }), /missing/);
});

test('payload post is a draft with a source link', () => {
  assert.deepEqual(payloadBody({ title: 'T', body: 'B' }, { link: 'L' }), { title: 'T', summary: 'B', sourceUrl: 'L', _status: 'draft' });
});
