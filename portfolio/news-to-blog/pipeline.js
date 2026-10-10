// news-to-blog: SOURCE (Google News RSS) -> TRANSFORM (Claude summary) -> SINK (PayloadCMS draft)
// Same logic as workflow.n8n.json, as plain Node so it can be tested and demoed without n8n.
//
//   ANTHROPIC_API_KEY=... PAYLOAD_URL=https://site.com PAYLOAD_API_KEY=... \
//   node pipeline.js "HVAC" "Greenville SC"          # add --dry-run to just print the posts

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export const MODEL = 'claude-haiku-5-5'; // cheap + fast; switch to claude-sonnet-5-5 for richer writing
const SEEN_FILE = new URL('./seen.json', import.meta.url);

export function newsUrl(industry, location) {
  const q = encodeURIComponent(`${industry} ${location} when:7d`);
  return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}

const tag = (xml, name) => (xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)) || [])[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() || '';

export function parseRss(xml) {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => ({
    title: tag(item, 'title'),
    link: tag(item, 'link'),
    source: tag(item, 'source'),
    published: tag(item, 'pubDate'),
  })).filter(i => i.title && i.link);
}

// Never post the same story twice: remember links across runs.
export function pickFresh(items, seen, max = 3) {
  return items.filter(i => !seen.has(i.link)).slice(0, max);
}

export function buildPrompt(story, { industry, location }) {
  return {
    model: MODEL,
    max_tokens: 1024,
    system: `You write short, friendly local-news blog posts for a ${industry} business in ${location}. ` +
      'Use only facts from the headline given; never invent quotes, numbers or details. ' +
      'Reply as JSON: {"title": string, "body": string} where body is 200-400 words in plain paragraphs.',
    messages: [{ role: 'user', content: `Headline: ${story.title}\nPublisher: ${story.source}\nPublished: ${story.published}\nLink: ${story.link}` }],
  };
}

export function parseClaude(response) {
  const text = response?.content?.find(c => c.type === 'text')?.text || '';
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  const post = JSON.parse(json);
  if (!post.title || !post.body) throw new Error('Claude reply missing title/body');
  return post;
}

// PayloadCMS: POST /api/<collection>. "_status: draft" means a human approves before it goes live.
export function payloadBody(post, story) {
  return { title: post.title, summary: post.body, sourceUrl: story.link, _status: 'draft' };
}

async function main() {
  const [industry = 'HVAC', location = 'Greenville SC'] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const dryRun = process.argv.includes('--dry-run');
  const env = process.env;
  const seen = new Set(existsSync(SEEN_FILE) ? JSON.parse(readFileSync(SEEN_FILE, 'utf8')) : []);

  const rss = await (await fetch(newsUrl(industry, location))).text();
  const stories = pickFresh(parseRss(rss), seen);
  console.log(`Found ${stories.length} fresh stories for ${industry} / ${location}`);

  for (const story of stories) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(buildPrompt(story, { industry, location })),
    });
    if (!res.ok) throw new Error(`Claude HTTP ${res.status}: ${await res.text()}`);
    const post = parseClaude(await res.json());

    if (dryRun) {
      console.log(`\n=== ${post.title} ===\n${post.body}\n(source: ${story.link})`);
    } else {
      const r = await fetch(`${env.PAYLOAD_URL}/api/${env.PAYLOAD_COLLECTION || 'posts'}`, {
        method: 'POST',
        headers: { Authorization: `users API-Key ${env.PAYLOAD_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify(payloadBody(post, story)),
      });
      if (!r.ok) throw new Error(`Payload HTTP ${r.status}: ${await r.text()}`);
      console.log(`Drafted: ${post.title}`);
    }
    seen.add(story.link);
  }
  if (!dryRun) writeFileSync(SEEN_FILE, JSON.stringify([...seen]));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
