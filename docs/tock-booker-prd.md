# Tock Universal Booker — Product Requirements Document

## Implementation sync checklist (must-follow)

If any of these change: CLI flags, fallback behavior, watch detection logic, checkout behavior, logging schema.

Then update ALL of the following in the same change:
1. `docs/tock-booker-prd.md` (this doc)
2. `docs/tock-booker-architecture.md`
3. `docs/tock-sniper-todos.md` (move items between TODO/Done)
4. `scripts/tock-sniper/Claude.md` (entrypoint for future agents)
5. Dashboard copies (jarvis-dashboard `/docs/`)

This prevents the classic drift where the code is correct but the docs lie.

**Author:** JARVIS + Andrew
**Date:** 2026-03-11
**Status:** Living (keep in sync with `docs/tock-booker-architecture.md`)

## 1. Problem Statement

High-demand Tock restaurants (Taneda, Toshokan, Tsuke Edomae) sell out within seconds of their monthly reservation drops. A human clicking through the UI cannot reliably secure a slot against thousands of competing users. We need an automated tool that can navigate the Tock booking flow faster than a human while handling the variability across different restaurant configurations.

## 2. Product Overview

A Python CLI tool that takes a restaurant target and desired date/time, monitors for availability, and navigates the Tock booking flow to reach the checkout page (10-minute lock acquired) as fast as possible. The tool handles the full spectrum of Tock restaurant configurations — different pricing models, add-on pages, party size constraints — through a single unified interface.

## 3. Scope

### In Scope (Phase 1 — This Build)
- Navigate from restaurant page to checkout page (lock acquired)
- Pre-drop polling (watch mode) that detects availability the instant it appears
- Support for all 6 target restaurants with their configuration differences
- Per-step timing logs for speed optimization
- Fallback logic for time/date selection
- Lock release (explicit command + auto-release on exit)
- Async Telegram notifications at key milestones
- Manual and cron-triggered launch
- Testing against live bookable restaurants (locks expire, no charge)

### Out of Scope (Phase 2 — Later)
- CVC entry and purchase completion (handled by JARVIS via live browser automation after human "go")
- CAPTCHA solving
- Multi-restaurant simultaneous runs
- Account switching

## 4. User Stories

**Drop Day Snipe:**
As Andrew, I want to launch the booker 2-3 minutes before a Tock drop, have it poll until availability appears, and lock my preferred slot before other humans can click through the UI.

**Testing & Iteration:**
As Andrew, I want to run the booker against any bookable restaurant, see per-step timing in the logs, and iterate on speed without risking real money (locks expire).

**Cancellation Monitoring:**
As Andrew, I want to leave the booker in watch mode on a sold-out restaurant and get notified if a cancellation opens up a slot.

## 5. Requirements

### 5.1 CLI Interface

```bash
# Standard run — book a specific date/time
python3 tock_booker.py \
  --restaurant taneda \
  --date 2026-05-01 \
  --time "7:45 PM" \
  --party-size 2 \
  --mode live

# Watch mode — poll until availability, then book
python3 tock_booker.py \
  --restaurant taneda \
  --date 2026-05-01 \
  --time "7:45 PM" \
  --party-size 2 \
  --mode watch

# Dry run — do everything except click "Book"
python3 tock_booker.py \
  --restaurant taneda \
  --date 2026-05-01 \
  --time "7:45 PM" \
  --party-size 2 \
  --mode dry-run

# Release an active lock
python3 tock_booker.py --release

# List supported restaurants
python3 tock_booker.py --list-restaurants
```

**Arguments:**
| Arg | Required | Default | Description |
|-----|----------|---------|-------------|
| `--restaurant` | Yes | — | Restaurant slug (e.g., `taneda`, `sushibaraustin`) |
| `--date` | Yes | — | Target date `YYYY-MM-DD` |
| `--time` | No | First available | Preferred time (e.g., `"7:45 PM"`) |
| `--party-size` | No | 2 | Number of guests |
| `--mode` | No | `live` | `live`, `watch`, or `dry-run` |
| `--auto-release` / `--no-auto-release` | No | `--no-auto-release` | Checkout behavior: hold at checkout by default; or auto-release after screenshot + short wait |
| `--release` | No | — | Best-effort release any active lock and exit |
| `--list-restaurants` | No | — | Print supported restaurants and exit |
| `--fallback-dates` | No | — | Comma-separated fallback dates (e.g., `2026-05-02,2026-05-03`) |

### 5.2 Tock Account

- **Primary account:** aliudeloitte@gmail.com (patronId 233120906)
- Assumes browser is already logged in on the openclaw Chrome profile
- No account switching — single account per run

### 5.3 Booking Flow

The tool must handle this universal flow:

