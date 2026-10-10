// "Track" layer: the list of every job you've touched, and what happened next.
// All functions are pure — they take the list and return a new list.

export const STATUSES = ['Saved', 'Applied', 'Interview', 'Offer', 'Rejected', 'Ghosted', 'Skipped'];
export const FOLLOW_UP_DAYS = 7;

const today = () => new Date().toISOString().slice(0, 10);

export function upsert(items, job, fields = {}) {
  const existing = items.find(i => i.id === job.id || (job.url && i.url === job.url));
  const entry = {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location || '',
    url: job.url,
    source: job.source || 'Manual',
    score: job.score ?? existing?.score ?? null,
    resume: existing?.resume || '',
    coverLetter: existing?.coverLetter || '',
    notes: existing?.notes || '',
    status: existing?.status || 'Saved',
    addedAt: existing?.addedAt || today(),
    appliedAt: existing?.appliedAt || null,
    history: existing?.history || [],
    ...fields,
  };
  if (fields.status && fields.status !== existing?.status) {
    entry.history = [...entry.history, { status: fields.status, date: today() }];
    if (fields.status === 'Applied' && !entry.appliedAt) entry.appliedAt = today();
  }
  const rest = items.filter(i => i !== existing);
  return [entry, ...rest];
}

export function setStatus(items, id, status) {
  const item = items.find(i => i.id === id);
  return item ? upsert(items, item, { status }) : items;
}

export function setNotes(items, id, notes) {
  return items.map(i => (i.id === id ? { ...i, notes } : i));
}

export function remove(items, id) {
  return items.filter(i => i.id !== id);
}

export function isKnown(items, job) {
  return items.some(i => i.id === job.id || (job.url && i.url === job.url));
}

export function needsFollowUp(item, now = new Date()) {
  if (item.status !== 'Applied' || !item.appliedAt) return false;
  const days = (now - new Date(item.appliedAt)) / 86400000;
  return days >= FOLLOW_UP_DAYS;
}

export function stats(items) {
  const counts = Object.fromEntries(STATUSES.map(s => [s, 0]));
  items.forEach(i => { counts[i.status] = (counts[i.status] || 0) + 1; });
  const applied = items.filter(i => i.appliedAt).length;
  return { total: items.length, applied, counts };
}

export function toCsv(items) {
  const cols = ['status', 'title', 'company', 'location', 'score', 'resume', 'addedAt', 'appliedAt', 'source', 'url', 'notes'];
  const cell = v => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...items.map(i => cols.map(c => cell(i[c])).join(','))].join('\n');
}

// Import old-style entries from the first JobForge version ({title, company, url, score, status, date}).
export function migrateLegacy(items) {
  return (items || []).map((i, n) => (i.id ? i : {
    id: `legacy:${n}:${i.url || i.title}`,
    title: i.title || i.jobTitle, company: i.company, url: i.url, score: i.score ?? null,
    status: i.status === 'Researched' ? 'Saved' : (i.status || 'Saved'),
    addedAt: i.date || today(), appliedAt: null, location: '', source: 'Manual',
    resume: '', coverLetter: i.cover || '', notes: '', history: [],
  }));
}
