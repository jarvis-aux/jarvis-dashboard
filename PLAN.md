# JARVIS Ops Dashboard (Static, Vercel) — Implementation Plan

## 0) Executive take
Build a **static dashboard** that reads a single generated `public/state.json` (plus optional `public/state.meta.json`), rendered by **vanilla HTML/CSS/JS**.

Why: you do not need a framework, you do need reliability. The pipeline is “local script → commit state.json → Vercel redeploy.” Keep the runtime dumb.

---

## 1) Architecture diagram

```
            ┌──────────────────────────────────────────────┐
            │            Andrew’s MacBook Pro               │
            │              (OpenClaw host)                  │
            └──────────────────────────────────────────────┘n
  (every 30 min)
        cron
         │
         ▼
┌───────────────────────┐      reads/parses      ┌───────────────────────────┐
│ scripts/gen_state.py   │ ───────────────────▶  │ Workspace state files      │
│ (pure local generator) │                       │                           │
└───────────────────────┘                       │ - PROJECTS.md             │
         │                                       │ - CAPABILITY-GAPS.md       │
         │ writes                                 │ - HEARTBEAT.md            │
         ▼                                       │ - MEMORY.md               │
┌───────────────────────┐                       │ - memory/*.md / *.json    │
│ public/state.json      │                       │ - openclaw cron list       │
│ public/state.meta.json │                       └───────────────────────────┘
└───────────────────────┘
         │
         │ git commit + push
         ▼
┌──────────────────────────────────────────────┐
│ GitHub repo                                   │
│  - static site (public/)                      │
│  - generated JSON committed                   │
└──────────────────────────────────────────────┘
         │
         │ Vercel auto-deploy on push
         ▼
┌──────────────────────────────────────────────┐
│ Vercel (free tier)                            │
│  - serves static assets                        │
│  - dashboard fetches /state.json               │
└──────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│ Browser (mobile/desktop)                      │
│  - renders cards, charts, last-run status     │
└──────────────────────────────────────────────┘
```

---

## 2) Data model — exact shape of `public/state.json`

Principles:
- **One file** so the client does one request.
- Everything has **timestamps as epoch seconds** *and* human strings when helpful.
- Keep raw excerpts short. Link out to GitHub for full files.