```
1. Navigate to experience dialog
2. Set party size (if not default)
3. Navigate to target month (if needed)
4. Click target date
5. Wait for time slots to load
6. Click "Book" on target time (or best available)
7. Handle add-on page if present (skip or select defaults)
8. Verify checkout page reached (lock confirmed)
9. STOP — notify Andrew, hold position
```

### 5.4 Fallback Logic

When the preferred time slot is unavailable:

**Time fallback (within a chosen date):**
1. Try preferred time first
2. If preferred is missing/unbookable: try **nearest available Book times** (by absolute minute delta)
3. If clicks race (slot_not_found), do one fast re-scrape + retry

**Date fallback:**
1. Try the target date
2. If the target date is **disabled/not released** (`date_disabled`) and `--fallback-dates` was NOT provided: auto-discover nearby **enabled** dates in the calendar (next ~3 months) and append them (`auto_fallback_dates_added`)
3. If `--fallback-dates` is provided: try them in order
4. Fail if all candidates exhausted

Note: enabled calendar dates do NOT guarantee inventory. We still require visible enabled **Book** slots to proceed.

### 5.5 Watch Mode (Pre-Drop Polling)

- Start polling 2-3 minutes before expected drop time
- Poll interval: 2 seconds (DOM-based, not API — invisible to Cloudflare)
- Detection method: evaluate JS in browser context to check for visible enabled **"Book"** buttons
- Also check Redux store (`window.store.getState()`) for available counts (`calendar.calendar.ticketGroup`) and experience state (`calendar.offerings.experience[0].state`)
- Do NOT treat enabled calendar dates as inventory; Tsuke/Toshokan expose enabled dates even when fully sold out
- On detection: immediately execute booking flow (no human confirmation needed)
- Resilience: if the page becomes unresponsive, refresh and resume polling

### 5.6 Lock Release

Two mechanisms:
1. **Explicit:** `python3 tock_booker.py --release` — calls `DELETE /api/ticket/unlock` or clicks "Go back" from checkout
2. **Auto-release on exit:** If the script is killed (Ctrl+C, crash, timeout), attempt to release the lock in a cleanup handler
3. Locks also expire naturally after 10 minutes if neither mechanism fires

### 5.7 Timing & Logging

**JSONL event log** — every action gets a timestamped entry:
```json
{"ts_ms": 1711043400000, "event": "start", "restaurant": "taneda", "mode": "watch", "target": {"date": "2026-05-01", "time": "7:45 PM", "party": 2}}
{"ts_ms": 1711043402000, "event": "poll", "available": false, "elapsed_ms": 45}
{"ts_ms": 1711043405000, "event": "availability_detected", "elapsed_ms": 32, "available_slots": ["5:15 PM", "7:45 PM"]}
{"ts_ms": 1711043405200, "event": "click_date", "date": "2026-05-01", "elapsed_ms": 180, "success": true}
{"ts_ms": 1711043405800, "event": "time_slots_loaded", "elapsed_ms": 580, "slots": [{"time": "5:15 PM", "available": true}, {"time": "7:45 PM", "available": true}]}
{"ts_ms": 1711043406000, "event": "click_book", "time": "7:45 PM", "elapsed_ms": 210, "success": true}
{"ts_ms": 1711043408000, "event": "checkout_reached", "elapsed_ms": 1980, "url": "...", "timer_remaining": "9:58", "total": "$664.00"}
```

**Key timing metrics to capture:**
- `poll_interval_ms` — actual time between polls
- `detection_to_click_ms` — availability detected → first click
- `click_date_ms` — date button click → time slots visible
- `click_book_ms` — Book button click → checkout page loaded
- `total_booking_ms` — availability detected → checkout page confirmed
- Each step's individual elapsed time

**Log location:** `scripts/tock-sniper/logs/booker-{restaurant}-{YYYY-MM-DD}-{HHMMSS}.jsonl`

**End-of-run summary** printed to stdout:
```
=== Run Summary ===
Restaurant: Taneda
Mode: watch → live
Target: 2026-05-01 7:45 PM (2 guests)
Result: LOCK ACQUIRED
Total time (detection → checkout): 2.3s
  - Date click: 180ms
  - Time slots load: 580ms  
  - Book click → checkout: 1540ms
Polls before detection: 47
Lock expires: 2026-05-01T14:10:00
```

### 5.8 Notifications (Telegram, Async)

Sent via background thread — zero latency impact on booking flow.

| Event | Message |
|-------|---------|
| Polling started | "Tock Booker: Watching {restaurant} for {date} availability. Polling every 2s." |
| Availability detected | "AVAILABILITY DETECTED: {restaurant} {date}. Booking now..." |
| Lock acquired | "LOCK ACQUIRED: {restaurant}, {date} {time}, {party} guests. Timer: {remaining}. Checkout loaded." |
| Fallback triggered | "Primary slot taken. Trying {fallback_time} on {date}..." |
| Failed | "FAILED: Could not lock any slot for {restaurant} {date}. Reason: {reason}" |
| Lock released | "Lock released for {restaurant}." |

