# Tock Universal Booker — Implementation Plan

**Date:** 2026-03-11
**Status:** Ready for implementation
**Target:** Phase 1 — Navigate to checkout page (lock acquired)

---

## 1. File Structure & Module Breakdown

```
scripts/tock-sniper/
├── tock_booker.py           # CLI entry point + orchestrator
├── booking_engine.py        # Core booking flow (click sequence)
├── watcher.py               # Watch mode polling loop
├── restaurant_configs.py    # Restaurant config dict (EXISTS — extend)
├── event_logger.py          # JSONL logger with timing (EXISTS — extend)
├── notifier.py              # Async Telegram notifications (NEW)
├── selectors.py             # CSS/JS selector constants (NEW)
├── logs/                    # Run logs (gitignored)
└── sniper.py                # Old sniper (keep for reference, do not modify)
```

### Module Responsibilities

| Module | Responsibility | Public API |
|--------|---------------|------------|
| `tock_booker.py` | CLI arg parsing, orchestration, signal handling, run summary | `main()` |
| `booking_engine.py` | Navigate experience dialog → checkout. All CDP click/eval logic | `BookingEngine(cdp, config, logger, notifier)` |
| `watcher.py` | Poll for availability (DOM + Redux), trigger booking on detection | `Watcher(cdp, config, logger, notifier)` |
| `restaurant_configs.py` | Static restaurant configs | `RESTAURANTS: dict`, `get_config(slug) -> dict` |
| `event_logger.py` | JSONL event logging with ms timing | `EventLogger(restaurant, log_dir)` |
| `notifier.py` | Async Telegram via background thread | `Notifier(chat_id, token)` |
| `selectors.py` | All CSS selectors and JS eval snippets as constants | `SEL.*`, `JS.*` |

---

## 2. Selectors Module (`selectors.py`)

All DOM selectors derived from codex3 verification findings. These are `data-testid` based and stable across all restaurants.

