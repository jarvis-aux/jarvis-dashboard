# Implementation Plan Review

**Reviewer:** JARVIS (subagent, critical review pass)
**Date:** 2026-03-11
**Verdict:** Solid foundation with several **correctness bugs** and one **architectural race condition** that will bite you on drop day if not fixed.

---

## 1. Gaps — PRD Requirements Not Addressed

### 1.1 `--release` is a toy implementation
The PRD specifies: *"Explicit: calls `DELETE /api/ticket/unlock` or clicks 'Go back' from checkout."*

The plan's `--release` implementation does `window.history.back()` and hopes for the best. Problems:
- `history.back()` depends on browser history state. If the script navigated multiple pages, `back()` may not go where you think.
- It doesn't verify the lock was actually released.
- There's no fallback to the `DELETE /api/ticket/unlock` API call.
- What if the CDP connection is dead? (The `with CDPClient() as cdp:` block creates a *new* connection — it doesn't know which tab has the checkout page.)

**Fix:** Navigate to the restaurant home page (`exploretock.com/{slug}`) which definitively leaves checkout, then verify via Redux that `checkout.ticketSubset` is null/empty. Or use the unlock API directly.

### 1.2 "Chrome not running" case is hand-waved
PRD §5.10 says: *"Handle the case where Chrome isn't running or Tock isn't loaded (attempt to launch/navigate)."*

The plan catches the `CDPClient.connect()` failure and exits. No Chrome launch attempt. For cron-triggered runs at 12:57 AM when Chrome might have crashed overnight, this is a hard failure with zero recovery.

**Fix:** Add a `_ensure_chrome()` function that checks port 18800, launches Chrome with the correct flags if missing, and waits for CDP to become responsive. The launch command is already in TOOLS.md.

### 1.3 Toshokan `select_first` add-on handling is fragile
The PRD says Toshokan requires course selection. The plan clicks `menu-item-card[0]` and calls it done. But:
- What if the first card is a drink pairing, not the 14-course option?
- The codex3 findings mention `isRequired: false` for Otoko pairings, but don't confirm the Toshokan option group structure. If Toshokan's add-on is `isRequired: true` and has multiple required option groups, clicking one card may not satisfy the form.
- There's no verification that the "Next" button becomes enabled after selecting.

**Fix:** After clicking the first menu-item-card, check that `supplement-group-confirm-button` is not disabled before clicking it. If it is, click additional cards until the button enables. Also: verify this against the live Toshokan page before March 21.

### 1.4 No `--dry-run` implementation in `BookingEngine`
The plan passes `dry_run` to `BookingEngine.__init__()` but never checks it. The `book()` method will click "Book" even in dry-run mode. The PRD says dry-run should *"do everything except click Book."*

**Fix:** Add a check before `click_book_for_time()` / `click_first_available_book()`:
```python
if self.dry_run:
    self.logger.log("dry_run_stop", message="Would click Book here")
    return {"success": True, "dry_run": True, "booked_date": date, "booked_time": target_time}
```

### 1.5 No screenshot at checkout
PRD §7 "Nice to Have" lists: *"Screenshot at checkout page saved to logs directory."*

The main orchestrator does call `cdp.screenshot()` on success, which is good — but `CDPClient` may not have a `screenshot()` method. The cdp-fetch skill's `CDPClient` is a raw websocket wrapper. You'd need `Page.captureScreenshot` via CDP. Verify this method exists or implement it.

### 1.6 Missing `json` import in `booking_engine.py`
`_parse_eval()` calls `json.loads()` but the module doesn't import `json`. Same issue in `watcher.py` — `_parse()` has `import json` inside the method body (works but is ugly and inconsistent).

---

## 2. Risks — What Breaks in Production

### 2.1 The Page Refresh Race Condition (CRITICAL)
This is the single biggest risk in the plan.

**The scenario:** Watch mode detects availability via Redux (`experience.state` flips from `SOLD` to `AVAILABLE`). The plan then says to **refresh the page** so the calendar re-renders with April dates. During this refresh:

1. The page unloads → ~500ms of dead time
2. React app hydrates → ~1-2s
3. Experience dialog opens → ~500ms
4. Calendar renders with new dates → ~200ms

**Total: 2-3 seconds of blind time after detecting availability, during which other humans are already clicking.**

But it gets worse. The Redux store detection doesn't require a visible calendar — it works from the store object in memory. If the store shows availability, the calendar component *might already be re-rendering reactively*. The refresh may be unnecessary and actively harmful.

**The race:** Between "refresh the page" and "other humans click Book", you lose 2-3 seconds. For Taneda, where slots are 3 two-tops per seating (6 slots for party of 2), losing 3 seconds could mean losing all slots.

**Fix options:**
1. **Don't refresh.** After Redux detection, try clicking the date button directly. If it works (date was already rendered), skip the refresh entirely. Only refresh if the date click fails (`date_not_found` or `date_disabled`).
2. **Navigate to the specific date URL** instead of refreshing: `exploretock.com/taneda/search?date=2026-05-01&size=2&experience=329211` — this may pre-load the correct date.
3. **Use the API as a fallback speed path:** If DOM is stale, hit `POST /api/consumer/offerings` directly to get slot data, then `PUT /api/ticket/group/lock` to lock. The protobuf approach from the old sniper still works and is faster than waiting for DOM.

### 2.2 `_parse_eval()` is a fragile mess
Every method calls `_parse_eval()` which tries to handle three different result shapes. The JS snippets return `JSON.stringify(...)` so the CDP result will be a string that needs one `json.loads()`. But the code checks for `result.get("raw")`, then checks if `raw` is a string, dict, or list, with multiple fallback paths.

**Risk:** If `CDPClient.evaluate()` changes its return format (or already returns parsed JSON), half the selectors will silently return empty dicts. Every method then checks `data.get("ok")` which will be `None` (falsy) — so failures will look like "slot not found" rather than "parsing broken."

**Fix:** Write a single integration test that calls each JS snippet through `CDPClient.evaluate()` on a live page and asserts the parsed result structure. Do this BEFORE building the engine. If the parse layer is wrong, everything downstream is wrong.

### 2.3 CDPClient `connect()` tab selection
`CDPClient()` connects to port 18800 and picks a tab. Which tab? If multiple tabs are open, it may pick the wrong one. The plan doesn't specify target tab selection.

**Fix:** After `connect()`, check `window.location.href` — if it's not a Tock page, navigate to the restaurant search URL. The plan does this in `navigate_to_search()`, but only if the user runs in `live`/`watch` mode. The `--release` command just connects and runs JS on whatever tab it finds.

### 2.4 Taneda fixed-party table filtering during booking
The plan correctly identifies that Taneda uses `minPurchaseSize === maxPurchaseSize` and filters in Redux polling. But the *booking flow* doesn't account for this. When `click_book_for_time()` runs, it clicks the first "Book" button matching the time string. If Tock shows multiple tables for the same time (e.g., a 2-top and a 3-top both at 5:15 PM), the JS will click whichever appears first in DOM order — which might be the 3-top that a party of 2 can't actually book.

**Likelihood:** Low — Tock's UI probably only shows bookable tables for the selected party size. But verify this during testing. If Tock shows all tables regardless, the click will fail silently (the server will reject the lock for wrong party size).

### 2.5 `time.sleep()` accumulation
The plan uses `time.sleep()` liberally: 0.25s in wait loops, 0.3s after calendar nav, 0.5s in dialog detection. These add up. In the critical path (date click → time slots → Book click → checkout), sleeps alone could total 1-2 seconds.

**Fix:** Use exponential backoff starting from a shorter sleep (50ms → 100ms → 200ms → ...) instead of fixed 250ms. For the booking flow (not watch mode), every millisecond matters.

---

## 3. Architecture Concerns

### 3.1 `selectors.py` name collision
Python has a built-in `selectors` module (for I/O multiplexing). Naming your module `selectors.py` will shadow it. If any dependency (including `websocket-client`) imports `selectors`, it will get your CSS selectors instead. This is a **latent import bomb**.

**Fix:** Rename to `tock_selectors.py` or `dom_selectors.py`.

### 3.2 Circular dependency potential
`watcher.py` imports `BookingEngine` from `booking_engine.py`. If `booking_engine.py` ever needs watcher logic (e.g., to re-poll after a failed Book click), you get a circular import. Currently safe, but the architecture invites it.

**Mitigation:** The current design is fine. Just be aware of this if you add "retry with re-poll" logic later.

### 3.3 CDP connection shared across modules
`BookingEngine`, `Watcher`, and `tock_booker.py` all share the same `CDPClient` instance. The `Watcher._reconnect_cdp()` method calls `cdp.close()` then `cdp.connect()`, which will invalidate the connection for the `BookingEngine` that `Watcher` subsequently creates.

**Risk:** If `_reconnect_cdp()` fires during a poll, the new `BookingEngine` instance created afterward gets the reconnected client — which is fine. But if reconnection partially fails (connection object in an inconsistent state), the BookingEngine will inherit a broken client.

**Fix:** After `_reconnect_cdp()`, verify the connection by running a trivial `evaluate('1+1')` before proceeding.

### 3.4 `_parse_eval` is duplicated
Both `BookingEngine._parse_eval()` and `Watcher._parse()` do the same thing with slightly different implementations. Watcher's version has `import json` inside the method body.

**Fix:** Put `_parse_eval` in a shared utility module, or on a base class. Not a blocker, but technical debt from day one.

---

## 4. Selector Reliability

### 4.1 `data-testid` durability
The `data-testid` selectors are the strongest choice available. They're explicitly intended for testing, which means:
- They survive CSS refactors (class name changes)
- They survive component restructuring (as long as the component exists)
- They're less likely to be removed than class names

**But:** Tock is a SaaS product with regular deploys. If they refactor their experience dialog component (e.g., switch from Material UI to a custom component), testids could change or disappear. The plan has no detection for "selectors stopped working."

**Fix:** Add a "health check" mode that validates all critical selectors are present on the page:
```bash
python3 tock_booker.py --health-check -r sushibaraustin
```
Run this weekly or before each drop to catch breakage.

### 4.2 `aria-label` date format assumption
The plan assumes `aria-label="2026-05-01"` (ISO format). The codex3 findings confirm this for current restaurants. But `aria-label` is an accessibility attribute — Tock could change it to human-readable format ("May 1, 2026") in a future update.

**Mitigation:** The current format is confirmed across 3 restaurants. Low risk, but the health check above would catch this.

### 4.3 `textContent.trim() === "Book"` localization risk
If Tock ever adds internationalization, "Book" could become "Réserver" or "予約". Extremely unlikely for a US-focused product, but worth noting.

---

## 5. Timing Realism

### 5.1 The 35ms eval measurement is misleading
The poll test showed 35ms per `cdp.evaluate()`. This measures *JavaScript execution time inside the browser*. It does not include:
- WebSocket round-trip latency (CDP command → Chrome → response): ~5-15ms
- DOM render latency after a click (React reconciliation): ~100-500ms
- Network latency for Tock's API calls triggered by clicks (date selection triggers `/api/consumer/offerings`): ~200-1000ms

**Real-world timing estimate:**
| Step | Plan estimate | Realistic estimate |
|------|--------------|-------------------|
| Click date → time slots render | "500ms" | 500-2000ms (depends on Tock API latency + React render) |
| Click Book → checkout load | "1-2s" | 1-3s (includes lock API call + page navigation + React hydration) |
| Total detection → checkout | "~5-8s" (PRD) | 3-8s (if no refresh needed), 5-12s (if refresh needed) |

The plan's timing budget is optimistic but not unreasonable. The real risk is the refresh adding 2-3s (see §2.1).

### 5.2 Poll interval vs. detection latency
With a 2-second poll interval, the average detection latency is 1 second (half the interval). In the worst case, you detect 2 seconds after the drop. For Taneda with 6 bookable slots for party of 2, a 2-second head start is the difference between success and "all sold out."

**Suggestion:** For known drop times, tighten the poll interval to 500ms starting 30 seconds before the drop, then relax back to 2s. The additional load is trivial (4 evals/sec vs. 0.5 evals/sec) and buys you up to 1.5 seconds.

---

## 6. Watch Mode Race Condition (Detailed)

### 6.1 Redux detection → page refresh → calendar stale
Elaborated in §2.1. The core question is: **Does the React calendar component reactively update when `window.store` changes, or does it cache from the initial server render?**

If reactive: no refresh needed. Just click the date.
If cached: refresh is necessary, and you lose 2-3 seconds.

**The plan assumes cached** (hence the refresh). This is the safer assumption but the slower path.

**Experiment needed before March 21:** On a restaurant with known date changes (Sushi Bar, which adds dates on a rolling basis), observe whether the calendar updates when the Redux store changes without a page refresh. This can be tested by:
1. Opening the experience dialog
2. Waiting for a new date to be added server-side
3. Checking if the calendar button enables without refresh

If the calendar IS reactive, the plan can skip the refresh and save 2-3 seconds.

### 6.2 Availability window between detection and booking
After the drop, slots are available for maybe 10-60 seconds before they're all locked. The plan's flow is:

1. Detect via Redux (~0-2s poll latency)
2. Refresh page (~2-3s) ← **this is the danger zone**
3. Wait for dialog (~0.5-1s)
4. Click date (~0.2s)
5. Wait for time slots (~0.5-2s)
6. Click Book (~0.2s)
7. Wait for checkout (~1-3s)

**Total: 4.4-11.7 seconds.** If other snipers (human or bot) are completing in 3-5 seconds, you're behind.

### 6.3 What if refresh changes availability?
The plan doesn't handle the case where:
1. Redux shows availability for 7:45 PM
2. Page refreshes (2-3 seconds pass)
3. After refresh, 7:45 PM is now sold out (someone else locked it during the refresh)
4. The booking engine tries `click_book_for_time("7:45 PM")` → fails
5. Fallback kicks in, tries next available slot

This is handled by the fallback cascade, so it's not a *bug* — but it means the refresh can cause you to lose your preferred slot even though you detected it first.

---

## 7. Concurrency — Threading Risks

### 7.1 Notifier queue is fine
The `Notifier` uses a standard `Queue` with a single daemon worker thread. This is textbook producer-consumer. The `Queue` is thread-safe. No issues here.

### 7.2 CDPClient is NOT thread-safe
The `CDPClient` uses a single websocket connection. If the notifier thread (or any future thread) calls `cdp.evaluate()` concurrently with the main thread, websocket messages will interleave and responses will be mismatched. 

**Current risk:** Low — only the main thread uses CDP. The notifier only uses `urllib.request`. But if anyone adds "send screenshot via Telegram" to the notifier (which would require CDP), it breaks.

**Fix:** Document explicitly: "CDP is main-thread only. Notifier must NEVER call CDP methods."

### 7.3 Signal handler + atexit interaction
The plan registers both `atexit.register(cleanup)` and signal handlers for SIGINT/SIGTERM that call `cleanup()` then `sys.exit()`. But `sys.exit()` raises `SystemExit`, which triggers `atexit` handlers. So `cleanup()` will run **twice** on Ctrl+C: once from the signal handler, once from atexit.

**Risk:** Double-calling `cdp.evaluate('window.history.back()')` is harmless (back on a non-checkout page is a no-op). Double-calling `cdp.close()` might raise on an already-closed socket. `notifier.stop()` sends `None` to the queue twice — the second one will sit in the queue after the worker has exited.

**Fix:**
```python
_cleanup_done = False
def cleanup(*_args):
    global _cleanup_done
    if _cleanup_done:
        return
    _cleanup_done = True
    # ... rest of cleanup
```

---

## 8. Signal Handling — Ctrl+C Lock Release

### 8.1 The lambda signal handlers are incorrect
```python
signal.signal(signal.SIGINT, lambda *a: (cleanup(), sys.exit(130)))
```

This has a subtle bug. `cleanup()` calls `cdp.evaluate()` which does a websocket send/receive. If the signal arrives during another `cdp.evaluate()` call (which is likely — the main thread spends most of its time in CDP evals), you get a websocket send inside another websocket send. The `websocket-client` library is not reentrant.

**Best case:** The cleanup `evaluate()` times out or gets a garbled response, then `sys.exit()` runs.
**Worst case:** Deadlock on the websocket lock (if `websocket-client` uses one internally), and the process hangs on Ctrl+C.

**Fix:** The signal handler should set a flag that the main loop checks, rather than performing I/O directly:
```python
_shutdown = False
def _handle_signal(sig, frame):
    global _shutdown
    _shutdown = True

signal.signal(signal.SIGINT, _handle_signal)
signal.signal(signal.SIGTERM, _handle_signal)
```

Then in the main loop / watch loop, check `if _shutdown: break` and do cleanup after the loop exits normally. This is the standard Python pattern for graceful shutdown.

### 8.2 Lock release is best-effort
The PRD says lock release should work on Ctrl+C. The plan attempts `window.history.back()` in the cleanup handler. But if CDP is disconnected (the very reason you might be Ctrl+C-ing), this will silently fail. The lock will expire after 10 minutes anyway, so this is acceptable — but the PRD should document that Ctrl+C lock release is best-effort, not guaranteed.

---

## 9. Specific Code Issues

### 9.1 JS format string injection vulnerability
`JS.CLICK_DATE.format(date="2026-05-01")` uses Python `.format()` on a JS template with double braces `{{`/`}}`. This is correct for the existing templates. But if a `date` value ever contains `"` or `\`, it will break the JS string literal and potentially allow injection.

**Current risk:** Zero — dates are validated as `YYYY-MM-DD` format. But add input validation anyway:
```python
import re
if not re.match(r'^\d{4}-\d{2}-\d{2}$', target_date):
    raise ValueError(f"Invalid date format: {target_date}")
```

### 9.2 `CLICK_BOOK_FOR_TIME` time format assumption
```javascript
timeEl.textContent.trim() === "{time}"
```
If the user passes `--time "7:45PM"` (no space), it won't match Tock's "7:45 PM" (with space). The plan doesn't normalize time input.

**Fix:** Normalize the time string before matching: strip extra spaces, ensure space before AM/PM. Or do case-insensitive comparison in the JS.

### 9.3 `navigate_to_search` dialog detection is fragile
```python
result = self.cdp.evaluate(JS.DIALOG_VISIBLE)
if result.get("raw") == True or result.get("raw") == "true":
```
This checks for both boolean `True` and string `"true"`. But `DIALOG_VISIBLE` returns `JSON.stringify(el !== null)` which will always be a string `"true"` or `"false"`. The `result.get("raw") == True` branch will never match. Not a bug (the `"true"` branch works), but dead code that suggests confusion about the return type.

### 9.4 `SET_PARTY_SIZE` regex in JS
```javascript
var m = el.textContent.match(/(\\d+)/);
```
The double backslash `\\d` is correct in the Python string (it becomes `\d` in JS). But this is fragile — if Tock changes the guest selector text from "Party size 2 guests" to "2 guests" or "For 2 people", the regex still works. If they change to "Two guests", it breaks. Low risk.

### 9.5 `release_lock()` doesn't actually release via API
The method navigates to the restaurant home page and then checks Redux. But navigating away from checkout doesn't call the unlock API — it just abandons the page. The lock will hold for up to 10 minutes on the server. This means your "release" doesn't actually free the slot immediately.

**Fix:** Before navigating away, call the unlock API:
```javascript
fetch('/api/ticket/unlock', { method: 'DELETE', credentials: 'same-origin' })
```
Or find the lock ID from Redux and call the specific unlock endpoint.

### 9.6 `watch_and_book` creates a new `BookingEngine` after detection
```python
engine = BookingEngine(cdp=self.cdp, ...)
return engine.book(target_date=self.target_date, ...)
```
The `book()` method starts by calling `navigate_to_search()`, which navigates to the search URL. But we're ALREADY on the search page (that's where the watcher was polling). This navigation is redundant and adds ~3 seconds.

**Fix:** Add a `skip_navigation` parameter to `book()` that skips `navigate_to_search()` when the watcher has already loaded the page. Even better: pass the watcher's current page state to the engine so it can skip steps that are already done.

### 9.7 Poll count is incremented on the wrong branch
In `Watcher.poll_once()`:
```python
self.logger.increment_poll()
return {"available": False, "method": None, "slots": []}
```
The poll count is only incremented when both Redux AND DOM return unavailable. If Redux returns available, the poll that detected availability isn't counted. Minor bookkeeping issue.

---

## 10. Suggestions

### 10.1 Add an adaptive poll rate for drop mode
```python
# 30 seconds before known drop time: poll every 200ms
# Normal watch mode: poll every 2s
drop_epoch = self._get_drop_epoch()  # from Redux release schedule
if drop_epoch and (drop_epoch - time.time() * 1000) < 30000:
    effective_interval = 0.2
else:
    effective_interval = self.poll_interval
```

The release schedule epoch (1774116000000 for Taneda) is available in Redux. Use it.

### 10.2 Don't refresh after Redux detection — try DOM first
Before refreshing the page, try clicking the target date directly:
```python
if poll_result["available"]:
    # Try clicking without refresh first
    click_result = cdp.evaluate(JS.CLICK_DATE.format(date=self.target_date))
    if click_result.ok:
        # Calendar was already updated reactively! Skip refresh.
        proceed_to_book_from_slots()
    else:
        # Calendar stale, refresh needed
        navigate_to_search_and_book()
```
This could save 2-3 seconds if React is reactive.

### 10.3 Add a "speed test" mode
Run the full flow (excluding the actual Book click) against Sushi Bar and report per-step timing. This gives a baseline before the Taneda drop:
```bash
python3 tock_booker.py -r sushibaraustin -d 2026-03-20 -t "8:15 PM" -m speed-test
```

### 10.4 Log the Redux release epoch for timing analysis
In watch mode, log the server's expected drop time alongside your poll times. This lets you analyze how fast your detection was relative to the drop:
```json
{"event": "availability_detected", "server_drop_epoch_ms": 1774116000000, "detection_ts_ms": 1774116001234, "delta_ms": 1234}
```

### 10.5 Pre-navigate calendar during watch mode
While polling, navigate the calendar to the target month (April) preemptively. Even if the dates are disabled, having the correct month visible means one fewer step after detection. The plan's `navigate_to_month()` can handle disabled dates — it just needs the month to be visible.

### 10.6 Consider a hybrid API+DOM approach for lock acquisition
The flow comparison doc confirms the API sequence: `PUT /api/ticket/group/lock`. If the DOM path is too slow (refresh + render + click), have a fallback that fires the lock API directly with the ticket group ID obtained from Redux. This bypasses the entire click sequence. Yes, it's more fragile (protobuf may change, Cloudflare may block), but as a *fallback* when DOM is slow, it could save a run.

### 10.7 Validate party size against Taneda's actual table configs
The plan validates `partyMin <= party_size <= partyMax` (1-4 for Taneda). But Taneda's fixed tables mean that a party of 1 can only book a... 1-seat table? Do 1-seat tables exist? The codex3 findings show tables of size 2 and 3 only. A party of 1 might not have any bookable tables despite being within the config's `purchaseSize` range.

**Fix:** During testing, verify what happens when you set party size to 1 on Taneda. If no slots appear, add a warning.

### 10.8 File handle leak in `EventLogger`
`EventLogger.__init__` opens a file handle (`self._fh`) but `close()` must be called explicitly. If an exception occurs before `atexit` registers or before `close()` is called, the file handle leaks. Not critical (OS cleans up on exit), but use a context manager or ensure `close()` in a `finally` block.

### 10.9 Account mismatch
The PRD says: *"Primary account: aliudeloitte@gmail.com (patronId 233120906)"*. But TOOLS.md lists TWO accounts:
- `tock-jwt-liuandrewy` — patronId 268964 (primary, for Toshokan)
- `tock-jwt-aliudeloitte` — patronId 233120906 (testing)

The plan doesn't address which account to use or how to switch. The Chrome profile is logged in as aliudeloitte. If Andrew wants to book Toshokan under liuandrewy, the plan can't handle it. This is explicitly out of scope per PRD ("No account switching — single account per run"), but worth noting for Phase 2.

---

## Summary: Priority Fixes Before March 21

| Priority | Issue | Section | Effort |
|----------|-------|---------|--------|
| **P0** | Page refresh race condition — try DOM click before refresh | §2.1, §10.2 | 1 hour |
| **P0** | Signal handler reentrance bug — use flag instead of lambda | §8.1 | 30 min |
| **P0** | `selectors.py` name collision with stdlib | §3.1 | 5 min rename |
| **P0** | `dry_run` flag never checked in BookingEngine | §1.4 | 15 min |
| **P1** | Double-cleanup on Ctrl+C — add guard flag | §7.3 | 10 min |
| **P1** | Watcher creates BookingEngine that re-navigates unnecessarily | §9.6 | 30 min |
| **P1** | Add adaptive poll rate near known drop time | §10.1 | 30 min |
| **P1** | Validate `_parse_eval` against live CDP output | §2.2 | 1 hour |
| **P1** | Time string normalization (space before AM/PM) | §9.2 | 15 min |
| **P2** | `release_lock()` should call unlock API, not just navigate away | §9.5 | 30 min |
| **P2** | Chrome auto-launch for cron runs | §1.2 | 1 hour |
| **P2** | Add health-check mode for selector validation | §4.1 | 1 hour |
| **P2** | Pre-navigate calendar to target month during watch | §10.5 | 30 min |
| **P2** | Missing `json` import in `booking_engine.py` | §1.6 | 1 min |

**Bottom line:** The architecture is sound. The module split is clean. The selector choices are correct. The main risks are (1) the page refresh adding latency during the critical 10-second booking window, and (2) the signal handler performing I/O in an unsafe context. Fix those two and this plan is ready to build against.
