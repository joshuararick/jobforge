# JobForge 🔨

A tiny iPhone-friendly app that **finds** jobs, **matches** them to the right one of your resumes, preps a **tailored application**, and **tracks** everything you've applied to.

No server, no account, no AI bill. Everything lives on your phone.

## How to use it

1. **Me** – add your resumes (PDF, Word, or text — add every version you have), plus your name, skills, the titles you want, and any deal-breakers.
2. **Find** – type keywords (searches the Remotive remote-jobs board) and/or company boards like `greenhouse:anthropic`, `lever:plaid`, `ashby:ramp`. JobForge scores every job against **each** resume and picks the best one.
3. **Apply** – hit **Start apply run**. For each match you get: which resume to upload, a tailored cover letter (editable), and copy buttons for your details. Open the form, submit, tap **✅ I submitted it** → next job.
4. **Tracker** – every job you applied to, saved, or skipped, with dates, the resume and cover letter you used, notes, status (Applied → Interview → Offer…), a ⏰ follow-up nudge after 7 days, and CSV / backup export.

### Why doesn't it hit "submit" for me?
On purpose. Every company's form is different (and many have CAPTCHAs), LinkedIn/Indeed ban bots, and an application is *you* talking to an employer — you should see it before it goes. JobForge does the boring 90% and leaves you the one tap that matters.

## Run it

```bash
npm start            # serves on http://localhost:8080
npm test             # unit tests (no install needed)
npm install && npm run test:e2e   # browser test with fake job boards
```

Put it on GitHub Pages (Settings → Pages → deploy from branch) and open it on your iPhone → Share → **Add to Home Screen**.

## Architecture (the fun part)

```
             ┌──────────────── index.html + styles.css (what you see)
             │
         js/app.js  ← UI glue: click → update state → save() → render()
        /    |    \          \
 sources.js  matcher.js  tracker.js  resumes.js
  FIND        MATCH        TRACK      READ FILES
 (network)   (pure math)  (pure data) (pdf.js / mammoth, loaded on demand)
        \    |    /
         storage.js → localStorage (your phone, nobody else's)
```

Ideas worth stealing for your own projects:

- **One job per module.** `sources` only talks to job boards, `matcher` only scores, `tracker` only manages the list. When Lever changes its API, you touch one file.
- **Adapters / normalisers.** Four job boards return four different JSON shapes. Each gets a tiny `normalize.x()` that converts it to one common `Job` shape, so nothing else in the app knows boards exist. Adding a fifth board = one function + one URL.
- **Pure functions in the middle, side effects at the edges.** `matcher.js` and `tracker.js` never touch the network or the screen, which is why `tests/unit.test.js` can test them in milliseconds.
- **Fail soft.** `Promise.allSettled` means one broken company board shows a ⚠️ instead of killing the whole search.
- **Never trust strangers' text.** Job posts are written by the internet; everything rendered goes through `escapeHtml()` (the e2e test literally tries an `<img onerror>` attack).
- **Human in the loop** for anything that speaks in your name.

### Ideas for v2
- Swap the keyword matcher for an LLM call (e.g. the Claude API) to write sharper cover letters and resume bullet tweaks — keep it behind the same `coverLetter()` function so nothing else changes.
- A daily scheduled search that pings you with new matches.
- Sync the tracker to a Google Sheet.
