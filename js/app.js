// UI layer: reads the screen, calls the pure modules, saves, re-renders.
// Data flow is always:  user action -> update state -> save() -> render()

import { load, save } from './storage.js';
import { escapeHtml as esc } from './text.js';
import { findJobs, parseCompanyList } from './sources.js';
import { bestResume, passesFilters, coverLetter, splitList } from './matcher.js';
import * as T from './tracker.js';
import { readResumeFile } from './resumes.js';

const $ = id => document.getElementById(id);

// First JobForge version called the pitch "experience".
function upgradeProfile(p) {
  return p.experience && !p.summary ? { ...p, summary: p.experience } : p;
}

const state = {
  profile: upgradeProfile(load('profile', {})),
  resumes: load('resumes', []),
  tracker: T.migrateLegacy(load('tracker', [])),
  matches: load('matches', []),
  search: load('search', { keywords: '', companies: '', minScore: 40 }),
  run: null, // { queue: [jobId], index } while an apply run is in progress
};

function persist() {
  save('profile', state.profile);
  save('resumes', state.resumes);
  save('tracker', state.tracker);
  save('matches', state.matches);
  save('search', state.search);
}

let statusTimer;
function flash(msg) {
  $('status').textContent = msg;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { $('status').textContent = 'Ready'; }, 2500);
}

function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('main > section').forEach(s => s.classList.toggle('active', s.id === name));
  if (name === 'apply') renderApply();
  if (name === 'tracker') renderTracker();
}
document.querySelectorAll('.tab').forEach(tab => { tab.onclick = () => showTab(tab.dataset.tab); });

const scoreClass = s => (s >= 70 ? 'good' : s >= 45 ? 'mid' : '');

// ---------- 1. Me: resumes + profile ----------

const PROFILE_FIELDS = ['name', 'email', 'phone', 'linkedin', 'titles', 'skills', 'summary', 'exclude'];

function renderProfile() {
  PROFILE_FIELDS.forEach(f => { $(`p-${f}`).value = state.profile[f] || ''; });
  $('p-remote').checked = Boolean(state.profile.remoteOnly);
}

$('save-profile').onclick = () => {
  PROFILE_FIELDS.forEach(f => { state.profile[f] = $(`p-${f}`).value.trim(); });
  state.profile.remoteOnly = $('p-remote').checked;
  if (!state.search.keywords && state.profile.titles) state.search.keywords = state.profile.titles;
  persist();
  renderFindForm();
  flash('Saved ✓');
};

function renderResumes() {
  $('resume-list').innerHTML = state.resumes.length
    ? state.resumes.map(r => `
      <div class="card">
        <strong>📄 ${esc(r.name)}</strong>
        <div class="muted">${r.text.length.toLocaleString()} characters · added ${esc(r.addedAt)}</div>
        <details><summary class="muted">Preview text</summary><p class="muted">${esc(r.text.slice(0, 600))}…</p></details>
        <button class="ghost danger" data-remove-resume="${esc(r.id)}">Remove</button>
      </div>`).join('')
    : '<p class="muted">No resumes yet — add at least one so JobForge can match you.</p>';
}

$('resume-list').onclick = e => {
  const id = e.target.dataset.removeResume;
  if (id && confirm('Remove this resume?')) {
    state.resumes = state.resumes.filter(r => r.id !== id);
    persist();
    renderResumes();
  }
};

$('resume-file').onchange = async e => {
  for (const file of e.target.files) {
    try {
      flash(`Reading ${file.name}…`);
      state.resumes.push(await readResumeFile(file));
      persist();
      flash(`Added ${file.name} ✓`);
    } catch (err) {
      alert(`${file.name}: ${err.message}`);
    }
  }
  e.target.value = '';
  renderResumes();
};

// ---------- 2. Find ----------

function renderFindForm() {
  $('f-keywords').value = state.search.keywords || '';
  $('f-companies').value = state.search.companies || '';
  $('f-min').value = state.search.minScore;
  $('f-min-out').textContent = state.search.minScore;
}

$('f-min').oninput = e => {
  state.search.minScore = Number(e.target.value);
  $('f-min-out').textContent = e.target.value;
  save('search', state.search);
  renderMatches();
};