### 2.1 Top-level schema

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": 1773070000,
  "generatedAtIso": "2026-03-09T15:26:40Z",
  "host": {
    "name": "Andrew’s MacBook Pro",
    "timezone": "America/Chicago"
  },
  "health": {
    "overall": "ok",        // ok | warn | error
    "signals": [
      {
        "key": "cron.anyFailed",
        "level": "warn",   // info | warn | error
        "message": "1 cron job failed in last 24h",
        "ts": 1773069000
      }
    ]
  },
  "sections": {
    "cron": { /* 2.2 */ },
    "stocks": { /* 2.3 */ },
    "curiosity": { /* 2.4 */ },
    "projects": { /* 2.5 */ },
    "capabilityGaps": { /* 2.6 */ },
    "drive": { /* 2.7 */ },
    "memory": { /* 2.8 */ },
    "heartbeat": { /* 2.9 */ }
  },
  "links": {
    "repo": "https://github.com/<owner>/<repo>",
    "vercel": "https://<name>.vercel.app"
  }
}
```

### 2.2 `sections.cron`
Source: `openclaw cron list` output.

```jsonc
{
  "jobs": [
    {
      "id": "daily-usage-report",         // stable identifier
      "schedule": "0 22 * * *",           // if available
      "humanSchedule": "Daily at 10:00 PM",
      "enabled": true,
      "lastRun": {
        "ts": 1773064800,
        "status": "success",             // success | failure | running | unknown
        "durationMs": 12450,
        "summary": "Sent Telegram usage report"
      },
      "nextRun": {
        "ts": 1773100800
      },
      "recent": [
        {"ts": 1773064800, "status": "success"},
        {"ts": 1772978400, "status": "failure", "summary": "Token expired"}
      ]
    }
  ],
  "stats": {
    "total": 6,
    "enabled": 6,
    "failedLast24h": 1
  },
  "source": {
    "command": "openclaw cron list",
    "capturedAt": 1773070000
  }
}
```

### 2.3 `sections.stocks`
Source: `memory/maruhide-stock-log.json`

```jsonc
{
  "monitors": [
    {
      "key": "maruhide-uni",
      "name": "Maruhide Uni",
      "status": {
        "availability": "unknown",     // in_stock | out_of_stock | unknown
        "lastCheckedTs": 1773069900,
        "lastKnownChangeTs": 1773061200,
        "confidence": "high"           // high | medium | low
      },
      "history": {
        "windowHours": 72,
        "points": [
          {"ts": 1773061200, "availability": "in_stock"},
          {"ts": 1773064800, "availability": "out_of_stock"}
        ]
      }
    }
  ],
  "stats": {
    "total": 1,
    "inStock": 0
  }
}
```

### 2.4 `sections.curiosity`
Sources: `memory/curiosity-backlog.md`, `memory/heartbeat-state.json`

```jsonc
{
  "runs": {
    "today": 2,
    "lastRunTs": 1773067000,
    "budget": {
      "dailyRunCap": 6,
      "cooldownMinutes": 30
    }
  },
  "backlog": {
    "open": [
      {
        "id": "cur-2026-03-01-foo",
        "title": "Why did X fail on Vercel?",
        "status": "open",          // open | investigating | resolved | parked
        "priority": "medium",      // low | medium | high
        "createdTs": 1772400000,
        "tags": ["infra", "vercel"],
        "notesExcerpt": "Observed intermittent 404s..."
      }
    ],
    "resolved": [
      {
        "id": "cur-2026-02-20-bar",
        "title": "Add SearXNG as default search",
        "resolvedTs": 1771600000
      }
    ]
  },
  "stats": {
    "openCount": 4,
    "resolved7d": 2
  }
}
```

### 2.5 `sections.projects`
Source: `PROJECTS.md`

```jsonc
{
  "active": [
    {
      "key": "dashboard",
      "name": "Ops Dashboard",
      "status": "building",           // idea | building | active | paused | done
      "updatedTs": 1773060000,
      "links": {
        "doc": "docs/dashboard-plan.md",
        "repoPath": "/"
      },
      "notesExcerpt": "Static Vercel dashboard; state.json generator."
    }
  ],
  "stats": {"activeCount": 6}
}
```

### 2.6 `sections.capabilityGaps`
Source: `CAPABILITY-GAPS.md`

```jsonc
{
  "open": [
    {
      "id": "gap-telegram-rate-limit",
      "title": "Telegram flood control on burst notifications",
      "severity": "medium",          // low | medium | high
      "createdTs": 1771000000,
      "notesExcerpt": "Need backoff + dedupe across cron runs"
    }
  ],
  "rejected": [
    {
      "id": "rej-auto-post-twitter",
      "title": "Auto-post to Twitter",
      "rejectedTs": 1770900000,
      "reasonExcerpt": "Not worth the risk"
    }
  ],
  "stats": {"openCount": 7}
}
```

### 2.7 `sections.drive`
Sources: `memory/heartbeat-state.json`, `docs/drive-system.md`

```jsonc
{
  "cadence": {
    "wednesdayAudit": {"expectedDay": "Wednesday"},
    "sundayReport": {"expectedDay": "Sunday", "expectedHourLocal": 20}
  },
  "last": {
    "auditTs": 1772650000,
    "reportTs": 1772995000
  },
  "next": {
    "auditDueTs": 1773250000,
    "reportDueTs": 1773607200
  },
  "status": "ok"  // ok | warn
}
```

### 2.8 `sections.memory`
Sources: `memory/YYYY-MM-DD.md` files, `MEMORY.md`

```jsonc
{
  "today": {
    "date": "2026-03-09",
    "path": "memory/2026-03-09.md",
    "lineCount": 220,
    "byteCount": 18342,
    "lastModifiedTs": 1773069800
  },
  "recentDays": [
    {"date": "2026-03-08", "lineCount": 140, "byteCount": 10201},
    {"date": "2026-03-07", "lineCount": 90,  "byteCount": 7211}
  ],
  "memoryMd": {
    "path": "MEMORY.md",
    "lineCount": 180,
    "byteCount": 25001,
    "lastModifiedTs": 1773061000
  },
  "stats": {
    "dailyFilesLast30d": 28,
    "avgDailyBytes7d": 11000
  }
}
```

### 2.9 `sections.heartbeat`
Sources: `HEARTBEAT.md`, `memory/heartbeat-state.json`

```jsonc
{
  "config": {
    "path": "HEARTBEAT.md",
    "lineCount": 60,
    "lastModifiedTs": 1773000000,
    "checks": [
      {"key": "email", "target": "gog gmail search is:unread", "cadence": "2-4/day"},
      {"key": "calendar", "target": "gog calendar list", "cadence": "2-4/day"}
    ]
  },
  "lastChecks": {
    "email": 1773069000,
    "calendar": 1773065400,
    "weather": null,
    "curiosity": 1773067000
  },
  "status": {
    "staleKeys": ["calendar"],
    "staleThresholdHours": 8
  }
}
```

### 2.10 `public/state.meta.json` (optional but recommended)
Reason: make it easy to track generator versioning without changing the main schema.

```json
{
  "generator": "gen_state.py",
  "generatorVersion": "0.1.0",
  "git": {"commit": "abc1234", "branch": "main"}
}
```

---

## 3) UI layout (sections, cards, information density)

Single-page dashboard, **no routing**. Two columns on desktop, one column on mobile.

### 3.1 Global layout
- Top bar:
  - Left: “JARVIS Ops”
  - Right: last updated time (relative + absolute), overall health pill (OK/WARN/ERROR), links (GitHub, Vercel)
- Main grid:
  1. **Cron Jobs** (wide card)
  2. **Heartbeat** (medium card)
  3. **Drive** (medium card)
  4. **Stocks** (wide card with mini chart)
  5. **Curiosity** (wide card)
  6. **Projects** (medium card)
  7. **Capability Gaps** (medium card)
  8. **Memory** (wide card)

### 3.2 Cards (opinionated contents)

#### Cron Jobs card
- Summary row: total enabled, failures last 24h
- Table (scrollable within card):
  - Job name
  - Last run (relative)
  - Status dot (green/yellow/red)
  - Next run (relative)
- Expand-on-click row: show last failure summary if present.

#### Heartbeat card
- Show configured checks (from HEARTBEAT.md parse) as a list
- For each check: last run time + “stale” badge if over threshold.

#### Drive card
- Last audit timestamp + due date
- Last Sunday report timestamp + due date
- If overdue: bold warning + “why you’re seeing this” tooltip.

#### Stocks card
- One sub-card per monitor:
  - Name
  - Current availability pill
  - Last checked
  - Tiny sparkline (last 72h availability) using a simple canvas chart

#### Curiosity card
- Counters: open items, resolved 7d, runs today
- List top 5 open items (title + status + tags)
- “View file” link to `memory/curiosity-backlog.md` on GitHub

#### Projects card
- Top 6 active projects (name + status)
- Each links to docs path on GitHub

#### Capability Gaps card
- Badge counts: open gaps, rejected proposals
- List top 5 open gaps (severity color)

#### Memory card
- Today’s memory file: bytes + last modified
- 7-day bar chart (bytes/day)
- MEMORY.md size trend (optional later)

### 3.3 Information density rules
- Always show: “what’s broken / stale / overdue” first.
- Default collapsed lists (top N) with “Show more” toggles.
- Avoid raw markdown dumps in the UI. Excerpts only.

---

## 4) Visual design direction

### 4.1 Aesthetic
- **Dark mode default**.
- “Vercel/Linear-ish”: flat surfaces, subtle borders, sharp typography.

### 4.2 Palette (CSS variables)
- Background: `#0B0D10`
- Surface: `#10141A`
- Surface-2: `#0F1217`
- Border: `rgba(255,255,255,0.08)`
- Text: `rgba(255,255,255,0.92)`
- Muted: `rgba(255,255,255,0.60)`
- Green: `#2BD576`
- Yellow: `#F5C542`
- Red: `#FF4D4D`
- Accent (links): `#7AA2FF`

