#!/usr/bin/env python3
"""Generate state.json for the JARVIS Ops Dashboard.
Reads workspace state files and cron output, writes state.json to repo root."""

import json
import os
import subprocess
import time
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path

WORKSPACE = os.path.expanduser("~/.openclaw/workspace")
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = os.path.join(REPO_ROOT, "state.json")

def now_epoch():
    return int(time.time())

def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def safe_read(path):
    try:
        with open(path, "r") as f:
            return f.read()
    except:
        return None

def safe_json(path):
    content = safe_read(path)
    if content:
        try:
            return json.loads(content)
        except:
            return None
    return None

def file_stats(path):
    content = safe_read(path)
    if content is None:
        return {"lineCount": 0, "byteCount": 0}
    return {"lineCount": len(content.splitlines()), "byteCount": len(content.encode("utf-8"))}

def parse_ts(val):
    if not val:
        return 0
    if isinstance(val, (int, float)):
        return int(val)
    try:
        dt = datetime.fromisoformat(val)
        return int(dt.timestamp())
    except:
        return 0

DAY_NAMES = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"]

def cron_to_human(schedule):
    """Convert cron expression like '0 22 * * *' to 'Daily 10 PM'."""
    expr = schedule.get("expr", "") if isinstance(schedule, dict) else str(schedule)
    tz = schedule.get("tz", "") if isinstance(schedule, dict) else ""
    # Map tz to short label
    tz_label = ""
    if tz:
        tz_shorts = {"America/Chicago": "CT", "America/New_York": "ET", "America/Los_Angeles": "PT", "UTC": "UTC"}
        tz_label = tz_shorts.get(tz, tz)
    parts = expr.strip().split()
    if len(parts) < 5:
        return expr
    minute, hour, dom, mon, dow = parts[:5]
    # Only handle simple cases: minute hour * * dow
    if dom != "*" or mon != "*":
        return expr
    try:
        h = int(hour)
        m = int(minute)
    except ValueError:
        return expr
    # Format time
    ampm = "AM" if h < 12 else "PM"
    h12 = h % 12
    if h12 == 0:
        h12 = 12
    time_str = f"{h12}:{m:02d} {ampm}" if m != 0 else f"{h12} {ampm}"
    # Day part
    if dow == "*":
        day_str = "Daily"
    else:
        try:
            day_idx = int(dow)
            day_str = DAY_NAMES[day_idx]
        except (ValueError, IndexError):
            day_str = dow
    result = f"{day_str} {time_str}"
    if tz_label:
        result += f" {tz_label}"
    return result

