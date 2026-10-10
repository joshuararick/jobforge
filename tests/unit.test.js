import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, parseCompanyList, findJobs } from '../js/sources.js';
import { scoreJob, bestResume, passesFilters, coverLetter } from '../js/matcher.js';
import * as T from '../js/tracker.js';
import { htmlToText, escapeHtml } from '../js/text.js';

const profile = { name: 'Josh', titles: 'Automation Engineer', skills: 'Python, n8n, REST APIs, Zapier', exclude: 'security clearance' };
const job = { id: 'x:1', title: 'Senior Automation Engineer', company: 'Acme', url: 'https://a.co/1', description: 'We use Python and n8n to build REST APIs integrations.' };

test('greenhouse double-encoded HTML becomes plain text', () => {
  const [j] = normalize.greenhouse({ jobs: [{ id: 7, title: 'Eng', absolute_url: 'u', location: { name: 'Remote - US' }, content: '&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;' }] }, 'acme');
  assert.equal(j.description, 'Hello & welcome');
  assert.equal(j.id, 'greenhouse:acme:7');
  assert.equal(j.remote, true);
});

test('lever and ashby normalise to the common shape', () => {
  const [l] = normalize.lever([{ id: 'a', text: 'Dev', hostedUrl: 'h', applyUrl: 'ap', categories: { location: 'NYC' }, descriptionPlain: 'd', createdAt: 0 }], 'plaid');
  assert.deepEqual([l.title, l.url, l.remote], ['Dev', 'ap', false]);
  const [a] = normalize.ashby({ jobs: [{ id: 'b', title: 'PM', jobUrl: 'j', location: 'Remote', descriptionPlain: 'x' }] }, 'ramp');
  assert.deepEqual([a.title, a.url, a.remote], ['PM', 'j', true]);
});

test('parseCompanyList keeps only known boards', () => {
  assert.deepEqual(parseCompanyList('greenhouse:Anthropic, lever:plaid\nbogus:x, ashby:'), [
    { board: 'greenhouse', slug: 'anthropic' }, { board: 'lever', slug: 'plaid' },
  ]);
});

test('findJobs survives one board failing and dedupes', async () => {
  const fake = async url => {
    if (url.includes('lever')) return { ok: false, status: 404 };
    return { ok: true, json: async () => ({ jobs: [{ id: 1, title: 'A', url: 'u1', company_name: 'C', description: '' }] }) };
  };
  const { jobs, errors } = await findJobs({ keywords: ['a', 'b'], companies: [{ board: 'lever', slug: 'nope' }] }, fake);
  assert.equal(jobs.length, 1);
  assert.match(errors[0], /lever:nope: HTTP 404/);
});

test('scoreJob rewards skills + title, ignores case', () => {
  const r = scoreJob(job, 'Built Python automations with n8n', profile);
  assert.deepEqual(r.skillHits, ['Python', 'n8n', 'REST APIs']);
  assert.deepEqual(r.missing, ['Zapier']);
  assert.ok(r.score >= 60 && r.score <= 100, `score ${r.score}`);
  const weak = scoreJob({ ...job, title: 'Pastry Chef', description: 'croissants' }, 'Python', profile);
  assert.ok(weak.score < 15, `weak ${weak.score}`);
});

test('"java" skill does not match "javascript"', () => {
  const r = scoreJob({ title: 'x', description: 'javascript only' }, '', { skills: 'Java' });
  assert.deepEqual(r.skillHits, []);
});

test('bestResume picks the better-fitting resume', () => {
  const best = bestResume(job, [
    { id: 'r1', name: 'Barista', text: 'coffee latte art customer service' },
    { id: 'r2', name: 'Automation', text: 'python n8n rest apis integrations automation engineer' },
  ], profile);
  assert.equal(best.resume.name, 'Automation');
  assert.equal(bestResume(job, [], profile), null);
});

test('passesFilters: deal-breakers and remote-only', () => {
  assert.equal(passesFilters(job, profile), true);
  assert.equal(passesFilters({ ...job, description: 'Requires Security Clearance' }, profile), false);
  assert.equal(passesFilters({ ...job, remote: false }, { remoteOnly: true }), false);
});

test('coverLetter mentions company, title, matched skills and name', () => {
  const text = coverLetter(job, { skillHits: ['Python', 'n8n'] }, profile);
  for (const s of ['Acme', 'Senior Automation Engineer', 'Python and n8n', 'Josh']) assert.ok(text.includes(s), s);
});

test('tracker: upsert, apply date, history, dedupe by url', () => {
  let items = T.upsert([], job, { status: 'Saved' });
  items = T.upsert(items, { ...job, id: 'other-id' }, { status: 'Applied' });
  assert.equal(items.length, 1);
  assert.equal(items[0].status, 'Applied');
  assert.ok(items[0].appliedAt);
  assert.deepEqual(items[0].history.map(h => h.status), ['Saved', 'Applied']);
  items = T.setStatus(items, items[0].id, 'Interview');
  assert.equal(T.stats(items).counts.Interview, 1);
  assert.equal(T.stats(items).applied, 1);
  assert.equal(T.isKnown(items, { id: 'zzz', url: job.url }), true);
});

test('tracker: follow-up after 7 days, CSV quoting, legacy migration', () => {
  const item = { status: 'Applied', appliedAt: '2026-01-01' };
  assert.equal(T.needsFollowUp(item, new Date('2026-01-05')), false);
  assert.equal(T.needsFollowUp(item, new Date('2026-01-09')), true);
  const csv = T.toCsv([{ title: 'A, "B"', status: 'Saved' }]);
  assert.match(csv, /"A, ""B"""/);
  const [m] = T.migrateLegacy([{ jobTitle: 'Old', company: 'Co', url: 'u', status: 'Researched', date: '2025-01-01', cover: 'hi' }]);
  assert.deepEqual([m.title, m.status, m.coverLetter], ['Old', 'Saved', 'hi']);
});

test('html helpers', () => {
  assert.equal(escapeHtml('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');
  assert.equal(htmlToText('<ul><li>a</li><li>b</li></ul>'), 'a\nb');
});
