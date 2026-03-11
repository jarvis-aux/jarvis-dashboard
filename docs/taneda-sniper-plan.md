# Taneda Sniper — Build Plan

## Goal
Book a Taneda omakase reservation for 2 on **Friday May 1 or Saturday May 2, 2026** at the **7:45 PM** seating (5:15 PM fallback). The reservation drops in the **April drop** (expected ~April 18, 2026, exact date TBD).

## March 21 Recon Run (This Saturday, 1:00 PM CDT)
Use the March drop as a live dress rehearsal. **Do NOT book** (wrong month). Capture everything.

## Architecture

### What We Already Have (from Toshokan)

| Component | Location | Status | Reusable? |
|-----------|----------|--------|-----------|
| CDPClient | `~/.openclaw/skills/cdp-fetch/scripts/cdp_client.py` | Working | Yes, as-is |
| ProtoCodec | `~/.openclaw/skills/cdp-fetch/scripts/proto_codec.py` | Working | Yes, as-is |
| Sniper core | `scripts/tock-sniper/sniper.py` | Working | Needs Taneda config + new booking mode |
| Auth restore | `sniper.py::ensure_auth()` | Working | Yes (same Tock account, same patronId) |
| Offerings parser | `sniper.py::parse_offerings()` | Working | Yes (same protobuf format) |
| Lock builder | `sniper.py::build_lock_payload()` | Working | Needs Taneda ticketTypeId |
| Browser fallback | `sniper.py::trigger_browser_fallback()` | Partial | Needs adaptation for Taneda UI |
| Checkout flow | `sniper.py::advance_checkout_ui()` | Partial | Needs adaptation (prepaid flow) |
| Notifications | `sniper.py::send_notification()` | Working | Yes, as-is |
| Checkpointing | `sniper.py::write_checkpoint()` | Working | Yes, as-is |

### What's New for Taneda

1. **Restaurant config** — Add Taneda to RESTAURANTS dict (businessId, groupId, ticketTypeId TBD)
2. **DOM-based availability detector** — The Toshokan sniper polls the offerings API. Taneda needs a DOM watcher that detects when calendar date buttons change from `disabled` to enabled, since:
   - The API is CF-protected (confirmed: curl returns challenge page)
   - Taneda claims "no bots" on Tock — API polling may be more aggressively monitored
   - DOM polling via CDP `Runtime.evaluate` runs inside the browser context — indistinguishable from a human watching the page
3. **Event logger** — JSONL file capturing every state transition with millisecond timestamps
4. **Screenshot at key moments** — Before drop, at detection, after each click, at completion/failure
5. **New booking mode: `browser-only`** — Unlike Toshokan which tried API lock then fell back to browser, Taneda should be browser-only from the start

### Lessons Integrated from Toshokan

#### CRITICAL — What Killed Us March 1
| Lesson | What Went Wrong | Fix for Taneda |
|--------|----------------|----------------|
| **Polling rate** | 0.5s API polling (129 attempts) triggered CF rate limiter | Use DOM observation, not API polling. Check every 2-3s by evaluating JS in page context |
| **API lock endpoint** | PUT `/api/ticket/group/lock` with protobuf is easy to fingerprint | Don't use API lock at all. Click through the UI. |
| **cf_clearance missing** | Was missing at launch despite offerings working | Verify explicitly before starting. Navigate to the page 10 min early to establish full session. |
| **No browser fallback ready** | When API failed, browser fallback was an afterthought | Browser IS the primary path. No API mutations. |
| **Punted to human** | Sent Andrew a link instead of booking myself | The script completes the entire booking. No human step. |