// Score a raw job against every resume and attach the winner.
function scoreAgainstResumes(job) {
  const best = bestResume(job, state.resumes, state.profile);
  return {
    ...job,
    score: best ? best.score : 0,
    resumeId: best?.resume.id || null,
    resumeName: best?.resume.name || '',
    skillHits: best?.skillHits || [],
    missing: best?.missing || [],
  };
}

$('run-search').onclick = async () => {
  state.search.keywords = $('f-keywords').value.trim();
  state.search.companies = $('f-companies').value.trim();
  persist();

  if (!state.resumes.length) {
    alert('Add a resume on the "Me" tab first, so JobForge knows what to match against.');
    return showTab('me');
  }
  const keywords = splitList(state.search.keywords);
  const companies = parseCompanyList(state.search.companies);
  if (!keywords.length && !companies.length) return alert('Type at least one keyword or company board.');

  const btn = $('run-search');
  btn.disabled = true;
  btn.textContent = 'Searching…';
  try {
    const { jobs, errors } = await findJobs({ keywords, companies });
    const fresh = jobs
      .filter(j => !T.isKnown(state.tracker, j))
      .filter(j => passesFilters(j, state.profile))
      .map(scoreAgainstResumes)
      .sort((a, b) => b.score - a.score);
    // keep any manual matches, replace the rest
    state.matches = [...state.matches.filter(m => m.source === 'Manual'), ...fresh];
    persist();
    $('search-errors').innerHTML = errors.map(e => `<p class="error">⚠️ ${esc(e)}</p>`).join('');
    flash(`Found ${jobs.length} jobs`);
    renderMatches();
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Find matching jobs';
  }
};

function visibleMatches() {
  return state.matches
    .filter(m => !T.isKnown(state.tracker, m))
    .filter(m => m.score >= state.search.minScore);
}

function renderMatches() {
  const list = visibleMatches();
  const hidden = state.matches.filter(m => !T.isKnown(state.tracker, m)).length - list.length;
  $('match-list').innerHTML = (list.length ? `
    <div class="card">
      <strong>${list.length} matches ready</strong>
      <button class="primary" data-start-run>🚀 Start apply run</button>
    </div>` : '<p class="muted">No matches yet. Hit Find!</p>') +
    list.slice(0, 100).map(m => `
      <div class="card">
        <span class="score">${m.score}</span>
        <h3>${esc(m.title)}</h3>
        <div>${esc(m.company)} · <span class="muted">${esc(m.location)}</span></div>
        <div class="muted">via ${esc(m.source)} · best resume: <b>${esc(m.resumeName || '—')}</b></div>
        ${m.skillHits.length ? `<div class="muted">✓ ${esc(m.skillHits.join(', '))}</div>` : ''}
        <div class="row">
          <button class="ghost" data-apply-one="${esc(m.id)}">Apply</button>
          <button class="ghost" data-save="${esc(m.id)}">Save for later</button>
          <button class="ghost" data-skip="${esc(m.id)}">Not for me</button>
          <a href="${esc(m.url)}" target="_blank" rel="noopener">View post ↗</a>
        </div>
      </div>`).join('') +
    (hidden > 0 ? `<p class="muted">${hidden} more below your minimum score.</p>` : '');
}

$('match-list').onclick = e => {
  const d = e.target.dataset;
  if ('startRun' in d) startRun(visibleMatches().map(m => m.id));
  else if (d.applyOne) startRun([d.applyOne]);
  else if (d.save) track(d.save, { status: 'Saved' });
  else if (d.skip) track(d.skip, { status: 'Skipped' });
};

$('add-manual').onclick = () => {
  const title = $('m-title').value.trim();
  const description = $('m-desc').value.trim();
  const url = $('m-url').value.trim();
  if (!title || !description || !url) return alert('Title, URL and description are all needed.');
  const job = {
    id: `manual:${url}`, source: 'Manual', title, url, description,
    company: $('m-company').value.trim() || 'the company', location: '', remote: false,
  };
  state.matches = [scoreAgainstResumes(job), ...state.matches.filter(m => m.id !== job.id)];
  persist();
  ['m-title', 'm-company', 'm-url', 'm-desc'].forEach(id => { $(id).value = ''; });
  renderMatches();
  flash('Added ✓');
};