### 4.3 Typography
- Use system font stack (fast, no hosting risk):
  - `font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;`
- Numeric: `font-variant-numeric: tabular-nums;`

### 4.4 Components
- Cards with 12px radius, thin border, slight shadow.
- Status pills with strong color + subtle glow.
- Tables inside cards should have sticky headers.

---

## 5) Repo file structure

Assume this lives in the existing OpenClaw workspace repo, with the dashboard deployed from that repo.

```
/ (repo root)
  public/
    index.html
    app.css
    app.js
    state.json            # generated
    state.meta.json       # generated (optional)
  scripts/
    gen_state.py          # reads local files, writes public/state.json
    push_state.sh         # runs generator, commits, pushes
    parsers/
      parse_cron.py
      parse_markdown.py
      parse_stock_log.py
  docs/
    dashboard-plan.md
  memory/
    ... existing ...
  PROJECTS.md
  CAPABILITY-GAPS.md
  HEARTBEAT.md
  MEMORY.md
  vercel.json (optional)
  .gitignore (do NOT ignore public/state.json)
```

Notes:
- Put UI assets in `public/` so Vercel serves them trivially.
- Commit `state.json`. It’s the whole point.

---

## 6) `state.json` generation script design

### 6.1 Implementation choice
Use **Python 3**.
- Robust parsing, good datetime handling.
- Cleaner than zsh for markdown + JSON transforms.

### 6.2 Inputs and parsing approach

#### Cron jobs
- Run command: `openclaw cron list --json` **if it exists**.
  - If OpenClaw doesn’t support JSON output, fallback to plain text parse with regex.
- Parse fields:
  - job id/name
  - enabled
  - schedule
  - last run time and status
  - next run time

If cron list output lacks last/next timestamps, the generator should still emit the jobs list with `unknown` fields and surface a `health.signals` warning: “Cron output missing timestamps; upgrade parser.”