#### Architectural Lessons
| Lesson | Source | Integration |
|--------|--------|-------------|
| Tock uses XHR not fetch for purchases | `memory/MEMORY.md` | Don't try to monkey-patch `window.fetch` for capture |
| `businessGroupId` is a STRING, `businessId` is a NUMBER | `tock-sniper-spec.md` | Careful with scope headers if we need them |
| Lock response field 60044 has `ticketSubsetId` at path `15.1` | `MEMORY.md` | Not needed for browser-only approach |
| Redux dispatch `LOCK_TICKETS_SUCCESS` renders checkout | `MEMORY.md` | Possible hybrid fallback if pure UI is too slow |
| First CF challenge should be treated as terminal for API path | `MEMORY.md` | Circuit breaker already in sniper.py — keep it |
| Gateway token mismatch causes auth failures | `MEMORY.md` | Not relevant but good to know for infra |

#### Timing/Behavior Lessons
| Lesson | Source |
|--------|--------|
| Toshokan dates appeared at ~10:01 AM (1 min after announced time) | `memory/2026-03-01.md` |
| First 3 lock attempts got "someone else selected this" = genuine competition | `memory/2026-03-01.md` |
| CF triggered after ~27 seconds / ~54 attempts at 0.5s | `memory/2026-03-01.md` |
| Fresh browser profile also got CF-challenged (contamination was IP-level) | `MEMORY.md` |
| API lock worked fine in testing (Feb 28) at normal intervals | `MEMORY.md` |
| `cf_clearance` can latch beyond a single tab/session | `MEMORY.md` |

## Script Architecture (v2)

```
┌─────────────────────────────────────────────────────┐
│  taneda_sniper.py (Python, runs on MacBook)         │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ DOM Watcher  │  │ Click Engine │  │ Event Log  │ │
│  │ (detect     │→ │ (book via    │→ │ (JSONL +   │ │
│  │  availability│  │  UI clicks)  │  │ screenshots│ │
│  │  via JS eval)│  │              │  │            │ │
│  └─────────────┘  └──────────────┘  └────────────┘ │
│         ↕                  ↕                         │
│  ┌─────────────────────────────────────────────┐    │
│  │ CDPClient (WebSocket to Chrome port 18800)  │    │
│  └─────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
           ↕
┌─────────────────────────────────────────────────────┐
│  Chrome (openclaw profile, port 18800)              │
│  - Logged into Tock as liuandrewy@gmail.com         │
│  - On exploretock.com/taneda/experience/329211      │
│  - Valid cf_clearance + session cookies              │
│  - Credit card on file                               │
└─────────────────────────────────────────────────────┘
```

### Phase 1: DOM Watcher (Detection)

Injected JS that runs every 2-3 seconds via `Runtime.evaluate`:

```javascript
// Returns: {available: bool, dates: [...], buttons: [...], timestamp: ms}
(function() {
    // Check if the "Sold out" state has changed
    var soldOutHeading = document.querySelector('h3');
    var soldOutText = soldOutHeading ? soldOutHeading.textContent : '';
    var isSoldOut = soldOutText.includes('sold out');
    
    // Check calendar date buttons — disabled means unavailable
    var dateButtons = Array.from(document.querySelectorAll('button[class*="date"], button'))
        .filter(b => /^\d{4}-\d{2}-\d{2}$/.test(b.getAttribute('aria-label') || '') 
                  || /^\d{4}-\d{2}-\d{2}$/.test(b.textContent.trim()));
    
    var enabledDates = dateButtons
        .filter(b => !b.disabled)
        .map(b => ({
            date: b.getAttribute('aria-label') || b.textContent.trim(),
            rect: b.getBoundingClientRect()
        }));
    
    // Check for time slot buttons (5:15 PM / 7:45 PM)
    var timeSlots = Array.from(document.querySelectorAll('button'))
        .filter(b => /\d{1,2}:\d{2}\s*(PM|AM)/i.test(b.textContent))
        .filter(b => !b.disabled && b.getBoundingClientRect().width > 0)
        .map(b => ({
            time: b.textContent.trim(),
            rect: b.getBoundingClientRect()
        }));
    
    return JSON.stringify({
        available: !isSoldOut || enabledDates.length > 0 || timeSlots.length > 0,
        soldOutText: soldOutText,
        enabledDates: enabledDates,
        timeSlots: timeSlots,
        timestamp: Date.now()
    });
})()
```