```python
"""CSS selectors and JS evaluation snippets for Tock automation."""


class SEL:
    """CSS selectors (for document.querySelector)."""

    # Experience dialog
    MODAL_TITLE = '[data-testid="experience-modal-title"]'
    CLOSE_BUTTON = '[data-testid="close-button"]'
    EXPERIENCE_NAME = '[data-testid="experience-name"]'
    GUEST_SELECTOR = '[data-testid="guest-selector"]'
    GUEST_SELECTOR_TEXT = '[data-testid="guest-selector-text"]'
    GUEST_MINUS = '[data-testid="guest-selector_minus"]'
    GUEST_PLUS = '[data-testid="guest-selector_plus"]'
    SEARCH_BAR = '[data-testid="reservation-search-bar"]'
    DATE_BUTTON = '[data-testid="reservation-date-button"]'

    # Calendar
    CALENDAR = '[data-testid="consumer-calendar"]'
    CALENDAR_FIRST = '[data-testid="calendar-first"]'
    CALENDAR_NEXT = '[data-testid="calendar-next"]'
    MONTH_HEADING_FIRST = '[data-testid="month-heading_calendar-first"]'
    MONTH_HEADING_NEXT = '[data-testid="month-heading_calendar-next"]'
    CAL_PREV_FIRST = '[data-testid="calendar-prev-button_calendar-first"]'
    CAL_NEXT_FIRST = '[data-testid="calendar-next-button_calendar-first"]'
    CAL_PREV_NEXT = '[data-testid="calendar-prev-button_calendar-next"]'
    CAL_NEXT_NEXT = '[data-testid="calendar-next-button_calendar-next"]'

    # Date button by specific date (template — use .format(date=...))
    DATE_BY_LABEL = '[data-testid="consumer-calendar-day"][aria-label="{date}"]'

    # Time slots
    SEARCH_RESULT = '[data-testid="search-result"]'
    SEARCH_RESULT_ITEM = '[data-testid="search-result-list-item"]'
    SEARCH_RESULT_TIME = '[data-testid="search-result-time"]'
    REMAINING_TEXT = '[data-testid="communal-count-text"]'
    SEARCH_RESULT_PRICE = '[data-testid="search-result-price"]'
    BOOK_BUTTON = '[data-testid="booking-card-button"]'

    # Pairings / add-ons page
    SUPPLEMENT_GROUP = '[data-testid="supplementGroup-supplements"]'
    SUPPLEMENT_CONFIRM = '[data-testid="supplement-group-confirm-button"]'
    MENU_ITEM_CARD = '[data-testid="menu-item-card"]'
    BACK_BUTTON = '[data-testid="back-button"]'

    # Checkout page
    PURCHASE_BUTTON = '[data-testid="purchase-button"]'
    HOLDING_TIME = '[data-testid="holding-time"]'
    BUSINESS_NAME = '[data-testid="confirmation-business-name"]'
    CONSUMER_RECEIPT = '[data-testid="consumer-receipt"]'
    SERVICE_CHARGE = '[data-testid="service-charge"]'


class JS:
    """JavaScript evaluation snippets (for CDPClient.evaluate)."""

    # Check if experience dialog is visible
    DIALOG_VISIBLE = '''
    (function() {
        var el = document.querySelector('[data-testid="experience-modal-title"]');
        return JSON.stringify(el !== null);
    })()
    '''

    # Get current party size from guest selector text
    GET_PARTY_SIZE = '''
    (function() {
        var el = document.querySelector('[data-testid="guest-selector-text"]');
        if (!el) return JSON.stringify(null);
        var m = el.textContent.match(/(\\d+)/);
        return JSON.stringify(m ? parseInt(m[1]) : null);
    })()
    '''

    # Click date button by aria-label
    # Usage: JS.CLICK_DATE.format(date="2026-05-01")
    CLICK_DATE = '''
    (function() {{
        var btn = document.querySelector('[data-testid="consumer-calendar-day"][aria-label="{date}"]');
        if (!btn) return JSON.stringify({{"error": "date_not_found", "date": "{date}"}});
        if (btn.disabled) return JSON.stringify({{"error": "date_disabled", "date": "{date}"}});
        btn.click();
        return JSON.stringify({{"ok": true, "date": "{date}"}});
    }})()
    '''

    # Get all visible time slots with their Book/Notify state
    GET_TIME_SLOTS = '''
    (function() {
        var items = document.querySelectorAll('[data-testid="search-result-list-item"]');
        var slots = [];
        items.forEach(function(item) {
            var timeEl = item.querySelector('[data-testid="search-result-time"]');
            var btnEl = item.querySelector('[data-testid="booking-card-button"]');
            var remainEl = item.querySelector('[data-testid="communal-count-text"]');
            var priceEl = item.querySelector('[data-testid="search-result-price"]');
            if (timeEl && btnEl) {
                slots.push({
                    time: timeEl.textContent.trim(),
                    action: btnEl.textContent.trim(),
                    remaining: remainEl ? remainEl.textContent.trim() : null,
                    price: priceEl ? priceEl.textContent.trim() : null,
                    disabled: btnEl.disabled || false
                });
            }
        });
        return JSON.stringify(slots);
    })()
    '''

    # Click the Book button for a specific time slot
    # Usage: JS.CLICK_BOOK_FOR_TIME.format(time="7:45 PM")
    CLICK_BOOK_FOR_TIME = '''
    (function() {{
        var items = document.querySelectorAll('[data-testid="search-result-list-item"]');
        for (var i = 0; i < items.length; i++) {{
            var timeEl = items[i].querySelector('[data-testid="search-result-time"]');
            var btnEl = items[i].querySelector('[data-testid="booking-card-button"]');
            if (timeEl && btnEl && timeEl.textContent.trim() === "{time}" && btnEl.textContent.trim() === "Book") {{
                btnEl.click();
                return JSON.stringify({{"ok": true, "time": "{time}"}});
            }}
        }}
        return JSON.stringify({{"error": "slot_not_found", "time": "{time}"}});
    }})()
    '''

    # Click the FIRST available Book button (any time)
    CLICK_FIRST_BOOK = '''
    (function() {
        var items = document.querySelectorAll('[data-testid="search-result-list-item"]');
        for (var i = 0; i < items.length; i++) {
            var timeEl = items[i].querySelector('[data-testid="search-result-time"]');
            var btnEl = items[i].querySelector('[data-testid="booking-card-button"]');
            if (timeEl && btnEl && btnEl.textContent.trim() === "Book" && !btnEl.disabled) {
                btnEl.click();
                return JSON.stringify({"ok": true, "time": timeEl.textContent.trim()});
            }
        }
        return JSON.stringify({"error": "no_bookable_slots"});
    })()
    '''

    # Click the pairings "Next" button (skip add-ons)
    CLICK_SUPPLEMENT_NEXT = '''
    (function() {
        var btn = document.querySelector('[data-testid="supplement-group-confirm-button"]');
        if (!btn) return JSON.stringify({"error": "no_supplement_button"});
        btn.click();
        return JSON.stringify({"ok": true});
    })()
    '''

    # Check if we're on the checkout page (lock confirmed)
    CHECK_CHECKOUT = '''
    (function() {
        var timer = document.querySelector('[data-testid="holding-time"]');
        var purchaseBtn = document.querySelector('[data-testid="purchase-button"]');
        var receipt = document.querySelector('[data-testid="consumer-receipt"]');
        if (timer && purchaseBtn) {
            return JSON.stringify({
                "checkout": true,
                "timer": timer.textContent.trim(),
                "url": window.location.href,
                "hasPurchaseButton": true,
                "hasReceipt": receipt !== null
            });
        }
        return JSON.stringify({"checkout": false, "url": window.location.href});
    })()
    '''

    # Check if we're on the pairings/add-ons page
    CHECK_ADDONS_PAGE = '''
    (function() {
        var supplement = document.querySelector('[data-testid="supplement-group-confirm-button"]');
        var timer = document.querySelector('[data-testid="holding-time"]');
        if (supplement && timer) {
            return JSON.stringify({
                "addons_page": true,
                "timer": timer.textContent.trim(),
                "url": window.location.href
            });
        }
        return JSON.stringify({"addons_page": false, "url": window.location.href});
    })()
    '''

    # Get holding timer value
    GET_TIMER = '''
    (function() {
        var el = document.querySelector('[data-testid="holding-time"]');
        return JSON.stringify(el ? el.textContent.trim() : null);
    })()
    '''

    # Redux: Get offering experience state (AVAILABLE / SOLD)
    REDUX_EXPERIENCE_STATE = '''
    (function() {
        try {
            var state = window.store.getState();
            var exp = state.calendar.offerings.experience;
            if (exp && exp.length > 0) {
                return JSON.stringify({
                    "state": exp[0].state,
                    "name": exp[0].name,
                    "id": exp[0].id
                });
            }
            return JSON.stringify({"error": "no_experience"});
        } catch(e) {
            return JSON.stringify({"error": e.message});
        }
    })()
    '''

    # Redux: Get ticket groups with availability
    REDUX_TICKET_GROUPS = '''
    (function() {
        try {
            var state = window.store.getState();
            var groups = state.calendar.calendar.ticketGroup;
            if (!groups) return JSON.stringify({"error": "no_ticket_groups"});
            var available = groups.filter(function(g) { return g.availableTickets > 0; });
            return JSON.stringify({
                "total": groups.length,
                "available_count": available.length,
                "available": available.map(function(g) {
                    return {
                        "date": g.date,
                        "time": g.time,
                        "available": g.availableTickets,
                        "total": g.numTickets,
                        "minParty": g.minPurchaseSize,
                        "maxParty": g.maxPurchaseSize,
                        "isCommunal": g.isCommunal
                    };
                })
            });
        } catch(e) {
            return JSON.stringify({"error": e.message});
        }
    })()
    '''

    # Redux: Get scheduled release info
    REDUX_RELEASE_SCHEDULE = '''
    (function() {
        try {
            var state = window.store.getState();
            var releases = state.app.config.release;
            return JSON.stringify(releases || []);
        } catch(e) {
            return JSON.stringify({"error": e.message});
        }
    })()
    '''

    # Redux: Get current lock data
    REDUX_LOCK_DATA = '''
    (function() {
        try {
            var state = window.store.getState();
            var checkout = state.checkout;
            return JSON.stringify({
                "currentLock": checkout.currentLock || null,
                "ticketSubset": checkout.ticketSubset || null
            });
        } catch(e) {
            return JSON.stringify({"error": e.message});
        }
    })()
    '''

    # Get current page URL
    GET_URL = 'JSON.stringify(window.location.href)'

    # Check if any date in a target month is enabled (for drop detection)
    # Usage: JS.CHECK_MONTH_DATES.format(month_prefix="2026-05")
    CHECK_MONTH_DATES = '''
    (function() {{
        var btns = document.querySelectorAll('[data-testid="consumer-calendar-day"][aria-label^="{month_prefix}"]');
        var enabled = [];
        btns.forEach(function(b) {{
            if (!b.disabled) enabled.push(b.getAttribute("aria-label"));
        }});
        return JSON.stringify({{"total": btns.length, "enabled": enabled}});
    }})()
    '''

    # Get month headings (to know which months are currently displayed)
    GET_MONTH_HEADINGS = '''
    (function() {
        var first = document.querySelector('[data-testid="month-heading_calendar-first"]');
        var next = document.querySelector('[data-testid="month-heading_calendar-next"]');
        return JSON.stringify({
            "first": first ? first.textContent.trim() : null,
            "next": next ? next.textContent.trim() : null
        });
    })()
    '''

    # Navigate calendar forward (click next month button)
    CLICK_CAL_NEXT = '''
    (function() {
        var btn = document.querySelector('[data-testid="calendar-next-button_calendar-next"]');
        if (!btn) return JSON.stringify({"error": "no_next_button"});
        if (btn.disabled) return JSON.stringify({"error": "next_button_disabled"});
        btn.click();
        return JSON.stringify({"ok": true});
    })()
    '''

    # Increment party size by clicking + button N times
    # Usage: JS.SET_PARTY_SIZE.format(target=2)
    SET_PARTY_SIZE = '''
    (function() {{
        var textEl = document.querySelector('[data-testid="guest-selector-text"]');
        var plusBtn = document.querySelector('[data-testid="guest-selector_plus"]');
        var minusBtn = document.querySelector('[data-testid="guest-selector_minus"]');
        if (!textEl || !plusBtn || !minusBtn) return JSON.stringify({{"error": "guest_selector_not_found"}});
        var current = parseInt(textEl.textContent.match(/(\\d+)/)[1]);
        var target = {target};
        var clicks = 0;
        while (current < target && clicks < 10) {{
            plusBtn.click(); current++; clicks++;
        }}
        while (current > target && clicks < 10) {{
            minusBtn.click(); current--; clicks++;
        }}
        return JSON.stringify({{"ok": true, "party_size": target, "clicks": clicks}});
    }})()
    '''
```

---

## 3. Restaurant Configs (`restaurant_configs.py`) — Extended

Extend the existing file with the missing fields:

