// Text helpers shared by sources (normalising job posts) and the matcher.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

export function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-z#0-9]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

// Job boards hand us HTML (Greenhouse even double-encodes it). We only want words.
export function htmlToText(html) {
  return decodeEntities(decodeEntities(html))
    .replace(/<(br|\/p|\/li|\/div|\/h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n[\s]*/g, '\n')
    .trim();
}

// Everything that goes into innerHTML passes through here. Job posts are
// written by strangers on the internet, so treat them like strangers.
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
