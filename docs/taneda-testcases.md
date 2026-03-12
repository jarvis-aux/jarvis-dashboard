# Taneda-Relevant Test Cases (Tock Booker)

These test cases are designed to exercise the *same failure modes and timing-critical paths* we expect on **Taneda drop day**, even when we cannot reliably generate real Taneda availability on demand.

## What we care about (Taneda success metrics)

- **Detection correctness:** no false positives (enabled date ≠ inventory)
- **Detection latency:** poll interval + JS eval time
- **Action latency:** availability_detected → click_date → click_book → checkout_reached
- **Robustness under load:** 500s/spinners/re-render races
- **Correct fallback behavior:** if preferred date/time unavailable, lock the closest acceptable alternative

All runs should produce JSONL logs under:
- `scripts/tock-sniper/logs/booker-<restaurant>-<timestamp>.jsonl`

Every log line includes `ts_ms`, `elapsed_ms`, `total_ms`.

---

## A) BookingEngine test cases (Taneda-adjacent, but runnable any time)

These are **live checkout** tests on low-stakes restaurants to validate the speed path we’ll use on Taneda.

### TC-A1: Month navigation / date_not_found
**Why it matters for Taneda:** on drop day, the target month might not be visible when we wake or after refresh.

**Run (Otoko):**
```bash
python3 tock_booker.py -r otoko -d 2026-04-18 -t '8:00 PM' -p 2 -m live --auto-release --no-notify
```
**Expected:**
- First `click_date` may return `date_not_found`
- Then `month_visible` event
- Then `click_date success:true`

### TC-A2: Date disabled (not yet released) → date fallback
**Why it matters:** Taneda’s target dates can be effectively “not bookable” until the flip.

**Run (Otoko):**
```bash
python3 tock_booker.py -r otoko -d 2026-04-03 -t '8:00 PM' -p 2 -m live --auto-release --no-notify
```
**Expected:**
- `click_date error: date_disabled` then `date_unavailable`
- `auto_fallback_dates_added` appears
- Books one of the discovered enabled dates

**Taneda note:** for real Taneda runs, we likely pass explicit `--fallback-dates` (May 1–3) so we never wander into random months.

### TC-A3: Preferred time missing → nearest-time fallback
**Why it matters:** you’ll request 7:45 PM, but only 5:15 exists (or vice versa).

**Run (Otoko):**
```bash
python3 tock_booker.py -r otoko -d 2026-04-18 -t '4:33 PM' -p 2 -m live --auto-release --no-notify
```
**Expected:**
- `time_attempt_order` logged
- Attempts are ordered: preferred first, then nearest Book times

### TC-A4: Add-ons step overhead
**Why it matters:** Taneda may not have add-ons, but add-on handling is a major source of unexpected latency.

**Run:** Otoko live (any date w/ Book)

**Expected:** `addons_handled` exists and cost is measurable (usually ~1s).

### TC-A5: Checkout behavior: hold vs auto-release
**Why it matters:** on recon, we want to inspect checkout; on automated tests we want release.

- Default: hold at checkout
- `--auto-release`: screenshot → wait 15s → release

---

## B) Watcher/detection correctness tests (directly relevant to Taneda)

### TC-B1: Sold-out watch loop (no false positives)
**Why it matters:** Taneda is SOLD for long periods. We must not mis-trigger.

**Run (Taneda):**
```bash
python3 tock_booker.py -r taneda -d 2026-05-01 -t '7:45 PM' -p 2 -m watch \
  --watch-duration 30 --poll-interval 1.0 \
  --refresh-policy never --no-notify
```
**Expected:**
- repeated polls with `available:false`
- no `availability_detected`

### TC-B2: Enabled dates ≠ inventory
**Why it matters:** Tsuke/Toshokan show enabled dates even when sold out; Taneda may do similar.

**Run:**
```bash
python3 tock_booker.py -r tsukeedomae -d 2026-03-20 -t '6:00 PM' -p 2 -m watch \
  --watch-duration 20 --poll-interval 1.0 \
  --refresh-policy never --no-notify
```
**Expected:**
- No false `availability_detected` based on enabled calendar date

### TC-B3: Refresh policy sanity
**Why it matters:** on drop day, we may need controlled refresh. We must avoid thrash.

**Run (Taneda, short):**
```bash
python3 tock_booker.py -r taneda -d 2026-05-01 -t '7:45 PM' -p 2 -m watch \
  --watch-duration 20 --poll-interval 1.0 \
  --refresh-policy periodic --refresh-interval 5 --refresh-min-interval 5 \
  --no-notify
```
**Expected:**
- `refresh_start` / `refresh_done` appear a few times
- No crashes; polling continues

---

## C) Drop-day rehearsal test cases (the real Taneda learning)

### TC-C1: n/naka weekly scheduled drop (primary rehearsal harness)
**Why it matters:** provides a repeatable “SOLD → AVAILABLE” flip with real concurrency.

**Plan:**
- Start watch **T-3m**
- Run `--auto-release` for supervised checkout tests
- Collect:
  - `server_drop_epoch_ms` (from Redux)
  - `delta_ms` (detection vs drop)
  - detection→checkout timing
  - any 500s/spinners

### TC-C2: Taneda March 21 recon (T-3m → T+10m)
**Why it matters:** it’s the actual target restaurant.

**Run skeleton:**
```bash
python3 tock_booker.py -r taneda -d 2026-05-01 -t '7:45 PM' -p 2 -m watch \
  --watch-duration 900 --poll-interval 1.0 \
  --refresh-policy drop-window --refresh-drop-pre 60 --refresh-drop-post 30 \
  --auto-release --no-notify
```

**Critical:** supply explicit `--fallback-dates` (May 1–3) once we confirm the desired set so we never drift.

**Data to capture:**
- Screenshot before drop (T-30s)
- Event log around drop (T-5s..T+15s)
- Second-wave observation at **drop+10m**

---

## D) Open questions to resolve via these tests

- Does Taneda require refresh to render newly released dates, or does React update in place?
- Which signal flips first under load: Redux experience state, ticketGroup counts, or DOM Book buttons?
- How often do we see click races (`slot_not_found`) on drop day?
- Do we see 500s / error banners that require retry/refresh?