**Telegram delivery:** `POST https://api.telegram.org/bot{TOKEN}/sendMessage`
- Token from Keychain: `security find-generic-password -a openclaw -s telegram-bot-token -w`
- Chat ID: `8063863266`

### 5.9 Restaurant Configurations

Each restaurant config includes:
```python
{
    "slug": str,              # URL slug
    "name": str,              # Display name
    "businessId": int | None, # Tock business ID (None = TBD)
    "experienceId": int,      # Experience/ticket type ID
    "experienceSlug": str,    # URL slug for experience
    "priceType": str,         # PREPAID | DEPOSIT | CARD_HOLD
    "hasAddOns": bool,        # Whether add-on page appears after Book
    "addOnAction": str,       # "skip" | "select_first" — what to do with add-ons
    "partyMin": int,
    "partyMax": int,
    "fixedParty": bool,       # True if party size can't be changed (Tsuke Edomae)
}
```

**Supported restaurants (Phase 1):**
1. Taneda (`taneda`) — Primary target
2. Toshokan (`toshokan`)
3. Tsuke Edomae (`tsukeedomae`)
4. Sushi Bar Austin (`sushibaraustin`)
5. Otoko x Watertrade (`otoko`)
6. Craft Omakase (`craft-omakase-austin`)

### 5.10 Cron Integration

For scheduled drops, the script should be launchable via OpenClaw cron:
```bash
openclaw cron add \
  --name "taneda-april-drop" \
  --schedule "2026-04-18T12:57:00" \
  --command "cd /Users/openclaw/.openclaw/workspace/scripts/tock-sniper && python3 tock_booker.py --restaurant taneda --date 2026-05-01 --time '7:45 PM' --party-size 2 --mode watch --fallback-dates 2026-05-02,2026-05-03"
```

The script must:
- Work headlessly (no interactive prompts)
- Exit with code 0 on success, 1 on failure
- Handle the case where Chrome isn't running or Tock isn't loaded (attempt to launch/navigate)

### 5.11 Error Handling

| Error | Response |
|-------|----------|
| Chrome not reachable on port 18800 | Attempt to launch Chrome. If fails, exit with error + Telegram alert. |
| Not logged into Tock | Navigate to login page. If can't auto-login, exit with error + alert. |
| Experience dialog won't load (10s timeout) | Refresh page, retry once. If still fails, exit + alert. |
| "Book" click doesn't reach checkout (5s timeout) | Check for error text in dialog. Retry with next available slot. |
| Someone else got the slot ("selected by another") | Try next available time, then next date per fallback logic. |
| Page crashes / CDP disconnects | Reconnect up to 3 times with 2s backoff. Then exit + alert. |
| 3 consecutive failures of any kind | Stop, send detailed error to Telegram, exit. |

## 6. Technical Architecture

```
┌─────────────────────────────────────────────────┐
│  tock_booker.py (main orchestrator)             │
│                                                  │
│  ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ Watcher  │ │ Booker   │ │ Event Logger   │  │
│  │ (poll    │→│ (click   │→│ (JSONL +       │  │
│  │  loop)   │ │  engine) │ │  timing stats) │  │
│  └──────────┘ └──────────┘ └────────────────┘  │
│       ↕             ↕              ↕             │
│  ┌─────────────────────────────────────────┐    │
│  │ CDPClient (WebSocket to Chrome:18800)   │    │
│  └─────────────────────────────────────────┘    │
│       ↕                                          │
│  ┌─────────────────────────────────────────┐    │
│  │ Notifier (async Telegram, bg thread)    │    │
│  └─────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
         ↕
┌─────────────────────────────────────────────────┐
│  Chrome (openclaw profile, port 18800)          │
│  Logged into Tock as aliudeloitte@gmail.com     │
└─────────────────────────────────────────────────┘
```

**Dependencies:**
- Python 3.9+
- websocket-client
- CDPClient from `~/.openclaw/skills/cdp-fetch/scripts/cdp_client.py`
- No other external deps

**File structure:**
```
scripts/tock-sniper/
├── tock_booker.py           # Main CLI + orchestrator
├── restaurant_configs.py     # Restaurant config dict
├── event_logger.py           # JSONL logger with timing
├── notifier.py               # Async Telegram notifications
├── logs/                     # Run logs (gitignored)
├── BUILD-SPEC.md            # (old, replaced by this PRD)
└── ...
```

## 7. Success Criteria