```python
"""Restaurant configurations for Tock booker."""

RESTAURANTS = {
    "sushibaraustin": {
        "slug": "sushibaraustin",
        "name": "Sushi Bar Austin Downtown",
        "businessId": 20990,
        "businessGroupId": 19607,
        "experienceId": 365898,
        "experienceName": "Sushi Bar Omakase Experience",
        "experienceSlug": "sushi-bar-omakase-experience",
        "priceType": "DEPOSIT",
        "hasAddOns": False,
        "addOnAction": None,
        "partyMin": 1,
        "partyMax": 6,
        "fixedParty": False,
        "isCommunal": True,
        "searchUrl": "https://www.exploretock.com/sushibaraustin/search",
    },
    "otoko": {
        "slug": "otoko",
        "name": "otoko x watertrade",
        "businessId": 48,
        "businessGroupId": 28709,
        "experienceId": 5276,  # classic omakase
        "experienceName": "classic omakase",
        "experienceSlug": "classic-omakase",
        "priceType": "PREPAID",
        "hasAddOns": True,
        "addOnAction": "skip",  # pairings are optional (isRequired: false)
        "partyMin": 1,
        "partyMax": 4,
        "fixedParty": False,
        "isCommunal": False,
        "searchUrl": "https://www.exploretock.com/otoko/search",
    },
    "craft-omakase-austin": {
        "slug": "craft-omakase-austin",
        "name": "Craft Omakase",
        "businessId": 34594,
        "businessGroupId": None,  # TBD
        "experienceId": 578505,
        "experienceName": "22 Course Tasting Menu",
        "experienceSlug": "22-course-tasting-menu",
        "priceType": "PREPAID",
        "hasAddOns": False,
        "addOnAction": None,
        "partyMin": 1,
        "partyMax": 4,
        "fixedParty": False,
        "isCommunal": False,
        "searchUrl": "https://www.exploretock.com/craft-omakase-austin/search",
    },
    "toshokan": {
        "slug": "toshokan",
        "name": "Toshokan",
        "businessId": 25489,
        "businessGroupId": 18753,
        "experienceId": 483774,
        "experienceName": "Omakase Dinner",
        "experienceSlug": "omakase-dinner",
        "priceType": "CARD_HOLD",
        "hasAddOns": True,
        "addOnAction": "select_first",  # course selection is required
        "partyMin": 1,
        "partyMax": 6,
        "fixedParty": False,
        "isCommunal": False,
        "searchUrl": "https://www.exploretock.com/toshokan/search",
    },
    "tsukeedomae": {
        "slug": "tsukeedomae",
        "name": "Tsuke Edomae",
        "businessId": 9892,
        "businessGroupId": None,  # TBD
        "experienceId": 317530,
        "experienceName": "Omakase",
        "experienceSlug": "omakase",
        "priceType": "DEPOSIT",
        "hasAddOns": False,
        "addOnAction": None,
        "partyMin": 2,
        "partyMax": 2,
        "fixedParty": True,
        "isCommunal": False,
        "searchUrl": "https://www.exploretock.com/tsukeedomae/search",
    },
    "taneda": {
        "slug": "taneda",
        "name": "Taneda",
        "businessId": 27534,
        "businessGroupId": 20337,
        "experienceId": 329211,
        "experienceName": "Taneda Omakase",
        "experienceSlug": "taneda-omakase",
        "priceType": "PREPAID",
        "hasAddOns": False,
        "addOnAction": None,
        "partyMin": 1,
        "partyMax": 4,
        "fixedParty": True,  # CRITICAL: fixed table sizes, min === max per ticket group
        "isCommunal": False,
        "searchUrl": "https://www.exploretock.com/taneda/search",
    },
}


def get_config(slug: str) -> dict:
    """Get restaurant config by slug. Raises KeyError if not found."""
    if slug not in RESTAURANTS:
        available = ", ".join(sorted(RESTAURANTS.keys()))
        raise KeyError(f"Unknown restaurant '{slug}'. Available: {available}")
    return RESTAURANTS[slug]
```

---

## 4. Event Logger (`event_logger.py`) — Extended

Extend the existing logger with restaurant-specific naming and timing helpers:

```python
"""JSONL event logger for Tock booker with timing helpers."""

import json
import os
import time
from datetime import datetime


class EventLogger:

    def __init__(self, restaurant: str = "unknown", log_dir: str = "logs"):
        os.makedirs(log_dir, exist_ok=True)
        ts = datetime.now().strftime("%Y-%m-%d-%H%M%S")
        self.path = os.path.join(log_dir, f"booker-{restaurant}-{ts}.jsonl")
        self._fh = open(self.path, "a")
        self._start_ts = time.time()
        self._step_ts = time.time()  # track per-step timing
        self._poll_count = 0
        self._steps = []  # list of (event, elapsed_ms) for summary

    def log(self, event: str, **kwargs) -> dict:
        """Log an event with ms timestamp and optional key-value data."""
        now = time.time()
        elapsed_ms = round((now - self._step_ts) * 1000)
        total_ms = round((now - self._start_ts) * 1000)
        record = {
            "ts_ms": int(now * 1000),
            "event": event,
            "elapsed_ms": elapsed_ms,
            "total_ms": total_ms,
            **kwargs,
        }
        line = json.dumps(record)
        self._fh.write(line + "\n")
        self._fh.flush()
        print(f"  [{event}] elapsed={elapsed_ms}ms {json.dumps(kwargs)}")
        self._steps.append((event, elapsed_ms))
        self._step_ts = now
        return record

    def mark_step(self):
        """Reset per-step timer (call before a timed operation)."""
        self._step_ts = time.time()

    def increment_poll(self):
        """Increment poll counter."""
        self._poll_count += 1

    @property
    def poll_count(self) -> int:
        return self._poll_count

    @property
    def total_elapsed_ms(self) -> int:
        return round((time.time() - self._start_ts) * 1000)

    def get_summary(self) -> dict:
        """Return timing summary for end-of-run report."""
        return {
            "steps": self._steps,
            "total_ms": self.total_elapsed_ms,
            "poll_count": self._poll_count,
            "log_file": self.path,
        }

    def close(self):
        self._fh.close()
```

---

## 5. Notifier (`notifier.py`)

Async Telegram notifications via background thread. Zero latency impact on booking flow.

```python
"""Async Telegram notification sender. Non-blocking."""

import json
import subprocess
import threading
import urllib.request
from queue import Queue


class Notifier:

    CHAT_ID = "8063863266"

    def __init__(self, enabled: bool = True):
        self.enabled = enabled
        self._queue: Queue = Queue()
        self._token: str | None = None
        self._thread: threading.Thread | None = None
        if enabled:
            self._load_token()
            self._start_worker()

    def _load_token(self):
        """Load Telegram bot token from macOS Keychain."""
        try:
            self._token = subprocess.check_output(
                ["security", "find-generic-password", "-a", "openclaw",
                 "-s", "telegram-bot-token", "-w"],
                stderr=subprocess.DEVNULL,
            ).decode().strip()
        except subprocess.CalledProcessError:
            print("  [NOTIFIER] Warning: telegram-bot-token not in Keychain")
            self._token = None

    def _start_worker(self):
        """Start background thread for sending messages."""
        self._thread = threading.Thread(target=self._worker, daemon=True)
        self._thread.start()

    def _worker(self):
        """Process notification queue."""
        while True:
            msg = self._queue.get()
            if msg is None:
                break
            self._send_telegram(msg)
            self._queue.task_done()

    def _send_telegram(self, text: str):
        """Send message via Telegram Bot API."""
        if not self._token:
            print(f"  [NOTIFIER] (no token) {text}")
            return
        try:
            url = f"https://api.telegram.org/bot{self._token}/sendMessage"
            data = json.dumps({"chat_id": self.CHAT_ID, "text": text}).encode()
            req = urllib.request.Request(
                url, data=data,
                headers={"Content-Type": "application/json"},
            )
            urllib.request.urlopen(req, timeout=10)
        except Exception as e:
            print(f"  [NOTIFIER] Telegram send failed: {e}")

    def send(self, message: str):
        """Enqueue a notification (non-blocking)."""
        print(f"  [NOTIFY] {message}")
        if self.enabled:
            self._queue.put(message)
        # Also write to file as backup
        try:
            with open("/tmp/tock_booker_notification.txt", "a") as f:
                f.write(message + "\n")
        except Exception:
            pass

    def stop(self):
        """Drain queue and stop worker."""
        if self._thread:
            self._queue.put(None)
            self._thread.join(timeout=5)
```

---

## 6. Booking Engine (`booking_engine.py`)

The core click engine. Each method is one atomic step with timing.

```python
"""Core booking flow engine. Drives CDP through the Tock booking UI."""

import time
from cdp_client import CDPClient
from event_logger import EventLogger
from notifier import Notifier
from selectors import JS, SEL


class BookingEngine:

    SEARCH_URL = "https://www.exploretock.com/{slug}/search"
    CHECKOUT_URL_PATTERN = "checkout/confirm-purchase"

    def __init__(
        self,
        cdp: CDPClient,
        config: dict,
        logger: EventLogger,
        notifier: Notifier,
        party_size: int = 2,
        dry_run: bool = False,
    ):
        self.cdp = cdp
        self.config = config
        self.logger = logger
        self.notifier = notifier
        self.party_size = party_size
        self.dry_run = dry_run
        self._lock_acquired = False

    # --- Navigation ---

    def navigate_to_search(self) -> bool:
        pass  # see detailed spec below

    def ensure_dialog_open(self) -> bool:
        pass

    # --- Party Size ---

    def set_party_size(self) -> bool:
        pass

    # --- Calendar Navigation ---

    def navigate_to_month(self, target_date: str) -> bool:
        pass

    def click_date(self, target_date: str) -> dict:
        pass

    # --- Time Slot Selection ---

    def wait_for_time_slots(self, timeout: float = 5.0) -> list:
        pass

    def click_book_for_time(self, time_str: str) -> dict:
        pass

    def click_first_available_book(self) -> dict:
        pass

    # --- Add-ons Handling ---

    def handle_addons_page(self) -> bool:
        pass

    # --- Checkout Verification ---

    def verify_checkout(self, timeout: float = 8.0) -> dict:
        pass

    # --- Lock Release ---

    def release_lock(self) -> bool:
        pass

    # --- Full Booking Flow ---

    def book(self, target_date: str, target_time: str | None = None,
             fallback_dates: list[str] | None = None) -> dict:
        pass
```

