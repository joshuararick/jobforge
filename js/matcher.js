// "Match" layer: score how well each resume fits a job, pick the best resume,
// and draft a cover letter. Plain keyword math — no AI, no network, fully explainable.

const STOP = new Set(`the and for with you your our are will this that from have has
not but all can who what when where how their they them about into over more most
other such than then there these those been being were was its it's also any each
able work working team teams role roles job jobs year years experience including
using use used new well strong high help make within across per via etc must may
should would could just like get set out one two three company position candidate
candidates ability skills skill responsibilities requirements preferred plus join
looking opportunity we us is be as an to of in on or at by a i`.split(/\s+/));

export function tokens(text) {
  const words = String(text || '').toLowerCase().match(/[a-z][a-z0-9+#.]*[a-z0-9+#]|[a-z]/g) || [];
  return new Set(words.filter(w => w.length > 2 && !STOP.has(w)));
}

export function splitList(text) {
  return String(text || '').split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
}

function containsPhrase(haystack, phrase) {
  const p = phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${p}([^a-z0-9]|$)`).test(haystack);
}

// Score 0-100 from three ingredients:
//   50% — how many of YOUR listed skills the job mentions
//   30% — word overlap between the resume and the job post
//   20% — does the job title look like a title you're targeting?
export function scoreJob(job, resumeText, profile = {}) {
  const jobText = `${job.title} ${job.description}`.toLowerCase();
  const skills = splitList(profile.skills);
  const titles = splitList(profile.titles);

  const skillHits = skills.filter(s => containsPhrase(jobText, s));
  const skillScore = skills.length ? skillHits.length / skills.length : 0;

  const jobWords = tokens(jobText);
  const resumeWords = tokens(resumeText);
  const shared = [...jobWords].filter(w => resumeWords.has(w));
  const overlapScore = jobWords.size ? Math.min(1, (shared.length / jobWords.size) * 2.5) : 0;

  const jobTitle = String(job.title || '').toLowerCase();
  const titleScore = titles.some(t => containsPhrase(jobTitle, t)) ? 1
    : titles.some(t => [...tokens(t)].some(w => jobTitle.includes(w))) ? 0.5 : 0;

  const weights = skills.length ? [0.5, 0.3, 0.2] : [0, 0.75, 0.25];
  const score = Math.round(100 * (weights[0] * skillScore + weights[1] * overlapScore + weights[2] * titleScore));

  const missing = skills.filter(s => !skillHits.includes(s));
  return { score, skillHits, missing, shared: shared.slice(0, 15) };
}

// Try every resume against the job; return the winner (or null if you have none).
export function bestResume(job, resumes, profile) {
  let best = null;
  for (const r of resumes) {
    const result = scoreJob(job, r.text, profile);
    if (!best || result.score > best.score) best = { ...result, resume: r };
  }
  return best;
}

// Filters from the profile: must-include words in title, deal-breaker words, remote-only.
export function passesFilters(job, profile = {}) {
  const title = String(job.title || '').toLowerCase();
  const text = `${title} ${job.description || ''} ${job.location || ''}`.toLowerCase();
  const exclude = splitList(profile.exclude).map(s => s.toLowerCase());
  if (exclude.some(word => containsPhrase(text, word))) return false;
  if (profile.remoteOnly && !job.remote) return false;
  return true;
}

export function coverLetter(job, match, profile = {}) {
  const name = profile.name || 'Your Name';
  const hits = match?.skillHits?.length ? match.skillHits : splitList(profile.skills).slice(0, 3);
  const skillLine = hits.length > 1
    ? `${hits.slice(0, -1).slice(0, 4).join(', ')} and ${hits[hits.length - 1]}`
    : hits[0] || 'the skills this role calls for';
  const summary = (profile.summary || '').trim();

  return `Dear ${job.company} Hiring Team,

I'm excited to apply for the ${job.title} role. Your posting calls for experience with ${skillLine} — that's the work I do every day.

${summary || 'In my recent roles I have built practical solutions that save time, cut manual work, and keep teams moving.'}

I'd love to bring that same energy to ${job.company}. Thank you for your time — I look forward to talking about how I can help.

Best regards,
${name}${profile.email ? `\n${profile.email}` : ''}${profile.phone ? `\n${profile.phone}` : ''}`;
}