#### Stocks log
- Read `memory/maruhide-stock-log.json`.
- Normalize to availability points:
  - map whatever raw values exist into: `in_stock|out_of_stock|unknown`.
- Compute:
  - `lastCheckedTs` (max ts)
  - `lastKnownChangeTs` (last time availability changed)
  - last 72h points downsampled (avoid huge JSON)

#### Curiosity backlog markdown
- Parse `memory/curiosity-backlog.md` with a strict convention:
  - Headings for Open/Resolved
  - Each item starts with `- [ ]` / `- [x]`
  - Optional tags like `#infra #vercel`
  - Optional status tokens like `(investigating)`

If the existing file is not structured, generator should:
- attempt best-effort parse
- still provide counts + excerpts
- emit a warning signal recommending tightening the format

#### Projects / Capability Gaps markdown
Same markdown parsing strategy:
- Prefer extracting items from bullet lists with status tokens.
- Store only excerpt + link path.

#### Drive + Heartbeat state
- Read `memory/heartbeat-state.json`.
- Extract known keys:
  - last checks
  - curiosity runs
  - audit/report timestamps
- Compute staleness vs configured thresholds.

#### Memory stats
- Inspect `memory/` for `YYYY-MM-DD.md`.
- For last 30 days:
  - file size bytes
  - line counts
  - last modified
- Read `MEMORY.md` stats.

### 6.3 Outputs
- Write to `public/state.json` atomically:
  - write to `public/state.json.tmp`
  - fsync
  - rename

### 6.4 Health signal rules (opinionated)
- WARN if:
  - any cron job failed in last 24h
  - any heartbeat check stale (>8h)
  - drive audit/report overdue
  - generator can’t parse a critical file (but can still produce partial state)
- ERROR if:
  - generator cannot read >50% of required inputs
  - `state.json` write fails

---

## 7) Deployment pipeline (local → GitHub → Vercel)

### 7.1 Vercel
- Connect GitHub repo.
- Framework preset: “Other” (static).
- Build command: **none**.
- Output: `public/`.

If Vercel insists on a build step, set:
- Build command: `echo "no build"`
- Output directory: `public`

### 7.2 Local cron job
A cron job (OpenClaw cron or macOS launchd) runs every 30 minutes:

`bash scripts/push_state.sh`

`push_state.sh` responsibilities:
1. `python3 scripts/gen_state.py`
2. `git status --porcelain` check for changes in `public/state.json` / `public/state.meta.json`
3. If changed:
   - `git add public/state.json public/state.meta.json`
   - `git commit -m "chore(state): update dashboard state"`
   - `git push`
4. If no change: exit cleanly (no spam commits).

Hard requirements:
- The script must **fail loudly** (non-zero) on errors.
- The cron should capture stdout/stderr to a log file.

---

## 8) Estimated build time (realistic)

Assuming files already exist and you’re not bikeshedding:
- Generator script (parsers + schema + health rules): **2–4 hours**
- UI (HTML/CSS/JS + responsive layout + basic charts): **3–6 hours**
- Cron automation + GitHub/Vercel wiring + polish: **1–2 hours**

Total: **6–12 hours** (1 focused day).

---

## 9) Open questions / decisions needed from Andrew

1. **Repo boundary:** Is the dashboard deployed from the existing OpenClaw workspace repo, or do you want a separate “dashboard” repo that pulls state from a submodule / mirrored folder?
   - My recommendation: same repo. Fewer moving parts.

2. **Cron list format:** Does `openclaw cron list` support `--json` (or similar)?
   - If yes, parsing is trivial and robust.
   - If no, we’ll regex parse the text and accept fragility until OpenClaw adds JSON output.

3. **Markdown conventions:** Are you willing to slightly standardize the markdown formats (Projects/Gaps/Curiosity) so the parser is deterministic?
   - My recommendation: yes. The dashboard should not be an NLP project.

4. **Privacy posture:** The dashboard will be public unless you add auth. Is that okay?
   - On free tier static Vercel, real auth is awkward.
   - If you want it private: we can use Vercel password protection (if available) or make it unlisted behind a long URL, but that’s security-by-obscurity.

5. **Update cadence:** 30 min is fine. Do you ever need “now” refresh on-demand?
   - If yes, we can add a manual `scripts/push_state.sh` run command and a button in the UI that links to GitHub Actions dispatch (but that adds a server-ish component).

---

## Appendix: minimal UI implementation notes

- `public/app.js`:
  - fetch `/state.json` with `cache: 'no-store'`
  - render cards with string templates
  - implement “Show more” toggles
  - implement simple sparkline using `<canvas>`

- Cache-busting:
  - Because this is static, ensure `fetch('/state.json?ts=' + state.generatedAt)` or set `no-store`.

- Links:
  - Each section should include “View source” links to the underlying file in GitHub for quick debugging.