### 6.1 Method Specifications

#### `navigate_to_search() -> bool`

```python
def navigate_to_search(self) -> bool:
    """Navigate to restaurant search page. Returns True if dialog is visible."""
    url = self.SEARCH_URL.format(slug=self.config["slug"])
    self.logger.mark_step()
    self.cdp.navigate(url, wait=3)

    # Wait up to 10s for experience dialog to appear
    for _ in range(20):
        result = self.cdp.evaluate(JS.DIALOG_VISIBLE)
        if result.get("raw") == True or result.get("raw") == "true":
            self.logger.log("dialog_visible", url=url)
            return True
        time.sleep(0.5)

    self.logger.log("dialog_timeout", url=url, success=False)
    return False
```

#### `set_party_size() -> bool`

```python
def set_party_size(self) -> bool:
    """Set party size via +/- buttons. Returns True on success."""
    self.logger.mark_step()
    result = self.cdp.evaluate(JS.SET_PARTY_SIZE.format(target=self.party_size))
    data = result if isinstance(result, dict) else {}
    ok = data.get("ok", False) or data.get("raw", {}).get("ok", False)
    # Handle nested JSON from evaluate
    if isinstance(data.get("raw"), dict):
        ok = data["raw"].get("ok", False)
    self.logger.log("set_party_size", target=self.party_size, success=bool(ok))
    return bool(ok)
```

#### `navigate_to_month(target_date: str) -> bool`

This handles scrolling the 2-month calendar to show the target month.

```python
def navigate_to_month(self, target_date: str) -> bool:
    """Scroll calendar until target month is visible. target_date is YYYY-MM-DD."""
    target_month = target_date[:7]  # "2026-05"
    self.logger.mark_step()

    for attempt in range(6):  # max 6 forward clicks
        headings = self.cdp.evaluate(JS.GET_MONTH_HEADINGS)
        raw = headings.get("raw", headings) if isinstance(headings, dict) else {}
        if isinstance(raw, dict):
            first_month = raw.get("first", "")
            next_month = raw.get("next", "")
        else:
            first_month = next_month = ""

        # Check if target month is visible in either panel
        # Month headings are like "May 2026" — we need to match against YYYY-MM
        if self._month_matches(first_month, target_month) or \
           self._month_matches(next_month, target_month):
            self.logger.log("month_visible", target=target_month, attempts=attempt)
            return True

        # Click forward
        result = self.cdp.evaluate(JS.CLICK_CAL_NEXT)
        raw = result.get("raw", result) if isinstance(result, dict) else {}
        if isinstance(raw, dict) and raw.get("error"):
            self.logger.log("month_nav_failed", error=raw["error"], attempt=attempt)
            return False
        time.sleep(0.3)

    self.logger.log("month_nav_exhausted", target=target_month)
    return False

@staticmethod
def _month_matches(heading: str, target_ym: str) -> bool:
    """Check if heading like 'May 2026' matches target like '2026-05'."""
    MONTHS = {
        "January": "01", "February": "02", "March": "03", "April": "04",
        "May": "05", "June": "06", "July": "07", "August": "08",
        "September": "09", "October": "10", "November": "11", "December": "12",
    }
    if not heading:
        return False
    parts = heading.strip().split()
    if len(parts) != 2:
        return False
    month_num = MONTHS.get(parts[0])
    if not month_num:
        return False
    return f"{parts[1]}-{month_num}" == target_ym
```

#### `click_date(target_date: str) -> dict`

```python
def click_date(self, target_date: str) -> dict:
    """Click a date button. Returns {"ok": True, "date": ...} or {"error": ...}."""
    self.logger.mark_step()
    result = self.cdp.evaluate(JS.CLICK_DATE.format(date=target_date))
    data = self._parse_eval(result)
    self.logger.log("click_date", date=target_date, success=data.get("ok", False),
                     error=data.get("error"))
    return data
```

#### `wait_for_time_slots(timeout: float) -> list`

```python
def wait_for_time_slots(self, timeout: float = 5.0) -> list:
    """Wait for time slots to appear after clicking a date. Returns list of slot dicts."""
    self.logger.mark_step()
    deadline = time.time() + timeout

    while time.time() < deadline:
        result = self.cdp.evaluate(JS.GET_TIME_SLOTS)
        slots = self._parse_eval(result)
        if isinstance(slots, list) and len(slots) > 0:
            bookable = [s for s in slots if s.get("action") == "Book"]
            self.logger.log("time_slots_loaded",
                           total=len(slots), bookable=len(bookable),
                           slots=slots)
            return slots
        time.sleep(0.25)

    self.logger.log("time_slots_timeout", timeout=timeout)
    return []
```

#### `click_book_for_time(time_str: str) -> dict`

```python
def click_book_for_time(self, time_str: str) -> dict:
    """Click Book button for specific time. Returns result dict."""
    self.logger.mark_step()
    result = self.cdp.evaluate(JS.CLICK_BOOK_FOR_TIME.format(time=time_str))
    data = self._parse_eval(result)
    self.logger.log("click_book", time=time_str, success=data.get("ok", False),
                     error=data.get("error"))
    return data
```

#### `handle_addons_page() -> bool`

```python
def handle_addons_page(self) -> bool:
    """Handle add-ons/pairings page if present. Returns True if handled or not needed."""
    if not self.config.get("hasAddOns"):
        return True  # no add-ons expected

    self.logger.mark_step()
    # Wait up to 5s for add-ons page to appear
    for _ in range(20):
        result = self.cdp.evaluate(JS.CHECK_ADDONS_PAGE)
        data = self._parse_eval(result)
        if data.get("addons_page"):
            action = self.config.get("addOnAction", "skip")

            if action == "select_first":
                # Toshokan: must select a course option before clicking Next
                select_js = '''
                (function() {
                    var cards = document.querySelectorAll('[data-testid="menu-item-card"]');
                    if (cards.length > 0) { cards[0].click(); return JSON.stringify({"ok": true}); }
                    return JSON.stringify({"error": "no_menu_items"});
                })()
                '''
                self.cdp.evaluate(select_js)
                time.sleep(0.3)

            # Click "Next: Review and purchase"
            result = self.cdp.evaluate(JS.CLICK_SUPPLEMENT_NEXT)
            next_data = self._parse_eval(result)
            self.logger.log("addons_handled", action=action,
                           success=next_data.get("ok", False))
            return next_data.get("ok", False)

        # Check if we skipped addons and went straight to checkout
        checkout = self.cdp.evaluate(JS.CHECK_CHECKOUT)
        checkout_data = self._parse_eval(checkout)
        if checkout_data.get("checkout"):
            self.logger.log("addons_skipped_direct_checkout")
            return True

        time.sleep(0.25)

    self.logger.log("addons_page_timeout")
    return False
```

#### `verify_checkout(timeout: float) -> dict`

```python
def verify_checkout(self, timeout: float = 8.0) -> dict:
    """Wait for checkout page to load. Returns checkout data dict or error."""
    self.logger.mark_step()
    deadline = time.time() + timeout

    while time.time() < deadline:
        result = self.cdp.evaluate(JS.CHECK_CHECKOUT)
        data = self._parse_eval(result)
        if data.get("checkout"):
            self._lock_acquired = True
            self.logger.log("checkout_reached",
                           timer=data.get("timer"),
                           url=data.get("url"))
            return data
        time.sleep(0.3)

    self.logger.log("checkout_timeout", timeout=timeout)
    return {"checkout": False, "error": "timeout"}
```

#### `release_lock() -> bool`

