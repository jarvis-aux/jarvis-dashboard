# Tock Recon Runbook

**Purpose:** Step-by-step guide for running `--watch-only` recon during a Tock reservation drop. Goal: capture real drop timing, second-wave behavior, detection latency, and Redux data quality — without booking anything.

**Applies to:** n/naka (2026-03-15), Taneda (2026-03-21), and all future recon runs.

---

## Recon Capture Checklist

Every recon run should produce these artifacts:

| # | Artifact | Source | Why |
|---|----------|--------|-----|
| 1 | JSONL event log | `logs/booker-<slug>-<timestamp>.jsonl` | Full timing data: poll intervals, detection latency, flip count |
| 2 | Redux release schedule | `availability_detected` event → `server_drop_epoch_ms` field | Confirms exact drop epoch vs clock time |
| 3 | Detection latency | `availability_detected` event → `delta_ms` field | Time between server drop epoch and our first detection |
| 4 | Detection method | `availability_detected` event → `method` field | Redux vs DOM — which fires first? |
| 5 | Slot inventory snapshot | `availability_detected` event → `slots` array | What slots exist at T+0? Party sizes, times, communal vs private |
| 6 | Availability flip log | `availability_flip` events | How many flips? When do cancellations create second-wave slots? |
| 7 | Second-wave window data | `second_wave_window_entered` event + any flips after T+10m | Does inventory churn after the initial rush? |
| 8 | Health check output | stdout from `--health-check` | Pre-drop validation proof |
| 9 | Post-run summary | stdout from the run itself | Quick human-readable result |
| 10 | Terminal session log | `script` or copy-paste | Full terminal output for debugging |

### Post-run analysis questions (answer in daily log)

1. **How fast was detection?** `delta_ms` from `availability_detected` — sub-second? Multi-second?
2. **Redux or DOM?** Which method detected first? Is DOM fallback ever needed?
3. **Slot distribution:** How many slots at T+0? What times? What party sizes?
4. **Second-wave:** Did availability flip back after initial rush? How long after?
5. **Poll efficiency:** How many polls before detection? Any wasted polls?
6. **Refresh policy impact:** Did adaptive refresh fire? Did it help or cause a missed cycle?
7. **Anomalies:** Anything unexpected (Cloudflare challenge, Redux state mismatch, sold-out but enabled dates, etc.)?

---

## Sunday n/naka Recon — 2026-03-15

### Key facts

- **Drop time:** 10:00 AM PT / 12:00 PM CT (confirmed via Redux)
- **Restaurant:** n/naka (Los Angeles)
- **Slug:** `n-naka`
- **Mode:** `--watch-only` (zero booking clicks)
- **Target date:** pick a date ~4 weeks out (e.g., `2026-04-12`)
- **Party size:** 2
- **Watch duration:** 1200s (20 min — covers drop + full second-wave window)
- **Poll interval:** 1.0s (aggressive but under CF threshold at 3-5s minimum for API; in-page JS polling is invisible to CF)
- **Refresh policy:** `adaptive` (will refresh in the 60s pre-drop window if a drop epoch is detected)

### Timeline

#### T-60m (11:00 AM CT): Prep

1. **Verify Chrome is alive:**
   ```bash
   curl -s http://127.0.0.1:18800/json/version
   ```
   If dead, relaunch:
   ```bash
   nohup /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
     --remote-debugging-port=18800 \
     '--remote-allow-origins=*' \
     --user-data-dir="$HOME/.openclaw/browser/openclaw" \
     --no-first-run --no-default-browser-check \
     --disable-background-timer-throttling \
     --disable-backgrounding-occluded-windows \
     --disable-renderer-backgrounding &>/dev/null &
   ```

2. **Open n/naka tab in Chrome** (manually or via CDP):
   Navigate to `https://www.exploretock.com/n-naka/search?date=2026-04-12&size=2`

3. **Verify logged in:** Check the page shows the aliudeloitte@gmail.com account. If not, log in first.

#### T-30m (11:30 AM CT): Health check

```bash
cd /Users/openclaw/.openclaw/workspace/scripts/tock-sniper
python3 tock_booker.py --health-check -r n-naka -d 2026-04-12 -p 2
```

**Expected:** 9/9 passed. If any check fails, fix it before proceeding.

Capture and save the output.

#### T-10m (11:50 AM CT): Start terminal recording

```bash
script -a /tmp/nnaka-recon-$(date +%Y%m%d).log
```

This captures all terminal output to a file for post-run review.

#### T-5m (11:55 AM CT): Launch watch-only

```bash
cd /Users/openclaw/.openclaw/workspace/scripts/tock-sniper
python3 tock_booker.py \
  -r n-naka \
  -d 2026-04-12 \
  -p 2 \
  --watch-only \
  --watch-duration 1200 \
  --poll-interval 1.0 \
  --refresh-policy adaptive \
  --no-notify
```

**Why `--no-notify`:** Telegram notifications are broken (missing Keychain entry). Remove this flag once fixed.