function track(jobId, fields) {
  const job = state.matches.find(m => m.id === jobId) || state.tracker.find(t => t.id === jobId);
  if (!job) return;
  state.tracker = T.upsert(state.tracker, job, fields);
  persist();
  renderMatches();
  flash(`${fields.status || 'Updated'} ✓`);
}

// ---------- 3. Apply run ----------

function startRun(ids) {
  if (!ids.length) return;
  state.run = { queue: ids, index: 0, letters: {} };
  showTab('apply');
}

function currentRunJob() {
  if (!state.run) return null;
  while (state.run.index < state.run.queue.length) {
    const job = state.matches.find(m => m.id === state.run.queue[state.run.index]);
    if (job && !T.isKnown(state.tracker, job)) return job;
    state.run.index++;
  }
  return null;
}

function renderApply() {
  const panel = $('apply-panel');
  const job = currentRunJob();
  if (!job) {
    const done = state.run ? state.run.queue.length : 0;
    state.run = null;
    panel.innerHTML = done
      ? `<div class="card"><h3>🎉 Run complete!</h3><p>You worked through ${done} job${done === 1 ? '' : 's'}. Check the Tracker to see them all.</p></div>`
      : '<p class="muted">Nothing queued. Go to <b>Find</b>, search, then tap <b>Start apply run</b>.</p>';
    return;
  }
  const { queue, index } = state.run;
  const letter = state.run.letters[job.id] ??= coverLetter(job, job, state.profile);
  const p = state.profile;
  const copyRow = (label, value) => value ? `
    <div class="copy-field"><span><span class="muted">${label}:</span> ${esc(value)}</span>
    <button class="ghost" data-copy="${esc(value)}">Copy</button></div>` : '';

  panel.innerHTML = `
    <div class="muted">Job ${index + 1} of ${queue.length}</div>
    <div class="progress"><div style="width:${Math.round(100 * index / queue.length)}%"></div></div>
    <div class="card">
      <span class="score">${job.score}</span>
      <h3>${esc(job.title)}</h3>
      <div>${esc(job.company)} · <span class="muted">${esc(job.location)}</span></div>
      ${job.missing.length ? `<div class="muted">Skills they didn't mention: ${esc(job.missing.join(', '))}</div>` : ''}
    </div>
    <div class="card">
      <strong>Step 1 · Upload this resume</strong>
      <p>📄 <b>${esc(job.resumeName || 'your resume')}</b></p>
      <strong>Step 2 · Cover letter</strong> <span class="muted">(edit freely)</span>
      <textarea id="cover" rows="12">${esc(letter)}</textarea>
      <button class="ghost" data-copy-cover>Copy cover letter</button>
      <strong style="display:block;margin-top:12px">Step 3 · Your details</strong>
      ${copyRow('Name', p.name)}${copyRow('Email', p.email)}${copyRow('Phone', p.phone)}${copyRow('Link', p.linkedin)}
    </div>
    <a class="primary file-btn" href="${esc(job.url)}" target="_blank" rel="noopener" data-opened>Open application form ↗</a>
    <button class="primary" style="background:var(--success)" data-submitted>✅ I submitted it — next</button>
    <div class="row">
      <button class="ghost" data-later>Save for later</button>
      <button class="ghost" data-skip-run>Skip</button>
      <button class="ghost danger" data-stop>Stop run</button>
    </div>`;
  $('cover').oninput = e => { state.run.letters[job.id] = e.target.value; };
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    flash('Copied ✓');
  } catch {
    prompt('Copy this:', text);
  }
}

$('apply-panel').onclick = e => {
  const d = e.target.dataset;
  const job = currentRunJob();
  if (d.copy !== undefined) return copy(d.copy);
  if (!job) return;
  const letter = state.run.letters[job.id] || '';
  if ('copyCover' in d) return copy(letter);
  if ('stop' in d) { state.run = null; return renderApply(); }

  const fields = { resume: job.resumeName, coverLetter: letter };
  if ('submitted' in d) track(job.id, { ...fields, status: 'Applied' });
  else if ('later' in d) track(job.id, { ...fields, status: 'Saved' });
  else if ('skipRun' in d) track(job.id, { status: 'Skipped' });
  else return;
  state.run.index++;
  renderApply();
};

// ---------- 4. Tracker ----------

$('t-filter').innerHTML += T.STATUSES.map(s => `<option>${s}</option>`).join('');
$('t-filter').onchange = renderTracker;

function renderTracker() {
  const { total, applied, counts } = T.stats(state.tracker);
  const followUps = state.tracker.filter(i => T.needsFollowUp(i)).length;
  $('tracker-stats').innerHTML = [
    ['Tracked', total], ['Applied', applied], ['Interviews', counts.Interview + counts.Offer], ['Follow up', followUps],
  ].map(([l, n]) => `<div class="stat"><b>${n}</b><span class="muted">${l}</span></div>`).join('');

  const filter = $('t-filter').value;
  const items = state.tracker.filter(i => !filter || i.status === filter);
  $('tracker-list').innerHTML = items.length ? items.map(i => `
    <div class="card">
      ${i.score != null ? `<span class="badge ${scoreClass(i.score)}" style="float:right">${i.score}</span>` : ''}
      <h3>${esc(i.title)}</h3>
      <div>${esc(i.company)} <span class="muted">${esc(i.location)}</span></div>
      <div class="muted">
        ${i.appliedAt ? `Applied ${esc(i.appliedAt)}` : `Added ${esc(i.addedAt)}`}
        ${i.resume ? ` · 📄 ${esc(i.resume)}` : ''} · <a href="${esc(i.url)}" target="_blank" rel="noopener">post ↗</a>
      </div>
      ${T.needsFollowUp(i) ? '<span class="badge warn">⏰ Time to follow up</span>' : ''}
      <div class="row">
        <select data-status="${esc(i.id)}" aria-label="Status">
          ${T.STATUSES.map(s => `<option ${s === i.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <button class="ghost danger" data-delete="${esc(i.id)}">Delete</button>
      </div>
      <textarea data-notes="${esc(i.id)}" placeholder="Notes: recruiter name, interview date…" rows="2">${esc(i.notes)}</textarea>
      ${i.coverLetter ? `<details><summary class="muted">Cover letter sent</summary><pre style="white-space:pre-wrap;font-family:inherit">${esc(i.coverLetter)}</pre></details>` : ''}
    </div>`).join('') : '<p class="muted">Nothing here yet.</p>';
}

$('tracker-list').onchange = e => {
  const { status, notes } = e.target.dataset;
  if (status) state.tracker = T.setStatus(state.tracker, status, e.target.value);
  else if (notes) state.tracker = T.setNotes(state.tracker, notes, e.target.value);
  else return;
  persist();
  if (status) renderTracker();
  flash('Saved ✓');
};

$('tracker-list').onclick = e => {
  const id = e.target.dataset.delete;
  if (id && confirm('Delete this entry?')) {
    state.tracker = T.remove(state.tracker, id);
    persist();
    renderTracker();
  }
};

function download(filename, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const stamp = () => new Date().toISOString().slice(0, 10);
$('export-csv').onclick = () => download(`jobforge-tracker-${stamp()}.csv`, T.toCsv(state.tracker), 'text/csv');
$('export-json').onclick = () => download(`jobforge-backup-${stamp()}.json`,
  JSON.stringify({ profile: state.profile, resumes: state.resumes, tracker: state.tracker, search: state.search }, null, 2),
  'application/json');
$('import-json').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.tracker)) throw new Error('not a JobForge backup');
    if (!confirm(`Replace current data with this backup (${data.tracker.length} tracked jobs)?`)) return;
    Object.assign(state, {
      profile: data.profile || {}, resumes: data.resumes || [],
      tracker: T.migrateLegacy(data.tracker), search: data.search || state.search,
    });
    persist();
    init();
    flash('Restored ✓');
  } catch (err) {
    alert(`Couldn't restore: ${err.message}`);
  } finally {
    e.target.value = '';
  }
};

// ---------- boot ----------

function init() {
  renderProfile();
  renderResumes();
  renderFindForm();
  renderMatches();
  renderTracker();
}
init();
persist(); // writes migrated legacy tracker back in the new shape

if (!window.matchMedia('(display-mode: standalone)').matches && /iphone|ipad/i.test(navigator.userAgent)) {
  $('install-prompt').style.display = 'block';
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
