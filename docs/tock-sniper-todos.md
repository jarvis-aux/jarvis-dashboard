# Tock Sniper — Running TODOs (Living Task List)

This is the single source of truth for what’s left to do on the Tock sniper / universal booker project.

**Rule:** keep this list current. When work is completed, move items to **Done (log)** with date + short note.

---

## P0 — Must do before any serious drop run

- [ ] **Create private GitHub repo + push remote**
  - Blocker: current `gh` token cannot `createRepository`.
  - Fix: Andrew creates `jarvis-aux/tock-sniper` private repo in GitHub UI, then we add `origin` and push.

- [ ] **Restore Telegram notifications**
  - `notifier.py` can’t send because Keychain entry `telegram-bot-token` is missing.
  - Add token to Keychain (service: `telegram-bot-token`, account: `openclaw`).

- [ ] **Watch mode: continue after failed booking attempt**
  - Current behavior: if watch detects availability and booking fails, the run exits.
  - Desired: keep watching until `--watch-duration` expires.

---

## P1 — Strongly recommended before March 21 recon

- [ ] **Second-wave logic at drop+10 minutes**
  - Tock hold timer is ~10 minutes; availability can reappear as holds expire.
  - Watch should keep running and log the second wave.

- [ ] **Health-check mode**
  - Add `--health-check` to validate critical selectors and Redux access for a restaurant before drop day.

- [ ] **Guaranteed unlock (immediate server-side unlock)**
  - Current `DELETE /api/ticket/unlock` returns 405.
  - Capture the real unlock request from checkout and implement correct method/path.

---

## P2 — Nice-to-haves / later

- [ ] **Timing variance analysis script**
  - Parse JSONL logs and produce a compact report: median/95p of each step per restaurant.

- [ ] **Improve tab targeting**
  - Prefer exact URL prefix match vs slug substring; avoid edge-case collisions.

- [ ] **Phase 2 purchase flow (requires explicit approval)**
  - Enter CVC in Braintree hosted iframe.
  - Click “Complete purchase”.

---

## Done (log)

- 2026-03-11: Universal booker Phase 1 implemented; live lock tests successful on Sushi Bar and Otoko.
- 2026-03-11: Watch refresh policy implemented (never/periodic/drop-window/adaptive).
- 2026-03-11: Fixed watch false positives (enabled dates without Book slots).
- 2026-03-11: Added sold-out fast detection (Craft/Tsuke/Toshokan).
