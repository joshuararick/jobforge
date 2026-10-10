// "Find" layer: each job board gets a fetcher + a normaliser that turns its
// JSON into one common Job shape:
//   { id, source, title, company, location, url, description, postedAt, remote }
// Normalisers are pure (easy to test); fetchers are the only code touching the network.

import { htmlToText } from './text.js';

export const normalize = {
  remotive(data) {
    return (data?.jobs || []).map(j => ({
      id: `remotive:${j.id}`,
      source: 'Remotive',
      title: j.title,
      company: j.company_name,
      location: j.candidate_required_location || 'Remote',
      url: j.url,
      description: htmlToText(j.description),
      postedAt: j.publication_date || null,
      remote: true,
    }));
  },

  greenhouse(data, slug) {
    return (data?.jobs || []).map(j => {
      const location = j.location?.name || '';
      return {
        id: `greenhouse:${slug}:${j.id}`,
        source: 'Greenhouse',
        title: j.title,
        company: j.company_name || slug,
        location,
        url: j.absolute_url,
        description: htmlToText(j.content),
        postedAt: j.updated_at || null,
        remote: /remote/i.test(location),
      };
    });
  },

  lever(data, slug) {
    return (Array.isArray(data) ? data : []).map(j => {
      const location = j.categories?.location || '';
      return {
        id: `lever:${slug}:${j.id}`,
        source: 'Lever',
        title: j.text,
        company: slug,
        location,
        url: j.applyUrl || j.hostedUrl,
        description: j.descriptionPlain || htmlToText(j.description),
        postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
        remote: j.workplaceType === 'remote' || /remote/i.test(location),
      };
    });
  },

  ashby(data, slug) {
    return (data?.jobs || []).map(j => ({
      id: `ashby:${slug}:${j.id}`,
      source: 'Ashby',
      title: j.title,
      company: slug,
      location: j.location || '',
      url: j.applyUrl || j.jobUrl,
      description: j.descriptionPlain || htmlToText(j.descriptionHtml),
      postedAt: j.publishedAt || null,
      remote: Boolean(j.isRemote) || /remote/i.test(j.location || ''),
    }));
  },
};

const ENDPOINTS = {
  remotive: q => `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q)}&limit=50`,
  greenhouse: slug => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
  lever: slug => `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
  ashby: slug => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`,
};

// "greenhouse:anthropic, lever:plaid, ashby:ramp" -> [{board, slug}]
export function parseCompanyList(text) {
  return String(text || '')
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(entry => {
      const [board, slug] = entry.split(':').map(s => s.trim().toLowerCase());
      return ENDPOINTS[board] && board !== 'remotive' && slug ? { board, slug } : null;
    })
    .filter(Boolean);
}

async function getJson(url, fetchImpl) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Fetch every source in parallel. One broken board never sinks the whole search:
// failures come back in `errors` so the UI can say which one sulked.
export async function findJobs({ keywords = [], companies = [] }, fetchImpl = fetch) {
  const tasks = [];
  for (const q of keywords) {
    tasks.push({ label: `Remotive "${q}"`, run: () => getJson(ENDPOINTS.remotive(q), fetchImpl).then(d => normalize.remotive(d)) });
  }
  for (const { board, slug } of companies) {
    tasks.push({ label: `${board}:${slug}`, run: () => getJson(ENDPOINTS[board](slug), fetchImpl).then(d => normalize[board](d, slug)) });
  }

  const settled = await Promise.allSettled(tasks.map(t => t.run()));
  const jobs = new Map();
  const errors = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') r.value.forEach(j => j.url && jobs.set(j.id, j));
    else errors.push(`${tasks[i].label}: ${r.reason?.message || r.reason}`);
  });
  return { jobs: [...jobs.values()], errors };
}
