# Upwork Kit: copy, paste, get paid 💸

Fill in every `[BRACKET]` with the truth about you. Clients check, and honesty wins repeat work.

---

## 1. Create the freelancer profile (≈20 min)
Upwork → your avatar (top right) → **Create a freelancer account**.

### Title (max ~70 chars)
```
AI Automation Builder | n8n · OpenRouter/Claude · APIs · CMS
```

### Overview (first 2 lines show in search, so they matter most)
```
I build AI automations that run while you sleep: find data → process it with AI → put it where it's useful.

What I build:
• Content agents: news/RSS → AI-written posts → your CMS (PayloadCMS, WordPress) as drafts
• Data pipelines: job boards, leads, reviews → scored, filtered, tracked
• n8n workflows with scheduling, retries and error handling, plus clear docs

How I work:
• Safety first: drafts before publishing, no invented facts, no duplicates
• Swap AI models with one setting (OpenRouter: Claude, GPT, Grok…)
• Tested code you can read: every project ships with docs and tests

Portfolio: github.com/joshuararick/news-to-blog-agent
[1 sentence about your background, e.g. "Based in Greenville SC, previously …"]
```

### Skills (Upwork lets you pick up to 15; pick these first)
n8n · AI Agent Development · Automation · API Integration · JavaScript · Node.js · Python · OpenAI API · Claude · Make.com · Zapier · Content Automation · Web Scraping · Automated Workflow · CMS Development

### Hourly rate
Start at **$30/hr**. On the gig below, bids ranged $12–$50 (average $28.50).
Raise it by $5–10 after your first 2–3 five-star reviews.
*(Based on one job's bids. Look at a few more postings before you settle on it.)*

### Portfolio item
- **Title:** News-to-Blog AI Agent (n8n + Node.js)
- **Link:** https://github.com/joshuararick/news-to-blog-agent
- **Description:** "Daily agent: finds local industry news, writes 200–400 word posts with any AI model via OpenRouter, and saves them to PayloadCMS as drafts for approval. Retries, duplicate protection, 38 automated tests."
- **Image:** screenshot of your `npm run preview` output, or the n8n canvas after importing the workflow.

---

## 2. Proposal: "N8N Ai Agent Content Builder"
https://www.upwork.com/jobs/~022107552331799943401

```
Hi! I already built a working prototype of exactly this, so you can see it before you hire:
👉 github.com/joshuararick/news-to-blog-agent

It's an n8n workflow (import in one click) that:
1. Runs on a schedule and pulls recent news for your industry + location (Google News RSS; NewsAPI easy to add)
2. Skips stories it has already used, so no duplicate posts
3. Writes a 200–400 word summary through OpenRouter, so you can switch between GPT, Claude or Grok by changing one field
4. Saves it to PayloadCMS (as a draft by default, or auto-publish if you prefer)

Reliability: each network step retries automatically, and replies from the AI that aren't usable are rejected instead of published. Setup docs are included.

To fit it to your site I'd need: your industry/location, your Payload posts collection fields, and whether you want drafts or straight-to-live.

One question: should posts go live automatically, or would you like to approve them for the first couple of weeks?

[Your name]
```

### Screening answers. ⚠️ Answer truthfully; these are drafts.
1. **Have you used N8N to automate content?**
   "Yes. I built the workflow linked above: news → AI summary → PayloadCMS, with scheduling, de-duplication and retries. [Add any other real n8n experience.]"
2. **Have you done any SEO work before?**
   "[Be honest. If limited: 'Lightly. I focus on the automation side, but the posts are built for local SEO: location-specific topics, original summaries, and a source link on each post. Happy to follow your keyword guidance.']"
3. **Describe your recent experience with similar projects.**
   "Recently I built two automation pipelines: this news-to-blog agent, and JobForge, an app that pulls listings from four job-board APIs, scores them against resumes, generates tailored cover letters and tracks every application. Both follow the same pattern: source → AI transform → destination, on a schedule. [Add real work experience if you have it.]"

---

## 3. Before you hit submit ✅
- [ ] Ran `npm run preview` with a real OpenRouter key and saved a screenshot
- [ ] Checked the repo's **Actions** tab shows a green ✅
- [ ] Replaced every `[BRACKET]` above
- [ ] Profile photo + identity verification done (Upwork boosts verified profiles)