### Must Have
- [ ] Reaches checkout page on all 3 bookable restaurants (Sushi Bar, Otoko, Craft Omakase)
- [ ] Watch mode correctly detects availability on a sold-out restaurant when a slot opens
- [ ] Per-step timing in JSONL logs with millisecond precision
- [ ] Telegram notifications sent async (zero booking latency)
- [ ] Fallback logic works (primary time taken → tries next available)
- [ ] Lock release works (explicit command + auto on exit)
- [ ] Run summary printed at end with total timing breakdown

### Should Have
- [ ] Handles add-on pages (Otoko pairings, Toshokan course selection)
- [ ] Cron-launchable (no interactive prompts, proper exit codes)
- [ ] Survives page refresh during watch mode

### Nice to Have
- [ ] Redux store extraction for faster availability detection
- [ ] Screenshot at checkout page saved to logs directory

## 8. Testing Plan

1. **Sushi Bar Austin** — Most available, cheapest deposit. Primary test target.
2. **Craft Omakase** — Prepaid, no add-ons. Tests the PREPAID flow.
3. **Otoko Classic Omakase** — Prepaid with add-on page. Tests the skip-add-ons logic.
4. **Toshokan** — Nearly sold out. Tests watch mode + required add-on selection.
5. **Taneda** — Fully sold out. Tests watch mode with no availability (should poll indefinitely until killed or drop time).
6. **March 21 Recon** — Live dress rehearsal on Taneda's actual drop. Watch mode, DO NOT complete purchase.

## 9. Timeline

| Date | Milestone |
|------|-----------|
| Mar 11 | PRD finalized, research complete |
| Mar 14 | v1 built and tested on Sushi Bar Austin |
| Mar 17 | Tested on all 3 bookable restaurants |
| Mar 19 | Watch mode tested, cron integration done |
| Mar 21 | **RECON: Live test on Taneda March drop** |
| Mar 22+ | Post-recon fixes, speed optimization |
| ~Apr 18 | **LIVE: Taneda April drop for May dates** |

## 10. Critical Technical Findings (from Verification Pass)

### Redux Store Access (CORRECTED)
The Redux store is at `window.store` (NOT `window.__REDUX_STORE__`):
```javascript
window.store.getState()           // Live state
window.$REDUX_STATE               // Initial hydration
```
Key paths:
- Release schedule: `app.config.release`
- Availability: `calendar.calendar.ticketGroup`
- Experience state: `calendar.offerings.experience[0].state` ("AVAILABLE" | "SOLD")
- Business IDs: `app.activeAuth.businessId`, `app.activeAuth.businessGroupId`

### Taneda IDs (RESOLVED)
- businessId: **27534**
- businessGroupId: **20337**
- experienceId: 329211
- Release: March 21 at 11:00 AM PDT (1:00 PM CDT), epoch 1774116000000

### Taneda Fixed Table Seating (CRITICAL)
Taneda does NOT use communal seating. Each table has a FIXED party size:
- Typical config per seating: 4 tables (2+2+2+3 = 9 seats)
- A party of 2 can ONLY book 2-seat tables (3 available per seating, not 4)
- `minPurchaseSize === maxPurchaseSize` per ticket group
- This means fewer bookable slots than the raw "9 seats" suggests

### Reliable DOM Selectors (data-testid)
All Tock restaurants share these stable selectors:
```
[data-testid="consumer-calendar-day"][aria-label="YYYY-MM-DD"]  → date button
[data-testid="booking-card-button"]                              → Book/Notify button
[data-testid="supplement-group-confirm-button"]                  → Next (pairings skip)
[data-testid="purchase-button"]                                  → Complete purchase
[data-testid="holding-time"]                                     → Lock timer
[data-testid="close-button"]                                     → Close dialog
```

### Poll Test Results (Validated March 11, 2026)
DOM-based polling via `Runtime.evaluate` is completely invisible to Cloudflare:
- **1.0s interval, 60s duration:** 54 polls, 0 CF triggers, 0 errors
- **0.5s interval, 120s duration:** 191 polls, 0 CF triggers, 0 errors
- Each poll takes ~35ms steady state (1.5ms when tab is focused)
- Detection latency at 0.5s polling: worst case ~535ms from availability to detection
- For comparison: the old API-based sniper got CF-challenged after 27s / 54 attempts at 0.5s

This confirms the DOM approach is the correct strategy. No API calls needed for detection.

### Checkout URL Pattern (CORRECTED)
- With pairings: `/<slug>/checkout/options` → `/<slug>/checkout/confirm-purchase`
- Without pairings: direct to `/<slug>/checkout/confirm-purchase`
- The "Back" button on pairings page is DISABLED (can't go back to search)

## 11. Open Questions (Reduced)

1. Does Tock show a queue/waiting room during high-traffic drops? (March 21 recon)
2. How does hCaptcha invisible behave during rapid booking? (March 21 recon)
3. Calendar nav buttons are disabled when no dates exist beyond current range — do they auto-enable when the drop happens, or does the page need a refresh? (March 21 recon)
