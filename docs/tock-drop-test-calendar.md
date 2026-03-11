# Tock Drop Test Calendar (Polling → Drop → Book Test Cases)

**Purpose:** a concrete schedule of upcoming Tock “inventory flips” we can use to test the full watch→detect→book (Phase 1: stop at checkout) flow.

**Time zone:** times shown in both **local restaurant TZ** and **America/Chicago**.

**Source legend:**
- **Redux** = extracted from `window.store.getState().app.config.release[*].activeOnEpochMillis` (best source)
- **Reddit** = user reports; verify on-site

---

## A) Verified scheduled drops (Redux schedule present)

### n/naka (Los Angeles) — weekly
- **Slug:** `https://www.exploretock.com/n-naka`
- **Drop time:** Sundays 10:00 AM PT (confirmed via Redux)
- **Upcoming drops (next 3):**
  - 2026-03-15 10:00 AM PT / 2026-03-15 12:00 PM CT (Redux)
  - 2026-03-22 10:00 AM PT / 2026-03-22 12:00 PM CT (Redux)
  - 2026-03-29 10:00 AM PT / 2026-03-29 12:00 PM CT (Redux)

### Taneda (Seattle) — monthly
- **Slug (current):** `https://www.exploretock.com/taneda`
- **Alt slug seen on Reddit:** `https://www.exploretock.com/taneda-sushi-in-kaiseki-seattle-2`
- **Drop time:** 3rd Saturday 11:00 AM PT (confirmed via Redux for March)
- **Upcoming drops:**
  - 2026-03-21 11:00 AM PT / 2026-03-21 1:00 PM CT (Redux)
- **Note:** April’s drop epoch was not present in Redux yet on 2026-03-11; expected ~2026-04-18 (Reddit) but must be re-checked after 2026-03-21.

### The French Laundry (Yountville) — monthly
- **Slug:** `https://www.exploretock.com/tfl`
- **Drop time:** 1st of month 10:00 AM PT (confirmed via Redux)
- **Upcoming drops (next 3):**
  - 2026-04-01 10:00 AM PT / 2026-04-01 12:00 PM CT (Redux)
  - 2026-05-01 10:00 AM PT / 2026-05-01 12:00 PM CT (Redux)
  - 2026-06-01 10:00 AM PT / 2026-06-01 12:00 PM CT (Redux)

### Hayato (Los Angeles) — monthly
- **Slug:** `https://www.exploretock.com/hayato`
- **Drop time:** 1st of month 10:00 AM PT (confirmed via Redux)
- **Upcoming drops:**
  - 2026-04-01 10:00 AM PT / 2026-04-01 12:00 PM CT (Redux)

---

## B) Reported drops (Reddit) but **no Redux schedule detected** on 2026-03-11

These are still useful test cases, but we should verify their drop epoch on-site (banner, email, or updated Redux) before relying on the times.

### Tsuke Edomae (Austin)
- **Slug:** `https://www.exploretock.com/tsukeedomae`
- **Reported:** ~every 6 months, 9:00 AM CT sharp (Reddit)
- **Redux schedule:** none detected

### Alinea (Chicago)
- **Slug:** `https://www.exploretock.com/alinea`
- **Reported:** 15th of month, ~11:00 PM CT (older Reddit report)
- **Redux schedule:** none detected

### Atomix (NYC)
- **Slug:** `https://www.exploretock.com/atomix`
- **Reported:** Monday before the month, 2:00 PM ET (Reddit)
- **Redux schedule:** none detected

### Edulis (Toronto)
- **Slug:** `https://www.exploretock.com/edulis`
- **Reported:** monthly, 6:00 PM ET (Reddit)
- **Redux schedule:** none detected

---

## C) Practical testing notes (so we don’t create chaos)

- **Best recurring test harness:** `n/naka` (weekly scheduled drop, Redux-confirmed).
- **Taneda March 21** is our recon run (do not complete purchase). Consider **watch-only** unless explicitly approved to lock.
- For ultra‑high demand restaurants (TFL/Hayato), consider **watch-only / no-lock** tests unless explicitly approved (ethical + PR risk).

## D) How to run a drop test

Example (watch-only, no refresh thrash during testing):
```bash
python3 tock_booker.py -r taneda -d 2026-05-01 -t '7:45 PM' -p 2 -m watch \
  --poll-interval 1.0 --watch-duration 900 \
  --refresh-policy never --no-notify
```

Production-like (allows controlled repull in drop window):
```bash
python3 tock_booker.py -r taneda -d 2026-05-01 -t '7:45 PM' -p 2 -m watch \
  --poll-interval 1.0 --watch-duration 900 \
  --refresh-policy adaptive --no-notify
```
