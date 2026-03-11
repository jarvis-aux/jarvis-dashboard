# Tock Universal Booker — Architecture (Living Doc)

**Status:** Phase 1 implemented (lock → checkout), Phase 2 purchase/CVC out of scope.

This is the master, ongoing architecture document for the **browser-only** Tock Universal Booker / sniper.

## 0) Non‑Negotiables (Design Constraints)

- **Browser-only. No API mutations.**
  - Detection via `Runtime.evaluate` (in-page JS), not HTTP polling.
  - Booking via UI clicks through CDP.
- **Phase 1 scope:** stop at checkout page (lock acquired). Do **not** complete purchase.
- **One restaurant per run.**
- **Two accounts strategy:** bot uses `aliudeloitte@gmail.com` in Chrome; Andrew may race manually on `liuandrewy@gmail.com`.

## 1) Primary Components (Modules)

Source directory: `scripts/tock-sniper/`

- `tock_booker.py` — CLI orchestrator
- `restaurant_configs.py` — restaurant config map (IDs, URLs, behavior flags)
- `tock_selectors.py` — CSS selectors + JS snippets (all `data-testid` based)
- `booker_utils.py` — shared helpers
  - `parse_eval()` (critical: preserves bool/int/str/list from CDP)
  - `normalize_time_string()`, date validation
- `event_logger.py` — JSONL event log with elapsed ms per step
- `notifier.py` — async Telegram notifications (best-effort; currently Keychain token missing)
- `booking_engine.py` — deterministic click-flow to checkout
- `watcher.py` — polling loop (Redux + DOM) + controlled refresh (repull)

## 2) Data Flow Overview

### 2.1 Inputs

- Restaurant key: `--restaurant/-r` (maps to `restaurant_configs.py`)
- Target date/time/party size
- Mode: `live | dry-run | watch`

### 2.2 Outputs

- JSONL run log: `scripts/tock-sniper/logs/booker-<restaurant>-<timestamp>.jsonl`
- Optional screenshot at checkout: `logs/checkout-<restaurant>-<date>.png`
- Terminal run summary (step timing table)

## 3) CDP / Browser Integration

### 3.1 Connecting to the correct tab

CDPClient (`skills/cdp-fetch/scripts/cdp_client.py`) connects by `tab_index` to the *first* Chrome “page” tab.

**Fix implemented:** `tock_booker.py` enumerates `http://127.0.0.1:18800/json/list` and selects a tab whose URL contains the restaurant slug; falls back to any `exploretock.com` tab.

Reason: Chrome can expose Stripe inner pages as `type=page` (e.g., `m.stripe.network/inner.html`), which breaks all JS evaluation.

## 4) Modes and Logic Flows

### 4.1 Mode: `dry-run`

Goal: validate DOM navigation and slot discovery, but **do not click Book**.

Flow:
1. Connect to correct tab
2. `navigate_to_search()`
3. set party size (if applicable)
4. click date
5. scrape slots
6. stop and log `dry_run_stop`

### 4.2 Mode: `live`

Goal: lock a slot and reach checkout; stop.

Flow:
1. Connect to correct tab
2. Navigate + set party size
3. Click date
4. Scrape slots
5. Click Book (preferred time first, else first bookable)
6. Handle add-ons (restaurant-specific)
7. Verify checkout (`holding-time` + `purchase-button` present)
8. Screenshot
9. Cleanup attempts lock release

### 4.3 Mode: `watch`

Goal: poll for availability and then immediately run the booking engine.

Polling methods:
- **Redux path (preferred):** `window.store.getState()`
  - `calendar.offerings.experience[0].state`
  - `calendar.calendar.ticketGroup` (availableTickets, min/max party sizes)
- **DOM path (fallback):** scrape time slot list, look for visible enabled **Book** buttons

Important correction:
- **Enabled calendar dates ≠ inventory exists.**
  - Watch mode must **NOT** treat “enabled date” as availability.
  - Watch mode returns available only if there is at least one visible, enabled Book slot.

When availability is detected:
- Instantiate `BookingEngine`
- Try clicking the target date directly (fast path)
- Then `book(skip_navigation=True, pre_clicked_date=True)`

## 5) Add-ons Handling (Otoko / Toshokan / etc.)

Some restaurants insert intermediate pages (pairings / course selection).

Current strategy:
- `restaurant_configs.py` sets:
  - `hasAddOns: bool`
  - `addOnAction: "skip" | "select_first" | None`
- `booking_engine.handle_addons_page()`:
  - waits for add-on page marker `supplement-group-confirm-button`
  - for `select_first`: click a menu card until Next enables
  - for `skip`: click Next directly

Observed timing:
- Otoko add-ons step adds ~1.0s (`addons_handled`).

## 6) Sold-out Behavior

- `booking_engine.wait_for_time_slots()` now has a SOLD-out detector (`JS.CHECK_SOLD_OUT`) to fail fast in one-shot modes.
- In `watch` mode, SOLD is normal; the watcher continues polling.

## 7) Refresh / Repull Policy (Watch Mode)

Motivation: in production, React state can go stale; we may need periodic refresh, but in tests we want stability.

Flags:
- `--refresh-policy adaptive|never|periodic|drop-window`
- `--refresh-interval` (periodic)
- `--refresh-min-interval` (hard guard)
- `--refresh-drop-pre`, `--refresh-drop-post` (drop-window)

Rules:
- `adaptive` = `drop-window` if Redux release epoch exists, else `periodic`.
- Refresh is implemented by navigating to a pinned URL: `searchUrl + ?size=N&date=YYYY-MM-DD`.

See: `scripts/tock-sniper/WATCH-REFRESH-POLICY.md`

## 8) Lock Release

On cleanup, if `_lock_acquired`:
- attempts `DELETE /api/ticket/unlock` (currently returns 405 in testing)
- navigates away and checks Redux lock state (`checkout.currentLock` / `ticketSubset`)

This is **best-effort** today; “guaranteed immediate unlock” is a later improvement.

## 9) Logging & Timing

Every step logs JSONL with:
- `event`
- `elapsed_ms` (step)
- `total_ms` (run)

This gives us real timing variance across restaurants:
- Sushi Bar live checkout ~5.2s
- Otoko live checkout ~5.2s (includes add-on step)

## 10) Known Gaps / Next Up

- Telegram bot token missing in Keychain (`telegram-bot-token`) → notifier can’t send.
- GitHub repo publish blocked (current token can’t create private repos).
- Immediate server-side unlock endpoint needs correct path/method.
- Phase 2 purchase/CVC (Braintree hosted iframe) out of scope.