```python
def release_lock(self) -> bool:
    """Release lock by navigating away from checkout."""
    self.logger.mark_step()

    # Method 1: Navigate to restaurant home page (releases lock server-side)
    url = f"https://www.exploretock.com/{self.config['slug']}"
    self.cdp.navigate(url, wait=2)

    # Verify lock released by checking Redux
    result = self.cdp.evaluate(JS.REDUX_LOCK_DATA)
    data = self._parse_eval(result)
    lock = data.get("currentLock") if isinstance(data, dict) else None
    released = lock is None
    self.logger.log("lock_released", success=released)
    self.notifier.send(f"Lock released for {self.config['name']}.")
    self._lock_acquired = False
    return released
```

#### `book(target_date, target_time, fallback_dates) -> dict` — Full Orchestrated Flow

```python
def book(self, target_date: str, target_time: str | None = None,
         fallback_dates: list[str] | None = None) -> dict:
    """
    Execute complete booking flow with fallback cascade.

    Returns dict with:
      - success: bool
      - checkout: dict (timer, url) if successful
      - booked_date: str
      - booked_time: str
      - fallback_used: bool
    """
    all_dates = [target_date] + (fallback_dates or [])

    # Step 1: Navigate to search page, open dialog
    if not self.navigate_to_search():
        # Retry once after refresh
        self.notifier.send(f"Dialog didn't load for {self.config['name']}. Retrying...")
        if not self.navigate_to_search():
            return {"success": False, "error": "dialog_timeout"}

    # Step 2: Set party size
    self.set_party_size()

    # Step 3: Try each date in order
    for date_idx, date in enumerate(all_dates):
        is_fallback = date_idx > 0
        if is_fallback:
            self.notifier.send(
                f"Primary slot taken. Trying {date}...")

        # Step 3a: Navigate calendar to target month
        if not self.navigate_to_month(date):
            self.logger.log("month_unreachable", date=date)
            continue

        # Step 3b: Click target date
        click_result = self.click_date(date)
        if click_result.get("error"):
            self.logger.log("date_click_failed", date=date, error=click_result["error"])
            continue

        # Step 3c: Wait for time slots
        slots = self.wait_for_time_slots()
        bookable = [s for s in slots if s.get("action") == "Book"]
        if not bookable:
            self.logger.log("no_bookable_slots", date=date)
            continue

        # Step 3d: Try preferred time first, then any available
        booked = False
        booked_time = None

        if target_time and not is_fallback:
            # Try preferred time
            result = self.click_book_for_time(target_time)
            if result.get("ok"):
                booked = True
                booked_time = target_time

        if not booked:
            # Fallback: try each bookable slot (earliest first)
            for slot in bookable:
                result = self.click_book_for_time(slot["time"])
                if result.get("ok"):
                    booked = True
                    booked_time = slot["time"]
                    break

        if not booked:
            self.logger.log("all_slots_failed", date=date)
            continue

        # Step 4: Handle add-ons page (if needed)
        if not self.handle_addons_page():
            self.logger.log("addons_failed", date=date)
            # Lock may have been acquired but addons page blocked us
            # Check if checkout is reachable anyway
            checkout = self.verify_checkout(timeout=3.0)
            if not checkout.get("checkout"):
                continue

        # Step 5: Verify checkout page
        checkout = self.verify_checkout()
        if checkout.get("checkout"):
            self.notifier.send(
                f"LOCK ACQUIRED: {self.config['name']}, "
                f"{date} {booked_time}, {self.party_size} guests. "
                f"Timer: {checkout.get('timer')}. Checkout loaded."
            )
            return {
                "success": True,
                "checkout": checkout,
                "booked_date": date,
                "booked_time": booked_time,
                "fallback_used": is_fallback,
            }

    # All dates exhausted
    self.notifier.send(
        f"FAILED: Could not lock any slot for {self.config['name']}. "
        f"Tried dates: {', '.join(all_dates)}"
    )
    return {"success": False, "error": "all_dates_exhausted", "tried": all_dates}

def _parse_eval(self, result: dict) -> dict | list:
    """Parse CDPClient.evaluate result, handling nested JSON."""
    if not isinstance(result, dict):
        return {}
    raw = result.get("raw", result)
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return {"raw": raw}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, list):
        return raw
    return result
```

---

## 7. Watcher (`watcher.py`)

Watch mode polling loop. Dual detection: DOM eval + Redux store.

```python
"""Watch mode — poll for availability, trigger booking on detection."""

import time
from cdp_client import CDPClient
from booking_engine import BookingEngine
from event_logger import EventLogger
from notifier import Notifier
from selectors import JS


class Watcher:

    DEFAULT_POLL_INTERVAL = 2.0  # seconds

    def __init__(
        self,
        cdp: CDPClient,
        config: dict,
        logger: EventLogger,
        notifier: Notifier,
        target_date: str,
        target_time: str | None = None,
        party_size: int = 2,
        poll_interval: float = 2.0,
        dry_run: bool = False,
    ):
        self.cdp = cdp
        self.config = config
        self.logger = logger
        self.notifier = notifier
        self.target_date = target_date
        self.target_time = target_time
        self.party_size = party_size
        self.poll_interval = poll_interval
        self.dry_run = dry_run

    def poll_once(self) -> dict:
        """
        Single poll check. Returns dict:
          - available: bool
          - method: "redux" | "dom" | None
          - slots: list of available slot info (if detected)
        """
        self.logger.mark_step()

        # Strategy 1: Redux store check (faster, more data)
        redux_result = self._check_redux()
        if redux_result["available"]:
            self.logger.log("poll", available=True, method="redux",
                           slots=redux_result.get("slots", []))
            return redux_result

        # Strategy 2: DOM check (backup — works even if Redux stale)
        dom_result = self._check_dom()
        if dom_result["available"]:
            self.logger.log("poll", available=True, method="dom",
                           slots=dom_result.get("slots", []))
            return dom_result

        self.logger.log("poll", available=False)
        self.logger.increment_poll()
        return {"available": False, "method": None, "slots": []}

    def _check_redux(self) -> dict:
        """Check Redux store for available ticket groups matching our criteria."""
        # Check experience state first (fast signal)
        exp_result = self.cdp.evaluate(JS.REDUX_EXPERIENCE_STATE)
        exp_data = self._parse(exp_result)
        if exp_data.get("state") == "SOLD":
            return {"available": False, "method": "redux", "slots": []}

        # If state is AVAILABLE, check ticket groups for our date
        groups_result = self.cdp.evaluate(JS.REDUX_TICKET_GROUPS)
        groups_data = self._parse(groups_result)

        if groups_data.get("error") or groups_data.get("available_count", 0) == 0:
            return {"available": False, "method": "redux", "slots": []}

        # Filter for target date and party size compatibility
        target_month = self.target_date[:7]
        matching = []
        for slot in groups_data.get("available", []):
            slot_date = slot.get("date", "")
            # Match target date, or any date in target month
            if slot_date == self.target_date or slot_date.startswith(target_month):
                # Check party size compatibility
                min_p = slot.get("minParty", 1)
                max_p = slot.get("maxParty", 99)
                if min_p <= self.party_size <= max_p:
                    matching.append(slot)

        if matching:
            return {"available": True, "method": "redux", "slots": matching}
        return {"available": False, "method": "redux", "slots": []}

    def _check_dom(self) -> dict:
        """Check DOM for enabled date buttons and Book buttons."""
        target_month = self.target_date[:7]

        # Check if any dates in target month are enabled
        month_check = JS.CHECK_MONTH_DATES.format(month_prefix=target_month)
        result = self.cdp.evaluate(month_check)
        data = self._parse(result)
        enabled_dates = data.get("enabled", [])

        if not enabled_dates:
            return {"available": False, "method": "dom", "slots": []}

        # Check if there are any "Book" buttons visible
        slots_result = self.cdp.evaluate(JS.GET_TIME_SLOTS)
        slots_data = self._parse(slots_result)

        if isinstance(slots_data, list):
            bookable = [s for s in slots_data if s.get("action") == "Book"]
            if bookable:
                return {
                    "available": True,
                    "method": "dom",
                    "slots": [{"date": d, "time": None} for d in enabled_dates],
                }

        # Dates are enabled but no Book buttons yet — dates exist but may be sold out
        # Still return as available so the booking engine can try clicking
        if self.target_date in enabled_dates:
            return {
                "available": True,
                "method": "dom",
                "slots": [{"date": self.target_date, "time": None}],
            }

        return {"available": False, "method": "dom", "slots": []}

    def watch_and_book(self, fallback_dates: list[str] | None = None,
                       max_duration: float = 600.0) -> dict:
        """
        Main watch loop. Polls until availability detected, then books.

        Args:
            fallback_dates: Additional dates to try if target unavailable
            max_duration: Maximum watch duration in seconds (default 10 min)

        Returns:
            dict with booking result or timeout info
        """
        self.notifier.send(
            f"Tock Booker: Watching {self.config['name']} for {self.target_date} "
            f"availability. Polling every {self.poll_interval}s."
        )
        self.logger.log("watch_start",
                        restaurant=self.config["name"],
                        date=self.target_date,
                        time=self.target_time,
                        party_size=self.party_size,
                        poll_interval=self.poll_interval)

        start = time.time()
        last_status_ping = start
        STATUS_PING_INTERVAL = 90  # seconds

        while (time.time() - start) < max_duration:
            try:
                poll_result = self.poll_once()
            except Exception as e:
                self.logger.log("poll_error", error=str(e))
                # Try to recover: reconnect CDP
                if not self._reconnect_cdp():
                    self.notifier.send(
                        f"FAILED: CDP disconnected while watching {self.config['name']}")
                    return {"success": False, "error": "cdp_disconnect"}
                continue

            if poll_result["available"]:
                self.notifier.send(
                    f"AVAILABILITY DETECTED: {self.config['name']} {self.target_date}. "
                    f"Booking now..."
                )
                self.logger.log("availability_detected",
                               method=poll_result["method"],
                               slots=poll_result.get("slots", []))

                # Immediately execute booking flow
                engine = BookingEngine(
                    cdp=self.cdp,
                    config=self.config,
                    logger=self.logger,
                    notifier=self.notifier,
                    party_size=self.party_size,
                    dry_run=self.dry_run,
                )
                return engine.book(
                    target_date=self.target_date,
                    target_time=self.target_time,
                    fallback_dates=fallback_dates,
                )

            # Periodic status ping
            now = time.time()
            if now - last_status_ping > STATUS_PING_INTERVAL:
                elapsed = now - start
                self.notifier.send(
                    f"Still watching {self.config['name']} | "
                    f"elapsed={elapsed:.0f}s polls={self.logger.poll_count}"
                )
                last_status_ping = now

            time.sleep(self.poll_interval)

        # Timeout
        self.notifier.send(
            f"Watch mode timed out for {self.config['name']} after {max_duration}s. "
            f"Polls: {self.logger.poll_count}"
        )
        return {"success": False, "error": "watch_timeout",
                "polls": self.logger.poll_count}

    def _reconnect_cdp(self, max_retries: int = 3) -> bool:
        """Reconnect CDP with backoff."""
        for attempt in range(max_retries):
            try:
                time.sleep(2 * (attempt + 1))
                self.cdp.close()
                self.cdp.connect()
                self.logger.log("cdp_reconnected", attempt=attempt)
                return True
            except Exception as e:
                self.logger.log("cdp_reconnect_failed", attempt=attempt, error=str(e))
        return False

    @staticmethod
    def _parse(result: dict) -> dict | list:
        """Parse CDPClient.evaluate result."""
        if not isinstance(result, dict):
            return {}
        raw = result.get("raw", result)
        if isinstance(raw, str):
            import json
            try:
                return json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                return {"raw": raw}
        if isinstance(raw, (dict, list)):
            return raw
        return result
```

