# Implementation Plan Amendments

**Date:** 2026-03-11
**Source:** JARVIS review + Codex adversarial review
**Status:** Must-fix before building

## P0 Fixes (Block Building)

### 1. Page Refresh Race Condition → Try DOM Click First
**Problem:** Plan refreshes page after Redux detects availability, losing 2-3 seconds.
**Fix:** After Redux detection, try clicking the target date directly. Only refresh if click returns `date_not_found` or `date_disabled`. React may have already reactively updated the calendar.

```python
# In watcher.py, after availability detected:
click_result = cdp.evaluate(JS.CLICK_DATE.format(date=target_date))
if click_result.ok:
    # Calendar was reactive! Skip refresh, go straight to time slot selection
    proceed_to_book_from_slots()
else:
    # Calendar stale, refresh needed
    navigate_and_book()
```

**Experiment needed before March 21:** Verify if Tock's React calendar updates reactively when Redux store changes, using Sushi Bar as test subject.

### 2. Signal Handler Reentrance → Use Flag Pattern
**Problem:** Lambda signal handlers call `cdp.evaluate()` inside the handler, which is unsafe (websocket reentrance can deadlock).
**Fix:** Signal handler sets a flag, main loop checks it.

```python
_shutdown = False
def _handle_signal(sig, frame):
    global _shutdown
    _shutdown = True

signal.signal(signal.SIGINT, _handle_signal)
signal.signal(signal.SIGTERM, _handle_signal)

# In main/watch loop:
if _shutdown:
    break
# Cleanup happens AFTER loop exits
```

### 3. Rename `selectors.py` → `tock_selectors.py`
**Problem:** Shadows Python's stdlib `selectors` module. Will break `websocket-client` imports.

### 4. Implement `dry_run` Check in BookingEngine
**Problem:** `dry_run` flag is accepted but never checked — engine clicks Book even in dry-run mode.
**Fix:** Add check before `click_book_for_time()`:
```python
if self.dry_run:
    self.logger.log("dry_run_stop", ...)
    return {"success": True, "dry_run": True}
```

## P1 Fixes (Before March 21)

### 5. Double-Cleanup Guard
Add `_cleanup_done` flag to prevent cleanup running twice (signal handler + atexit).

### 6. Skip Navigation When Watcher Already on Page
`Watcher.watch_and_book()` creates a `BookingEngine` that re-navigates to the search URL. Add `skip_navigation=True` parameter since the watcher is already on the correct page.

### 7. Adaptive Poll Rate Near Drop Time
Use the release schedule epoch from Redux to tighten polling:
- Normal watch: 2s interval
- T-30 seconds before known drop: 500ms interval  
- T-5 seconds: 200ms interval

```python
drop_epoch = self._get_drop_epoch()
if drop_epoch:
    delta_ms = drop_epoch - (time.time() * 1000)
    if delta_ms < 5000:
        effective_interval = 0.2
    elif delta_ms < 30000:
        effective_interval = 0.5
```

### 8. Time String Normalization
Normalize `--time` input to match Tock's format (e.g., "7:45PM" → "7:45 PM").

### 9. Validate `_parse_eval` Against Live CDP
Write a standalone test that calls each JS snippet through the real CDPClient and asserts return types.

## P2 Fixes (Before April Drop)

### 10. Lock Release via Unlock API
Use `DELETE /api/ticket/unlock` for immediate release, not just `history.back()`.

### 11. Chrome Auto-Launch for Cron
Add `_ensure_chrome()` that checks port 18800 and launches Chrome if missing (command in TOOLS.md).

### 12. Selector Health Check Mode
`python3 tock_booker.py --health-check -r sushibaraustin` — validates all critical data-testid selectors are present.

### 13. Pre-Navigate Calendar to Target Month During Watch
While polling, navigate the calendar to the target month preemptively so it's visible when dates drop.

### 14. Log Redux Release Epoch for Timing Analysis
```json
{"event": "availability_detected", "server_drop_epoch_ms": 1774116000000, "detection_ts_ms": ..., "delta_ms": ...}
```

## Architecture Notes

- **CDP is main-thread only.** Notifier must NEVER call CDP methods. Document explicitly.
- **`_parse_eval` should be a shared utility**, not duplicated between BookingEngine and Watcher.
- **After `_reconnect_cdp()`, verify connection with trivial eval (`1+1`)** before proceeding.
- **Add input validation** on date format (`YYYY-MM-DD` regex) and time format.
- **`json` import missing** in `booking_engine.py` — add it.
