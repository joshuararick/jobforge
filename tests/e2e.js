// End-to-end smoke test: real browser, fake job boards.
// Run: npm run test:e2e   (needs `npx http-server` + Playwright)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const PORT = 8123;
const server = spawn('npx', ['http-server', '-s', '-c-1', '-p', String(PORT), '.'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));

const dir = mkdtempSync(join(tmpdir(), 'jf-'));
const resumePath = join(dir, 'automation-resume.txt');
writeFileSync(resumePath, 'Josh Example. Automation engineer. Built Python and n8n workflows, REST APIs, Zapier integrations for sales teams.');

const remotive = { jobs: [
  { id: 1, title: 'Automation Engineer', company_name: 'GoodCo', url: 'https://jobs.example/1', candidate_required_location: 'USA', description: '<p>Python, n8n and REST APIs</p>' },
  { id: 2, title: '<img src=x onerror="window.pwned=1">Chef', company_name: 'BadCo', url: 'https://jobs.example/2', description: 'cooking' },
  { id: 3, title: 'Automation Lead', company_name: 'NopeCo', url: 'https://jobs.example/3', description: 'Python. Requires security clearance.' },
] };

let failed = false;
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://remotive.com/**', r => r.fulfill({ json: remotive }));
  await page.route('https://boards-api.greenhouse.io/**', r => r.fulfill({ status: 404, body: 'nope' }));
  await page.goto(`http://localhost:${PORT}/`);

  // 1. Me
  await page.setInputFiles('#resume-file', resumePath);
  await page.getByText('📄 automation-resume').waitFor();
  await page.fill('#p-name', 'Josh Example');
  await page.fill('#p-email', 'josh@example.com');
  await page.fill('#p-titles', 'Automation Engineer');
  await page.fill('#p-skills', 'Python, n8n, REST APIs, Zapier');
  await page.fill('#p-exclude', 'security clearance');
  await page.click('#save-profile');

  // 2. Find
  await page.click('[data-tab=find]');
  await page.fill('#f-companies', 'greenhouse:missing');
  await page.locator('#f-min').fill('0');
  await page.click('#run-search');
  await page.getByText('matches ready').waitFor();
  const titles = await page.locator('#match-list h3').allTextContents();
  assert.equal(titles[0], 'Automation Engineer', 'best match first');
  assert.ok(!titles.some(t => t.includes('Lead')), 'deal-breaker job filtered out');
  assert.ok(titles.some(t => t.includes('<img')), 'hostile title shown as text');
  assert.equal(await page.evaluate(() => window.pwned), undefined, 'no XSS');
  assert.match(await page.textContent('#search-errors'), /greenhouse:missing: HTTP 404/);

  // 3. Apply run
  await page.click('[data-start-run]');
  await page.getByText('Job 1 of 2').waitFor();
  const cover = await page.inputValue('#cover');
  assert.ok(cover.includes('GoodCo') && cover.includes('Josh Example'), 'tailored cover letter');
  await page.fill('#cover', cover + '\nP.S. edited');
  await page.click('[data-submitted]');
  await page.getByText('Job 2 of 2').waitFor();
  await page.click('[data-skip-run]');
  await page.getByText('Run complete').waitFor();

  // 4. Tracker (and it survives a reload)
  await page.reload();
  await page.click('[data-tab=tracker]');
  const stats = await page.textContent('#tracker-stats');
  assert.match(stats, /2\s*Tracked/);
  assert.match(stats, /1\s*Applied/);
  const card = page.locator('#tracker-list .card', { hasText: 'GoodCo' });
  assert.match(await card.textContent(), /automation-resume/);
  assert.match(await card.textContent(), /P\.S\. edited/);
  await card.locator('select').selectOption('Interview');
  assert.match(await page.textContent('#tracker-stats'), /1\s*Interviews/);
  await page.screenshot({ path: join(process.env.SHOT_DIR || dir, 'tracker.png'), fullPage: true });

  assert.deepEqual(errors, [], 'no page errors');
  console.log('E2E PASS');
} catch (e) {
  failed = true;
  console.error('E2E FAIL:', e.message);
} finally {
  await browser.close();
  server.kill();
  process.exit(failed ? 1 : 0);
}