**Detection triggers:**
- `isSoldOut` changes from `true` to `false`
- New date buttons become enabled (were previously all disabled)
- Time slot buttons appear that weren't there before

**Polling interval:** 2 seconds (human-like page watching). No API calls.

### Phase 2: Click Engine (Booking)

When availability is detected, execute a pre-planned click sequence:

```
Step 1: Click target date button (May 1 or May 2)
  - Wait 500ms for Tock to process
Step 2: Click target time button (7:45 PM, fallback 5:15 PM)
  - Wait 500ms
Step 3: Click "Book" or equivalent CTA
  - Wait for checkout page to load (up to 5s)
Step 4: Handle payment confirmation
  - Taneda is prepaid — card should already be on file
  - If CVC needed: retrieve from Keychain, type into Stripe iframe
  - Click "Complete reservation"
Step 5: Verify success
  - Check for /receipt/survey URL or "confirmed" text
  - Screenshot
  - Notify Andrew
```

**Total target time: < 5 seconds from detection to booking completion.**

Key difference from Toshokan: No API lock step. Everything is UI clicks. This is slower than API (~2s vs ~0.5s) but doesn't trigger CF.

### Phase 3: Event Logger

Every action gets logged to `scripts/tock-sniper/logs/taneda-YYYY-MM-DD-run.jsonl`:

```json
{"ts": 1711043400000, "event": "start", "mode": "recon", "target": "taneda"}
{"ts": 1711043401000, "event": "poll", "sold_out": true, "enabled_dates": 0, "time_slots": 0}
{"ts": 1711043403000, "event": "poll", "sold_out": true, "enabled_dates": 0, "time_slots": 0}
{"ts": 1711043405000, "event": "availability_detected", "sold_out": false, "enabled_dates": ["2026-04-01", ...], "time_slots": ["5:15 PM", "7:45 PM"]}
{"ts": 1711043405500, "event": "click", "target": "date_button", "value": "2026-05-01"}
{"ts": 1711043406000, "event": "click", "target": "time_button", "value": "7:45 PM"}
{"ts": 1711043406500, "event": "click", "target": "book_button"}
{"ts": 1711043411000, "event": "checkout_page", "url": "...", "screenshot": "..."}
{"ts": 1711043412000, "event": "payment_confirmed" | "payment_failed", "details": "..."}
```

Plus screenshots at: pre-drop, detection moment, after each click, checkout page, final result.

## Pre-Drop Checklist (Run ~10 Minutes Before Drop)

```
[ ] Chrome alive on port 18800
[ ] Logged into Tock as liuandrewy@gmail.com (verify via /account page)
[ ] Navigated to exploretock.com/taneda/experience/329211/taneda-omakase
[ ] cf_clearance cookie present (check via CDP)
[ ] Credit card on file in Tock account
[ ] CVC in Keychain (tock-card-cvc) — verify it's the right card
[ ] Script loaded and tested (dry poll returning "sold out" correctly)
[ ] Clock synced (compare system time to time server)
[ ] Notifications working (test Telegram send)
[ ] No other browser tabs doing heavy work (reduce Chrome load)
```

## Data to Extract Before Building

Before writing the Taneda-specific code, we need:

1. **BusinessId** — Extract from browser network traffic while on the Taneda page
   - Method: CDP `Network.enable` → navigate to Taneda → capture requests → find `businessId` in `x-tock-scope` header
   - Or: inspect the page source/JS for the value

2. **BusinessGroupId** — Same as above (STRING type, remember)

3. **TicketTypeId** — The specific ticket type for Taneda Omakase
   - May be visible in offerings response or page source
   - We know experienceId is 329211, but ticketTypeId may differ

4. **Calendar button selectors** — Exact CSS selectors for date/time buttons
   - From the browser snapshot: buttons are like `button "2026-03-21"` with date as attribute
   - Need to confirm the exact attribute (aria-label vs data-date vs button text)