### 7.1 Watch Mode Polling — Technical Details

**Poll Sequence (each 2s cycle):**

1. **Redux fast check** — `window.store.getState().calendar.offerings.experience[0].state`
   - If `"SOLD"` → skip to sleep (fastest possible "no" — single property access)
   - If `"AVAILABLE"` → proceed to ticket group check

2. **Redux ticket group check** — `window.store.getState().calendar.calendar.ticketGroup`
   - Filter: `availableTickets > 0 && date matches && partySize in range`
   - For Taneda: `minPurchaseSize <= 2 <= maxPurchaseSize` (with fixedParty, this means `minPurchaseSize === 2`)

3. **DOM fallback** — Check enabled date buttons via `aria-label` prefix match
   - Only runs if Redux returns no results (covers stale Redux state edge case)

**Drop Detection for Taneda:**

The Redux `experience[0].state` flipping from `"SOLD"` to `"AVAILABLE"` is the fastest signal. This happens when `app.config.release[0].activeOnEpochMillis` (1774116000000 = March 21, 11:00 AM PDT) is reached and Tock's backend releases the dates.

**Critical: Calendar may need page refresh after drop.**

If the calendar component was rendered with no April dates, the Redux store may not update until the page re-fetches offerings data. The watcher should detect the state flip and trigger a page refresh + dialog re-open before clicking dates:

```python
# In watch_and_book, after availability_detected:
# Refresh the page to ensure calendar has new dates loaded
self.cdp.navigate(
    f"https://www.exploretock.com/{self.config['slug']}/search",
    wait=3
)
# Then proceed with booking engine
```

---

## 8. Main Orchestrator (`tock_booker.py`)