def get_cron_jobs():
    try:
        result = subprocess.run(["openclaw", "cron", "list", "--json"],
            capture_output=True, text=True, timeout=15)
        data = json.loads(result.stdout)
        jobs = []
        failed_24h = 0
        now_ms = int(time.time() * 1000)
        day_ms = 86400000

        for job in data.get("jobs", []):
            state = job.get("state", {})
            schedule = job.get("schedule", {})
            human = ""
            if schedule.get("kind") == "every":
                mins = schedule.get("everyMs", 0) // 60000
                human = f"Every {mins} min"
            elif schedule.get("kind") == "cron":
                human = cron_to_human(schedule)

            last_status = state.get("lastStatus", "unknown")
            if last_status == "error" and now_ms - state.get("lastRunAtMs", 0) < day_ms:
                failed_24h += 1

            last_run = None
            if state.get("lastRunAtMs"):
                last_run = {"ts": state["lastRunAtMs"] // 1000, "status": last_status,
                    "durationMs": state.get("lastDurationMs"),
                    "summary": state.get("lastError") if last_status == "error" else None}

            next_run = {"ts": state["nextRunAtMs"] // 1000} if state.get("nextRunAtMs") else None
            jobs.append({"id": job.get("name", job.get("id", "?")), "humanSchedule": human,
                "enabled": job.get("enabled", True), "lastRun": last_run, "nextRun": next_run,
                "consecutiveErrors": state.get("consecutiveErrors", 0)})

        return {"jobs": jobs, "stats": {"total": len(jobs), "enabled": sum(1 for j in jobs if j["enabled"]), "failedLast24h": failed_24h}}
    except Exception as e:
        return {"jobs": [], "stats": {"total": 0, "enabled": 0, "failedLast24h": 0}, "error": str(e)}

def get_stocks():
    data = safe_json(os.path.join(WORKSPACE, "memory/maruhide-stock-log.json"))
    if not data:
        return {"monitors": [], "stats": {"total": 0, "inStock": 0}}
    entries = data.get("log", [])
    points = []
    last_change = None
    prev = None
    for e in entries[-48:]:
        avail = e.get("available", False)
        ts = parse_ts(e.get("timestamp", ""))
        status = "in_stock" if avail else "out_of_stock"
        points.append({"ts": ts, "availability": status})
        if prev is not None and avail != prev:
            last_change = ts
        prev = avail
    cur = "in_stock" if (entries and entries[-1].get("available")) else "out_of_stock"
    return {"monitors": [{"key": "maruhide-uni", "name": data.get("product", "Maruhide Premium Uni (Ensui)"),
        "status": {"availability": cur, "lastCheckedTs": points[-1]["ts"] if points else 0, "lastKnownChangeTs": last_change},
        "history": {"windowHours": 72, "points": points}}],
        "stats": {"total": 1, "inStock": 1 if cur == "in_stock" else 0}}

def get_curiosity():
    content = safe_read(os.path.join(WORKSPACE, "memory/curiosity-backlog.md")) or ""
    state = safe_json(os.path.join(WORKSPACE, "memory/heartbeat-state.json")) or {}
    cs = state.get("curiosity", {})
    open_items = []
    resolved_all = 0
    resolved_7d = 0
    cutoff_7d = datetime.now(timezone.utc) - timedelta(days=7)
    for line in content.splitlines():
        l = line.strip()
        if l.startswith("- ~~") or l.startswith("~~"):
            resolved_all += 1
            m_date = re.search(r'RESOLVED\s+(\d{4}-\d{2}-\d{2})', l)
            if m_date:
                try:
                    rd = datetime.strptime(m_date.group(1), "%Y-%m-%d").replace(tzinfo=timezone.utc)
                    if rd >= cutoff_7d:
                        resolved_7d += 1
                except ValueError:
                    pass
        elif l.startswith("- ") and "|" in l:
            parts = l[2:].split("|")
            if len(parts) >= 3:
                t = parts[2].strip()
                m = re.search(r'\*\*(.*?)\*\*', t)
                title = m.group(1) if m else t[:80]
                tags = re.findall(r'#(\w+)', l)
                status = "proposal_pending" if "[PROPOSAL PENDING]" in l else "open"
                open_items.append({"title": title, "status": status, "tags": tags})
    return {"runs": {"today": cs.get("runsToday", 0), "totalRuns": cs.get("totalRuns", 0)},
        "backlog": {"open": open_items[:10]}, "stats": {"openCount": len(open_items), "resolved7d": resolved_7d, "resolvedAllTime": resolved_all}}

def get_projects():
    content = safe_read(os.path.join(WORKSPACE, "PROJECTS.md")) or ""
    projects = []
    cur_name = None
    cur_status = None
    cur_excerpt = ""
    for line in content.splitlines():
        h2 = re.match(r'^## (.+)', line)
        if h2:
            if cur_name and cur_name not in ("Key Docs",):
                projects.append({"name": cur_name, "status": cur_status or "active", "notesExcerpt": cur_excerpt[:120]})
            cur_name = h2.group(1).strip()
            cur_status = None
            cur_excerpt = ""
            continue
        sm = re.match(r'^\*\*Status:\*\*\s*(.*)', line)
        if sm and cur_name:
            st = sm.group(1).lower()
            for s in ["live", "building", "paused", "done", "killed", "failed", "active", "idea"]:
                if s in st:
                    cur_status = s
                    break
            cur_excerpt = sm.group(1).strip()[:120]
    if cur_name and cur_name not in ("Key Docs",):
        projects.append({"name": cur_name, "status": cur_status or "active", "notesExcerpt": cur_excerpt[:120]})
    active = [p for p in projects if p["status"] not in ("done", "killed")]
    return {"active": active[:12], "stats": {"activeCount": len(active)}}

def get_capability_gaps():
    content = safe_read(os.path.join(WORKSPACE, "CAPABILITY-GAPS.md")) or ""
    gaps = []
    rejected = []
    section = None
    for line in content.splitlines():
        stripped = line.strip()
        if "## Open Gaps" in line or "## Open" in line:
            section = "open"
            continue
        elif "## Rejected" in line:
            section = "rejected"
            continue
        elif "## Audit" in line:
            section = "audit"
            continue
        elif line.startswith("## "):
            section = None
            continue
        if stripped.startswith("<!--") or not stripped:
            continue
        if section == "open" and stripped:
            parts = stripped.split("|")
            if len(parts) >= 2:
                title = parts[1].strip()[:100]
                sev = "high" if any(w in title.lower() for w in ["cloudflare", "blocked", "critical"]) else \
                      "low" if any(w in title.lower() for w in ["migration", "minor"]) else "medium"
                gaps.append({"title": title, "severity": sev})
        elif section == "rejected" and stripped and not stripped.startswith("<!--"):
            parts = stripped.split("|")
            if len(parts) >= 2:
                rejected.append({"title": parts[1].strip()[:100]})
    return {"open": gaps[:10], "rejected": rejected[:5], "stats": {"openCount": len(gaps)}}

def next_weekday_after(ts, target_weekday, hour=0, minute=0, tz_name="America/Chicago"):
    """Return epoch of the next occurrence of target_weekday (0=Mon, 6=Sun) after ts."""
    if ts == 0:
        return 0
    try:
        from zoneinfo import ZoneInfo
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = timezone(timedelta(hours=-6))  # fallback CT
    dt = datetime.fromtimestamp(ts, tz=tz)
    days_ahead = (target_weekday - dt.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    nxt = (dt + timedelta(days=days_ahead)).replace(hour=hour, minute=minute, second=0, microsecond=0)
    return int(nxt.timestamp())

def get_drive():
    state = safe_json(os.path.join(WORKSPACE, "memory/heartbeat-state.json")) or {}
    audit_ts = parse_ts(state.get("lastDriveAudit"))
    report_ts = parse_ts(state.get("lastWeeklyReport"))
    now = now_epoch()
    next_audit = next_weekday_after(audit_ts, 2)  # Wednesday = 2
    next_report = next_weekday_after(report_ts, 6, hour=20)  # Sunday = 6, 20:00 CT
    return {"last": {"auditTs": audit_ts, "reportTs": report_ts},
        "next": {"auditTs": next_audit, "reportTs": next_report},
        "status": "warn" if (now - audit_ts > 691200 or now - report_ts > 691200) else "ok",
        "auditOverdue": now - audit_ts > 691200, "reportOverdue": now - report_ts > 691200}

def get_memory():
    mem_dir = os.path.join(WORKSPACE, "memory")
    today = datetime.now().strftime("%Y-%m-%d")
    today_stats = file_stats(os.path.join(mem_dir, f"{today}.md"))
    today_stats["date"] = today
    recent = []
    for i in range(1, 8):
        d = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
        p = os.path.join(mem_dir, f"{d}.md")
        if os.path.exists(p):
            s = file_stats(p)
            s["date"] = d
            recent.append(s)
    return {"today": today_stats, "recentDays": recent, "memoryMd": file_stats(os.path.join(WORKSPACE, "MEMORY.md"))}

def get_heartbeat():
    state = safe_json(os.path.join(WORKSPACE, "memory/heartbeat-state.json")) or {}
    # Dedicated fields supersede lastChecks equivalents
    DEDICATED_SUPERSEDES = {"lastInboxCheck": "email", "lastMemoryReview": "memoryReview"}
    FRIENDLY = {"lastInboxCheck": "Inbox Check", "lastMemoryReview": "Memory Review",
        "lastDriveAudit": "Drive Audit", "lastNicotineCheck": "Nicotine Check",
        "lastWeeklyReport": "Weekly Report", "calendar": "Calendar", "weather": "Weather"}
    # Start with lastChecks
    raw = {}
    checks = state.get("lastChecks", {})
    for k, v in checks.items():
        raw[k] = parse_ts(v)
    # Overlay dedicated fields (they supersede legacy keys)
    for key in ["lastInboxCheck", "lastMemoryReview", "lastDriveAudit", "lastNicotineCheck", "lastWeeklyReport"]:
        val = state.get(key)
        if val:
            raw[key] = parse_ts(val)
            # Remove the legacy equivalent if present
            legacy = DEDICATED_SUPERSEDES.get(key)
            if legacy and legacy in raw:
                del raw[legacy]
    # Rename to human-friendly keys
    parsed = {}
    for k, v in raw.items():
        parsed[FRIENDLY.get(k, k)] = v
    return {"lastChecks": parsed}

def get_documents():
    doc_files = [
        "HEARTBEAT.md", "PROJECTS.md", "CAPABILITY-GAPS.md",
        "TOOLS.md", "PLAYBOOKS.md", "SOUL.md", "IDENTITY.md", "USER.md",
    ]
    docs = []
    for name in doc_files:
        path = os.path.join(WORKSPACE, name)
        if not os.path.exists(path):
            continue
        content = safe_read(path)
        if content is None:
            continue
        stat = os.stat(path)
        docs.append({
            "name": name,
            "content": content,
            "sizeBytes": stat.st_size,
            "lastModified": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        })
    return docs

def compute_health(sections):
    signals = []
    cron = sections.get("cron", {})
    if cron.get("stats", {}).get("failedLast24h", 0) > 0:
        signals.append({"key": "cron.failures", "level": "warn",
            "message": f"{cron['stats']['failedLast24h']} cron job(s) failed in last 24h"})
    for job in cron.get("jobs", []):
        if job.get("consecutiveErrors", 0) >= 3:
            signals.append({"key": f"cron.{job['id']}.stuck", "level": "error",
                "message": f"'{job['id']}' has {job['consecutiveErrors']} consecutive errors"})
    drive = sections.get("drive", {})
    if drive.get("auditOverdue"):
        signals.append({"key": "drive.audit", "level": "warn", "message": "Drive audit overdue"})
    if drive.get("reportOverdue"):
        signals.append({"key": "drive.report", "level": "warn", "message": "Weekly report overdue"})
    overall = "error" if any(s["level"] == "error" for s in signals) else \
              "warn" if signals else "ok"
    return {"overall": overall, "signals": signals}

def main():
    sections = {"cron": get_cron_jobs(), "stocks": get_stocks(), "curiosity": get_curiosity(),
        "projects": get_projects(), "capabilityGaps": get_capability_gaps(), "drive": get_drive(),
        "memory": get_memory(), "heartbeat": get_heartbeat()}
    documents = get_documents()
    state = {"schemaVersion": 1, "generatedAt": now_epoch(), "generatedAtIso": now_iso(),
        "host": {"name": "Andrew's MacBook Pro", "timezone": "America/Chicago"},
        "health": compute_health(sections), "sections": sections, "documents": documents,
        "links": {"repo": "https://github.com/jarvis-aux/jarvis-dashboard"}}
    tmp = OUTPUT + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.rename(tmp, OUTPUT)
    print(f"Generated {OUTPUT} ({os.path.getsize(OUTPUT)} bytes)")
    print(f"Health: {state['health']['overall']} | Cron: {sections['cron']['stats']['total']} jobs | Gaps: {sections['capabilityGaps']['stats']['openCount']}")

if __name__ == "__main__":
    main()