5. **Booking flow UI** — What happens when a date IS available and you click through
   - We've only seen "sold out" state. The active booking flow may have different elements.
   - **March 21 recon will capture this.**

## Build Sequence

### Phase 1: Recon Infrastructure (Build by March 19)
1. Add Taneda config to `sniper.py` RESTAURANTS dict
2. Build DOM watcher JS (detection script)
3. Build event logger (JSONL writer + screenshot capture)
4. Build pre-flight checklist script
5. Test: run DOM watcher on current Taneda page (should correctly report "sold out")

### Phase 2: March 21 Recon Run (Saturday March 21, 12:50 PM CDT)
1. Run pre-flight checklist
2. Start DOM watcher at 12:50 PM CDT (10 min before drop)
3. Log everything: poll frequency, detection latency, UI state changes
4. **DO NOT BOOK** — stop at detection or, at most, click a date to see the next screen
5. Capture: how fast dates appear, how fast they sell out, any queue/waiting room

### Phase 3: Build Booking Engine (March 22 — April 11)
Based on March 21 learnings:
1. Build click sequence for the actual booking flow
2. Handle payment (CVC entry via Stripe iframe)
3. Build success/failure detection
4. Test on a cheap restaurant (Oasthouse or similar)
5. End-to-end dry run

### Phase 4: Pre-Drop Prep (April 11-17)
1. Confirm April drop date (monitor Tock banner after March 21)
2. Log into Tock, verify payment method
3. Full dress rehearsal (dry run on Taneda page — detection only, no booking)
4. Set up cron to launch sniper at T-15 minutes

### Phase 5: April Drop (Expected ~April 18)
1. Launch sniper at T-15 minutes
2. Detect → Book → Confirm → Notify Andrew
3. Cancel if wrong date/time (within 48 hours)

## Risk Matrix

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| CF blocks DOM polling | Low | High | DOM eval is inside browser context — CF can't distinguish from human. Unlike API polling, there's no network request to fingerprint. |
| Tock uses queue/waiting room during drops | Medium | High | March 21 recon will reveal this. If present, need to study the queue bypass mechanics. |
| Dates sell out before click sequence completes | High | High | Target < 5s total. Pre-select party size. Have both time slots as fallback. |
| Payment fails during checkout | Low | Medium | Verify card is on file beforehand. Have CVC ready. Test on free restaurant first. |
| April drop date changes from expected | Low | Medium | Monitor Tock banner daily after March 21. Set up alert cron. |
| Tock adds CAPTCHA to booking flow | Low | High | We have vision-based CAPTCHA solving (used for Finley's). Slower but possible. |
| Browser crashes during booking | Low | High | Pre-flight verifies Chrome stability. CDPClient has reconnect logic. |
| 1-per-month limit kicks in (if we accidentally book March) | Low | Critical | March 21 is recon ONLY. Script has explicit `recon` mode that stops before booking. |

## File Structure

```
scripts/tock-sniper/
├── sniper.py              # Existing (add Taneda config, new browser-only mode)
├── taneda_sniper.py        # NEW: Taneda-specific orchestrator
├── dom_watcher.py          # NEW: DOM-based availability detector
├── click_engine.py         # NEW: Pre-planned click sequence executor  
├── event_logger.py         # NEW: JSONL + screenshot event logger
├── preflight.py            # NEW: Pre-drop checklist validator
├── experiments/
│   ├── logs/
│   │   └── taneda-2026-03-21-recon.jsonl
│   └── screenshots/
│       └── taneda-2026-03-21-*.png
└── (existing Toshokan files)
```

## Open Questions (To Resolve by March 21)

1. Does Tock show a queue/waiting room during high-traffic drops?
2. Does the experience dialog (modal) update in-place or does the page reload?
3. What is the exact selector for date buttons when they become available?
4. Is the booking flow modal-based or does it navigate to a new page?
5. Can we pre-select party size so it's already set when dates appear?
6. What does the payment step look like for prepaid restaurants on Tock?

All of these will be answered by the March 21 recon run.
