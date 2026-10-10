# 📰 News → Claude → Blog (n8n + Node)

Every morning: find fresh local industry news, have Claude write a short 200–400 word post about it, and save it to a PayloadCMS website **as a draft** for a human to approve.

```
 ⏰ Every Morning ─▶ ⚙️ Config ─▶ 📰 Google News RSS ─▶ 🧹 Skip Already Posted ─▶ ✂️ Keep 3
                    (industry,     (last 7 days)        (remembers links          │
                     location)                           across runs)              ▼
                                       📝 Payload draft ◀─ 🧩 Shape Post ◀─ 🤖 Claude writes post
```

**SOURCE → TRANSFORM → SINK**, on a schedule. Swap any box and it's a new product:
news→LinkedIn, reviews→Slack, leads→CRM.

## Two versions, same logic

| | `workflow.n8n.json` | `pipeline.js` |
|---|---|---|
| For | Clients who live in n8n | Devs / testing / cron |
| Run | n8n → Import from file | `node pipeline.js "HVAC" "Greenville SC" --dry-run` |
| Tests | – | `node --test pipeline.test.js` |

### n8n setup (≈5 min)
1. Import `workflow.n8n.json`.
2. Create two **Header Auth** credentials:
   - *Anthropic*: name `x-api-key`, value = your Anthropic API key
   - *Payload*: name `Authorization`, value = `users API-Key <your key>` (enable API keys on your Payload users collection)
3. Edit **Config**: industry, location, site URL, collection.
4. Run once manually, check the drafts, then activate.

## Design choices (aka why a client should trust it)
- **Drafts, not auto-publish.** A human approves before anything goes live; flip `_status` to `published` once you trust it.
- **No invented facts.** The prompt only allows what's in the headline, and every post keeps its source link.
- **Never duplicates.** Links are remembered across runs.
- **Cheap.** Uses Claude Haiku by default (pennies per day); one line switches to Sonnet for richer writing.
- **No secrets in the file.** Keys live in n8n credentials / env vars.

### Known next steps
- Payload's rich-text field (Lexical) needs a conversion step if posts should land in `content` instead of a plain `summary` field.
- Fetch the full article text (not just the headline) for meatier posts.
- Add an n8n Error Trigger workflow that emails if a run fails.