```python
#!/usr/bin/env python3
"""
Tock Universal Booker — CLI entry point and orchestrator.

Usage:
    python3 tock_booker.py --restaurant taneda --date 2026-05-01 --time "7:45 PM" --party-size 2 --mode watch
    python3 tock_booker.py --release
    python3 tock_booker.py --list-restaurants
"""

import argparse
import atexit
import json
import os
import signal
import sys
import time

sys.path.insert(0, os.path.expanduser("~/.openclaw/skills/cdp-fetch/scripts"))

from cdp_client import CDPClient
from restaurant_configs import RESTAURANTS, get_config
from event_logger import EventLogger
from notifier import Notifier
from booking_engine import BookingEngine
from watcher import Watcher


def parse_args():
    parser = argparse.ArgumentParser(description="Tock Universal Booker")
    parser.add_argument("--restaurant", "-r", type=str, help="Restaurant slug")
    parser.add_argument("--date", "-d", type=str, help="Target date YYYY-MM-DD")
    parser.add_argument("--time", "-t", type=str, default=None, help='Preferred time (e.g., "7:45 PM")')
    parser.add_argument("--party-size", "-p", type=int, default=2, help="Number of guests")
    parser.add_argument("--mode", "-m", choices=["live", "watch", "dry-run"], default="live")
    parser.add_argument("--fallback-dates", type=str, default=None,
                        help="Comma-separated fallback dates")
    parser.add_argument("--release", action="store_true", help="Release active lock and exit")
    parser.add_argument("--list-restaurants", action="store_true", help="List supported restaurants")
    parser.add_argument("--no-notify", action="store_true", help="Disable Telegram notifications")
    parser.add_argument("--watch-duration", type=float, default=600.0,
                        help="Max watch mode duration in seconds")
    parser.add_argument("--poll-interval", type=float, default=2.0,
                        help="Watch mode poll interval in seconds")
    return parser.parse_args()


def print_run_summary(result: dict, logger: EventLogger, config: dict, args):
    """Print end-of-run summary to stdout."""
    summary = logger.get_summary()

    print(f"\n{'=' * 50}")
    print(f"=== Run Summary ===")
    print(f"Restaurant: {config['name']}")
    print(f"Mode: {args.mode}")
    print(f"Target: {args.date} {args.time or '(any)'} ({args.party_size} guests)")

    if result.get("success"):
        print(f"Result: LOCK ACQUIRED")
        print(f"Booked: {result.get('booked_date')} {result.get('booked_time')}")
        print(f"Fallback used: {result.get('fallback_used', False)}")
        checkout = result.get("checkout", {})
        print(f"Timer remaining: {checkout.get('timer', 'unknown')}")
        print(f"Checkout URL: {checkout.get('url', 'unknown')}")
    else:
        print(f"Result: FAILED — {result.get('error', 'unknown')}")

    print(f"Total time: {summary['total_ms']}ms")
    print(f"Polls: {summary['poll_count']}")
    print(f"Log file: {summary['log_file']}")

    # Per-step breakdown
    print(f"\nStep timing:")
    for event, elapsed in summary["steps"]:
        print(f"  {event}: {elapsed}ms")

    print(f"{'=' * 50}")


def main():
    args = parse_args()

    # --- List restaurants ---
    if args.list_restaurants:
        print("Supported restaurants:")
        for slug, cfg in sorted(RESTAURANTS.items()):
            print(f"  {slug:25s} {cfg['name']:30s} {cfg['priceType']}")
        sys.exit(0)

    # --- Release lock ---
    if args.release:
        # Navigate to any page to clear lock, or evaluate JS to release
        with CDPClient() as cdp:
            result = cdp.evaluate('''
                (function() {
                    var url = window.location.href;
                    if (url.includes("checkout")) {
                        window.history.back();
                        return JSON.stringify({"released": true, "method": "back"});
                    }
                    return JSON.stringify({"released": false, "reason": "not_on_checkout"});
                })()
            ''')
            print(f"Release result: {result}")
        sys.exit(0)

    # --- Validate args ---
    if not args.restaurant or not args.date:
        print("Error: --restaurant and --date are required")
        sys.exit(1)

    config = get_config(args.restaurant)
    fallback_dates = args.fallback_dates.split(",") if args.fallback_dates else []

    # Validate party size
    if args.party_size < config["partyMin"] or args.party_size > config["partyMax"]:
        print(f"Error: party size {args.party_size} out of range "
              f"[{config['partyMin']}, {config['partyMax']}] for {config['name']}")
        sys.exit(1)

    # --- Init components ---
    logger = EventLogger(restaurant=args.restaurant)
    notifier = Notifier(enabled=not args.no_notify)
    dry_run = args.mode == "dry-run"

    logger.log("start",
               restaurant=config["name"],
               mode=args.mode,
               target={"date": args.date, "time": args.time, "party": args.party_size})

    # --- CDP connection ---
    cdp = CDPClient(port=18800)
    try:
        tab_url = cdp.connect()
        logger.log("cdp_connected", tab_url=tab_url)
    except Exception as e:
        logger.log("cdp_connect_failed", error=str(e))
        notifier.send(f"FAILED: Chrome not reachable on port 18800. Error: {e}")
        sys.exit(1)

    # --- Cleanup handler (release lock on exit) ---
    def cleanup(*_args):
        try:
            cdp.evaluate('window.history.back()')
            time.sleep(0.5)
        except Exception:
            pass
        try:
            cdp.close()
        except Exception:
            pass
        notifier.stop()
        logger.close()

    atexit.register(cleanup)
    signal.signal(signal.SIGINT, lambda *a: (cleanup(), sys.exit(130)))
    signal.signal(signal.SIGTERM, lambda *a: (cleanup(), sys.exit(143)))

    # --- Execute mode ---
    try:
        if args.mode == "watch":
            watcher = Watcher(
                cdp=cdp,
                config=config,
                logger=logger,
                notifier=notifier,
                target_date=args.date,
                target_time=args.time,
                party_size=args.party_size,
                poll_interval=args.poll_interval,
                dry_run=dry_run,
            )
            result = watcher.watch_and_book(
                fallback_dates=fallback_dates,
                max_duration=args.watch_duration,
            )
        else:
            # live or dry-run
            engine = BookingEngine(
                cdp=cdp,
                config=config,
                logger=logger,
                notifier=notifier,
                party_size=args.party_size,
                dry_run=dry_run,
            )
            result = engine.book(
                target_date=args.date,
                target_time=args.time,
                fallback_dates=fallback_dates,
            )

        # --- Summary ---
        print_run_summary(result, logger, config, args)

        # --- Screenshot on success ---
        if result.get("success"):
            screenshot_path = os.path.join(
                os.path.dirname(logger.path),
                f"checkout-{args.restaurant}-{args.date}.png"
            )
            try:
                cdp.screenshot(screenshot_path)
                logger.log("screenshot_saved", path=screenshot_path)
            except Exception:
                pass

        # --- Exit code ---
        sys.exit(0 if result.get("success") else 1)

    except Exception as e:
        logger.log("fatal_error", error=str(e), type=type(e).__name__)
        notifier.send(f"FATAL: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
```

---

## 9. Error Handling & Retry Logic

### Error Categories and Responses

| Error | Detection | Response | Max Retries |
|-------|-----------|----------|-------------|
| Chrome unreachable | `CDPClient.connect()` raises | Exit with error + Telegram alert | 0 |
| CDP disconnect mid-run | `evaluate()` returns timeout/error | Reconnect with 2s backoff | 3 |
| Dialog won't load | `DIALOG_VISIBLE` false after 10s | Refresh page, retry navigate | 1 |
| Date button disabled | `click_date` returns `date_disabled` | Skip to next date in fallback list | per date |
| No bookable slots | `GET_TIME_SLOTS` returns all Notify | Skip to next date | per date |
| Book click doesn't reach checkout | `verify_checkout` times out after 8s | Check for error text, try next slot | per slot |
| "Selected by another" | Detect error text in dialog | Try next available time, then next date | per slot |
| Page unresponsive | `evaluate()` returns CDP timeout | Refresh + reconnect | 3 |
| Add-ons page stuck | `handle_addons_page` times out | Try direct checkout URL navigation | 1 |

### Consecutive Failure Circuit Breaker

```python
# In booking_engine.py
class BookingEngine:
    MAX_CONSECUTIVE_FAILURES = 3

    def __init__(self, ...):
        ...
        self._consecutive_failures = 0

    def _check_circuit_breaker(self, event: str) -> bool:
        """Returns True if should abort."""
        self._consecutive_failures += 1
        if self._consecutive_failures >= self.MAX_CONSECUTIVE_FAILURES:
            self.logger.log("circuit_breaker_tripped", event=event,
                           failures=self._consecutive_failures)
            self.notifier.send(
                f"ABORTED: {self._consecutive_failures} consecutive failures "
                f"at {self.config['name']}. Last: {event}")
            return True
        return False

    def _reset_circuit_breaker(self):
        self._consecutive_failures = 0
```

---

## 10. Fallback Cascade

The fallback cascade is implemented in `BookingEngine.book()`. Priority order:

```
1. target_date + target_time (e.g., 2026-05-01 7:45 PM)
   ↓ slot not found or Book click fails
2. target_date + any available time (earliest first)
   ↓ no bookable slots on target date
3. fallback_dates[0] + target_time, then any time
   ↓ repeat for each fallback date
4. fallback_dates[1] + target_time, then any time
   ...
N. All dates exhausted → FAIL notification → exit(1)
```

### Taneda-Specific Fallback Considerations

For Taneda (`fixedParty: True`), the Redux ticket group filter is critical:

```javascript
// Each ticket group has minPurchaseSize === maxPurchaseSize
// For party of 2, only groups where minPurchaseSize === 2 are bookable
// Typical: 3 two-top tables per seating, 2 seatings per day = 6 slots for party of 2
```