**Why T-5m:** Gives the watcher time to initialize, navigate to the search page, confirm dialog is visible, and start polling before the drop. The adaptive refresh policy will handle the pre-drop refresh window.

#### T+0 (12:00 PM CT): Drop happens

- Watch the terminal for `availability_detected` events
- Note the `delta_ms` (latency from drop epoch to detection)
- Note the `method` (redux vs dom)
- Note the slot count and details

**Do not touch anything.** The watcher is in `--watch-only` mode. Let it run.

#### T+10m (12:10 PM CT): Second-wave window

- Watch for `second_wave_window_entered` event
- Watch for any `availability_flip` events after T+10m
- These indicate cancellation churn

#### T+20m (12:20 PM CT): Run ends

The watcher will exit with a summary. Capture it.

```
exit  # end the script recording
```

#### T+25m: Post-run analysis

1. **Copy the JSONL log:**
   ```bash
   ls -la logs/booker-n-naka-2026-03-15-*.jsonl
   ```

2. **Quick event summary:**
   ```bash
   python3 -c "
   import json, sys
   events = {}
   for line in open(sys.argv[1]):
       e = json.loads(line)
       events[e['event']] = events.get(e['event'], 0) + 1
   for k, v in sorted(events.items()):
       print(f'{k}: {v}')
   " logs/booker-n-naka-2026-03-15-*.jsonl
   ```

3. **Detection latency:**
   ```bash
   python3 -c "
   import json, sys
   for line in open(sys.argv[1]):
       e = json.loads(line)
       if e.get('event') == 'availability_detected':
           print(f'Detection #{e.get(\"detection_index\")}: method={e.get(\"method\")} delta_ms={e.get(\"delta_ms\")} slots={len(e.get(\"slots\", []))}')
   " logs/booker-n-naka-2026-03-15-*.jsonl
   ```

4. **Flip timeline:**
   ```bash
   python3 -c "
   import json, sys
   for line in open(sys.argv[1]):
       e = json.loads(line)
       if 'flip' in e.get('event', '') or 'detected' in e.get('event', '') or 'second_wave' in e.get('event', ''):
           print(f'{e[\"event\"]}: ts_ms={e.get(\"ts_ms\",\"?\")} elapsed={e.get(\"elapsed_ms\",\"?\")}ms')
   " logs/booker-n-naka-2026-03-15-*.jsonl
   ```

5. **Write findings to daily log** (`memory/2026-03-15.md`) answering the 7 post-run analysis questions.

---

## Taneda Recon — 2026-03-21

Same procedure as above, with these substitutions:

| Field | n/naka | Taneda |
|-------|--------|--------|
| Slug | `n-naka` | `taneda` |
| Drop time | Sun 10:00 AM PT / 12:00 PM CT | Sat 11:00 AM PT / 1:00 PM CT |
| Target date | `2026-04-12` (flexible) | `2026-05-01` (first available May) |
| Party size | 2 | 2 |
| URL | `exploretock.com/n-naka` | `exploretock.com/taneda` |

**Taneda-specific note:** This is our actual booking target for May. The recon data directly informs the live run strategy ~4 weeks later.

---

## Launch modes (reference)

### JARVIS-launched (preferred for Sunday)

JARVIS runs the commands above via `exec` in a background shell. Andrew monitors via Telegram updates.

```bash
# JARVIS launches this in background
nohup python3 tock_booker.py \
  -r n-naka -d 2026-04-12 -p 2 \
  --watch-only --watch-duration 1200 --poll-interval 1.0 \
  --refresh-policy adaptive --no-notify \
  > /tmp/nnaka-recon-stdout.log 2>&1 &
echo "PID: $!"
```

### Manual (fallback)

Andrew SSHs in or uses terminal directly. Same commands, no `nohup`.

---

## Failure modes and recovery

| Failure | Symptom | Action |
|---------|---------|--------|
| Chrome dead | Health check fails at step 1 | Relaunch Chrome (see T-60m) |
| No Tock tab | Health check fails at step 2 | Open the restaurant URL manually |
| Dialog won't load | Health check fails at step 3 | Refresh tab, clear cache, retry |
| Redux store empty | Health check fails at step 4 | Page may not have loaded fully; wait + retry |
| Drop doesn't happen | No `availability_detected` after T+5m | Check if drop time changed (Redux `release` might have shifted). Log as "no-drop" and review |
| CDP disconnect during run | `cdp_disconnect` error in log | Watcher attempts 3 reconnects. If all fail, it exits. Restart manually if within window |
| Cloudflare challenge | Unexpected page content | Should not happen with in-page JS polling. If it does, stop and investigate — something changed |

---

## Reminders (JARVIS)

- [ ] Set a cron reminder for Saturday 2026-03-14 at 8 PM CT: "n/naka recon tomorrow at 12:00 PM CT. Run health check tonight."
- [ ] Set a cron reminder for Sunday 2026-03-15 at 11:00 AM CT: "n/naka recon in 1 hour. Start prep now."
- [ ] After the run: update `docs/tock-drop-test-calendar.md` with observed data
- [ ] After the run: update `docs/tock-sniper-todos.md` (move Task 4 to Done)
