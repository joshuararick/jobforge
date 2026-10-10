// Turn resume files into plain text, right here in the browser. Nothing is uploaded.
// PDF and Word readers are big, so we only download them the first time you need one.

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';
const MAMMOTH = 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(s);
  });
}

async function pdfToText(buffer) {
  const pdfjs = await import(PDFJS);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    pages.push(content.items.map(i => i.str).join(' '));
  }
  return pages.join('\n');
}

async function docxToText(buffer) {
  if (!window.mammoth) await loadScript(MAMMOTH);
  const { value } = await window.mammoth.extractRawText({ arrayBuffer: buffer });
  return value;
}

export async function readResumeFile(file) {
  const name = file.name.toLowerCase();
  let text;
  if (name.endsWith('.pdf')) text = await pdfToText(await file.arrayBuffer());
  else if (name.endsWith('.docx')) text = await docxToText(await file.arrayBuffer());
  else if (/\.(txt|md|text)$/.test(name)) text = await file.text();
  else throw new Error('Use a PDF, .docx, .txt or .md file');
  text = text.replace(/[ \t]+/g, ' ').trim();
  if (text.length < 50) throw new Error("Couldn't find much text in that file (is it a scanned image?)");
  return { id: `resume:${Date.now()}:${file.name}`, name: file.name.replace(/\.[^.]+$/, ''), text, addedAt: new Date().toISOString().slice(0, 10) };
}