The DOM-level Book button will only appear for compatible tables (Tock's UI handles this), but the Redux-level availability detection must filter correctly to avoid false positives.

---

## 11. Event Logging Schema

All events logged as JSONL to `logs/booker-{restaurant}-{YYYY-MM-DD}-{HHMMSS}.jsonl`.

### Core Fields (every event)

```json
{
    "ts_ms": 1711043400000,
    "event": "event_name",
    "elapsed_ms": 45,
    "total_ms": 2300
}
```

### Event Catalog

| Event | Additional Fields | When |
|-------|------------------|------|
| `start` | `restaurant`, `mode`, `target: {date, time, party}` | Script start |
| `cdp_connected` | `tab_url` | CDP connection established |
| `dialog_visible` | `url` | Experience dialog detected |
| `dialog_timeout` | `url` | Dialog didn't appear in 10s |
| `set_party_size` | `target`, `success` | Party size adjusted |
| `month_visible` | `target`, `attempts` | Calendar showing target month |
| `month_nav_failed` | `error`, `attempt` | Calendar next button disabled/missing |
| `click_date` | `date`, `success`, `error` | Date button clicked |
| `time_slots_loaded` | `total`, `bookable`, `slots: [...]` | Time slots appeared |
| `time_slots_timeout` | `timeout` | No slots after timeout |
| `click_book` | `time`, `success`, `error` | Book button clicked |
| `addons_handled` | `action`, `success` | Add-ons page handled |
| `checkout_reached` | `timer`, `url` | Lock confirmed on checkout |
| `checkout_timeout` | `timeout` | Checkout didn't load |
| `watch_start` | `restaurant`, `date`, `time`, `party_size`, `poll_interval` | Watch mode started |
| `poll` | `available`, `method`, `slots` | Single poll result |
| `availability_detected` | `method`, `slots` | Availability found |
| `lock_released` | `success` | Lock released |
| `screenshot_saved` | `path` | Screenshot captured |
| `cdp_reconnected` | `attempt` | CDP reconnection successful |
| `fatal_error` | `error`, `type` | Unhandled exception |
| `circuit_breaker_tripped` | `event`, `failures` | Too many consecutive failures |

---

## 12. Async Notification Architecture

```
┌──────────────┐     .send()     ┌──────────────┐
│ BookingEngine │ ──────────────→ │   Notifier   │
│   / Watcher  │  (non-blocking) │              │
└──────────────┘                  │  Queue ──→ Worker Thread │
                                  │              │
                                  │  ┌─────────────────────┐ │
                                  │  │ POST telegram API   │ │
                                  │  │ Write /tmp backup   │ │
                                  │  └─────────────────────┘ │
                                  └──────────────┘
```

- `send()` returns immediately (puts message on `Queue`)
- Daemon thread processes queue sequentially
- Token loaded from Keychain at init
- File backup at `/tmp/tock_booker_notification.txt` for debugging
- `stop()` drains queue before exit (5s timeout)
- Zero impact on booking latency

### Notification Messages

| Event | Message Format |
|-------|---------------|
| Watch started | `"Tock Booker: Watching {name} for {date} availability. Polling every {interval}s."` |
| Availability detected | `"AVAILABILITY DETECTED: {name} {date}. Booking now..."` |
| Lock acquired | `"LOCK ACQUIRED: {name}, {date} {time}, {party} guests. Timer: {remaining}. Checkout loaded."` |
| Fallback triggered | `"Primary slot taken. Trying {date}..."` |
| Failed | `"FAILED: Could not lock any slot for {name}. Tried dates: {dates}"` |
| Lock released | `"Lock released for {name}."` |
| Status ping | `"Still watching {name} \| elapsed={N}s polls={N}"` |
| Fatal error | `"FATAL: {type}: {message}"` |

---

## 13. Lock Release Mechanism

### Explicit Release (`--release` flag)

```python
# In main():
with CDPClient() as cdp:
    # If on checkout page, navigate back
    cdp.evaluate('window.history.back()')
    time.sleep(1)
```

### Auto-Release on Exit

```python
# Registered via atexit + signal handlers in main()
def cleanup():
    cdp.evaluate('window.history.back()')  # releases lock server-side
    cdp.close()
```

### Natural Expiry

Locks expire after 10 minutes (server-side). The `lockedUntilDatetime` field in Redux (`checkout.ticketSubset[0].lockedUntilDatetime`) gives the exact expiry. No action needed — slot returns to pool automatically.

### Lock State Verification

```javascript
// Check if lock is still active
window.store.getState().checkout.ticketSubset[0].state  // "LOCKED" or "AVAILABLE"
window.store.getState().checkout.ticketSubset[0].lockedUntilDatetime  // ISO string
```

---

## 14. Testing Strategy

### Test Order (by risk, ascending)

| # | Restaurant | Why | What to Validate |
|---|-----------|-----|-----------------|
| 1 | **Sushi Bar Austin** | Cheapest ($50 deposit), most available, communal seating | Full flow: navigate → date → time → Book → checkout. Party size 1-6. All time slots. Lock + release. |
| 2 | **Craft Omakase** | Prepaid $185, no add-ons, communal | PREPAID flow variant. Verify checkout total includes service charge. |
| 3 | **Otoko** | Prepaid $200, HAS add-ons (pairings, optional) | Pairings page skip. Verify "Next" button click → checkout. Fixed tables (not communal). |
| 4 | **Toshokan** | Card hold $204, HAS add-ons (course, required) | Required add-on selection (select_first). Verify course selected before Next. Near sold-out — tests limited availability. |
| 5 | **Taneda** (watch only) | Fully sold out. Fixed table seating. | Watch mode poll loop. Verify Redux state detection (`SOLD` → no false positives). Calendar nav with all disabled buttons. Do NOT test booking (nothing available). |
| 6 | **Taneda March 21 Recon** | LIVE dress rehearsal on actual drop day | Watch mode + live booking. Start 3 min before 11:00 AM PDT. Observe: queue/waiting room? Calendar refresh needed? hCaptcha? Speed. DO NOT complete purchase. |

### Test Commands

```bash
# Test 1: Sushi Bar — full live booking
python3 tock_booker.py -r sushibaraustin -d 2026-03-20 -t "8:15 PM" -p 2 -m live

# Test 2: Craft Omakase — live booking
python3 tock_booker.py -r craft-omakase-austin -d 2026-03-20 -t "6:00 PM" -p 2 -m live

# Test 3: Otoko — live booking (tests pairings skip)
python3 tock_booker.py -r otoko -d 2026-03-20 -t "7:00 PM" -p 2 -m live

# Test 4: Toshokan — live booking (tests required course selection)
python3 tock_booker.py -r toshokan -d 2026-03-20 -t "6:00 PM" -p 2 -m live

# Test 5: Taneda — watch mode (will poll indefinitely, Ctrl+C to stop)
python3 tock_booker.py -r taneda -d 2026-04-15 -t "7:45 PM" -p 2 -m watch --watch-duration 120

# Test 6: Lock release
python3 tock_booker.py --release

# Test 7: March 21 Recon
python3 tock_booker.py -r taneda -d 2026-05-01 -t "7:45 PM" -p 2 -m watch \
  --fallback-dates 2026-05-02,2026-05-03 --watch-duration 900
```

### Validation Checklist Per Restaurant

- [ ] Dialog opens within 5s
- [ ] Party size sets correctly
- [ ] Calendar navigates to target month
- [ ] Date click loads time slots
- [ ] Book click reaches checkout (with/without add-ons)
- [ ] Timer visible and ticking
- [ ] JSONL log has all events with timing
- [ ] Telegram notification received for lock
- [ ] Lock release works (explicit + Ctrl+C)
- [ ] Dry-run stops before Book click
- [ ] Fallback works when preferred time unavailable

---

## 15. Implementation Order

Build and test incrementally:

1. **`selectors.py`** — Pure constants, no deps. Can be validated with manual `cdp.evaluate()` calls.
2. **`restaurant_configs.py`** — Extend existing file with new fields.
3. **`event_logger.py`** — Extend existing file with timing helpers.
4. **`notifier.py`** — New file. Test with standalone `Notifier().send("test")`.
5. **`booking_engine.py`** — Core logic. Test each method individually against Sushi Bar.
6. **`watcher.py`** — Watch mode. Test against Taneda (sold out — should poll without false positives).
7. **`tock_booker.py`** — CLI orchestrator. Wire everything together.
8. **Integration test** — Full flow on Sushi Bar (live), then Otoko (pairings), then Toshokan (required add-on).
9. **Speed optimization** — Analyze JSONL timing logs, reduce sleeps, optimize JS eval.
10. **March 21 recon** — Live dress rehearsal on Taneda drop.

---

## 16. Key Design Decisions

### Why DOM-based booking (not API)?

The old `sniper.py` used direct API calls with protobuf. The new booker uses DOM automation because:
1. API approach requires maintaining protobuf schemas that change
2. DOM approach inherits Cloudflare clearance and cookies naturally
3. DOM approach is invisible to server-side rate limiting (looks like normal browsing)
4. hCaptcha invisible is more likely to pass with real DOM interactions

### Why dual detection (Redux + DOM)?

- Redux is faster (single JS eval, no DOM traversal) and gives structured data
- DOM is the fallback if Redux state is stale (e.g., page hasn't refreshed after drop)
- Both are evaluated client-side in the browser — no network requests, invisible to Cloudflare

### Why `window.store` not `window.__REDUX_STORE__`?

Codex-3 verification confirmed `window.store` is the correct path. `window.__REDUX_STORE__` does not exist on Tock pages. The hydration state at `window.$REDUX_STATE` is static (server-rendered) and doesn't update — use `window.store.getState()` for live data.

### Why refresh page after availability detection?

The calendar component may not re-render when new dates are released server-side. The Redux store might show `experience.state: "AVAILABLE"` but the calendar DOM might still show April dates as disabled. A page refresh forces the React app to re-fetch and re-render with the new date data.
