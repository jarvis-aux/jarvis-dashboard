(() => {
  'use strict';

  // ── Auth Gate ──────────────────────────────────────────────
  const AUTH_KEY = 'jarvis-auth';
  const VALID_EMAIL = 'liuandrewy@gmail.com';
  const VALID_HASH = 'e71013ad87ed05853e5d4b56c6a3c8210fe7f99fd2f4b887da31973c767b0487';

  let _startDashboard = null;

  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function showLogin() {
    document.getElementById('login-screen').style.display = '';
    document.getElementById('app-shell').style.display = 'none';
  }

  function showDashboard() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-shell').style.display = '';
    if (_startDashboard) _startDashboard();
  }

  if (localStorage.getItem(AUTH_KEY) === 'authenticated') {
    showDashboard();
  } else {
    showLogin();
  }

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';

    const hash = await sha256(password);
    if (email === VALID_EMAIL && hash === VALID_HASH) {
      localStorage.setItem(AUTH_KEY, 'authenticated');
      showDashboard();
    } else {
      errorEl.textContent = 'Invalid credentials';
    }
  });

  document.getElementById('sign-out-link').addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem(AUTH_KEY);
    showLogin();
  });

  // ── Helpers ──────────────────────────────────────────────
  const $ = (s, el = document) => el.querySelector(s);
  const h = (s) => {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  };

  function relativeTime(ts) {
    if (!ts) return '—';
    const now = Date.now() / 1000;
    const diff = now - ts;
    if (diff < 0) {
      const abs = Math.abs(diff);
      if (abs < 60) return 'in <1m';
      if (abs < 3600) return `in ${Math.floor(abs / 60)}m`;
      if (abs < 86400) return `in ${Math.floor(abs / 3600)}h`;
      return `in ${Math.floor(abs / 86400)}d`;
    }
    if (diff < 60) return '<1m ago';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  function formatBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }

  function dotClass(status) {
    const map = { success: 'dot-success', ok: 'dot-success', failure: 'dot-failure', error: 'dot-failure', running: 'dot-running' };
    return map[status] || 'dot-unknown';
  }

  function healthPillClass(level) {
    const map = { ok: 'pill-ok', warn: 'pill-warn', error: 'pill-error' };
    return map[level] || 'pill-ok';
  }

  function severityClass(s) {
    return `severity-${s || 'low'}`;
  }

  function badgeClass(status) {
    return `badge-${status || 'active'}`;
  }

  function availLabel(a) {
    const map = { in_stock: 'In Stock', out_of_stock: 'Out of Stock', unknown: 'Unknown' };
    return map[a] || a;
  }

  function humanDuration(seconds) {
    const abs = Math.abs(seconds);
    if (abs < 3600) return `${Math.max(1, Math.floor(abs / 60))}m`;
    if (abs < 86400) return `${Math.floor(abs / 3600)}h ${Math.floor((abs % 3600) / 60)}m`;
    const d = Math.floor(abs / 86400);
    const hr = Math.floor((abs % 86400) / 3600);
    return hr ? `${d}d ${hr}h` : `${d}d`;
  }

  function hasTransition(points) {
    if (!points || points.length < 2) return false;
    const first = points[0].availability;
    return points.some(p => p.availability !== first);
  }

  const SOURCE_PATHS = {
    'Cron Jobs': 'openclaw cron list --json',
    'Stock Monitor': 'memory/maruhide-stock-log.json',
    'Curiosity': 'memory/curiosity-backlog.md',
    'Projects': 'PROJECTS.md',
    'Capability Gaps': 'CAPABILITY-GAPS.md',
    'Drive': 'memory/heartbeat-state.json',
    'Memory': 'memory/*.md + MEMORY.md',
    'Heartbeat': 'HEARTBEAT.md + memory/heartbeat-state.json',
  };

  // ── Card builder ─────────────────────────────────────────
  function card(title, content, { wide = false, meta = '' } = {}) {
    const tip = SOURCE_PATHS[title] ? `<span class="info-tip" data-tip="${SOURCE_PATHS[title]}">i</span>` : '';
    return `<section class="card${wide ? ' card-wide' : ''}">
      <div class="card-header">
        <h2 class="card-title">${title}</h2>
        <span class="card-meta">${meta}${tip}</span>
      </div>
      <div class="card-body">${content}</div>
    </section>`;
  }

  // ── Show more logic ──────────────────────────────────────
  let toggleId = 0;
  function withShowMore(items, limit, renderFn) {
    if (items.length <= limit) return items.map(renderFn).join('');
    const id = `toggle-${++toggleId}`;
    const visible = items.slice(0, limit).map(renderFn).join('');
    const hidden = items.slice(limit).map(renderFn).join('');
    return `${visible}<div id="${id}" style="display:none">${hidden}</div>
      <button class="show-more-btn" onclick="
        const el=document.getElementById('${id}');
        const show=el.style.display==='none';
        el.style.display=show?'':'none';
        this.textContent=show?'Show less':'Show ${items.length - limit} more';
      ">Show ${items.length - limit} more</button>`;
  }

  // ── Section renderers ────────────────────────────────────

  function renderCron(cron) {
    const stats = cron.stats || {};
    const jobs = cron.jobs || [];
    const statsRow = `<div class="stat-row">
      <div class="stat-item"><span class="stat-value">${stats.enabled || 0}</span><span class="stat-label">enabled</span></div>
      <div class="stat-item"><span class="stat-value">${stats.failedLast24h || 0}</span><span class="stat-label">failed 24h</span></div>
    </div>`;

    // Summary line for collapsed state
    const okCount = jobs.filter(j => (j.lastRun?.status) === 'ok' || (j.lastRun?.status) === 'success').length;
    const errCount = jobs.filter(j => (j.lastRun?.status) === 'error' || (j.lastRun?.status) === 'failure').length;
    const now = Date.now() / 1000;
    const nextRunTs = jobs.reduce((min, j) => {
      const t = j.nextRun?.ts;
      return t && t > now && (min === 0 || t < min) ? t : min;
    }, 0);
    const nextRunLabel = nextRunTs ? `next run ${relativeTime(nextRunTs).replace(' ago', '')}` : '';
    const summaryParts = [`${okCount} jobs OK`, errCount ? `${errCount} errors` : '', nextRunLabel].filter(Boolean);
    const summaryLine = `<div class="cron-summary">${summaryParts.join(' · ')}</div>`;

    const cronToggleId = `cron-toggle-${++toggleId}`;
    const rows = jobs.map(j => {
      const lr = j.lastRun || {};
      return `<tr>
        <td class="col-status"><span class="status-dot ${dotClass(lr.status)}"></span></td>
        <td class="col-name">${h(j.id)}<div class="job-summary">${h(j.humanSchedule || '')}</div></td>
        <td>${relativeTime(lr.ts)}</td>
        <td>${relativeTime(j.nextRun?.ts)}</td>
      </tr>`;
    }).join('');
    const table = `<div id="${cronToggleId}" style="display:none;overflow-x:auto"><table class="data-table">
      <thead><tr><th class="col-status"></th><th>Job</th><th>Last Run</th><th>Next</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
    const toggleBtn = `<button class="show-more-btn cron-toggle-btn" onclick="
      const el=document.getElementById('${cronToggleId}');
      const sum=this.previousElementSibling;
      const show=el.style.display==='none';
      el.style.display=show?'':'none';
      sum.style.display=show?'none':'';
      this.textContent=show?'Hide jobs ▲':'Show jobs ▼';
    ">Show jobs ▼</button>`;
    return card('Cron Jobs', statsRow + summaryLine + table + toggleBtn, { wide: true, meta: `${stats.total || 0} total` });
  }

  function renderStocks(stocks) {
    const monitors = stocks.monitors || [];
    const inner = monitors.map(m => {
      const a = m.status?.availability || 'unknown';
      const pts = m.history?.points || [];
      const canvasId = `spark-${m.key}`;
      const showChart = hasTransition(pts);

      // FIX 4: tracking summary
      let trackingSummary = '';
      if (pts.length) {
        const firstDate = new Date(pts[0].ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        // duration since last change or since tracking start
        let sinceTs = pts[0].ts;
        for (let i = pts.length - 1; i > 0; i--) {
          if (pts[i].availability !== pts[i - 1].availability) { sinceTs = pts[i].ts; break; }
        }
        const dur = humanDuration((pts[pts.length - 1].ts) - sinceTs);
        trackingSummary = `<div class="stock-tracking-summary">Tracking since ${firstDate}. ${availLabel(a)} for ${dur}.</div>`;
      }

      // FIX 1: sparkline vs text
      let sparkHtml;
      if (!showChart && pts.length >= 2) {
        const dur = humanDuration(pts[pts.length - 1].ts - pts[0].ts);
        const label = pts[0].availability === 'in_stock' ? 'In stock' : 'Out of stock';
        sparkHtml = `<div class="stock-sparkline-text">${label} for ${dur}</div>`;
      } else if (showChart) {
        sparkHtml = `<div class="sparkline-wrap"><canvas id="${canvasId}" class="chart-canvas" width="220" height="48"></canvas></div>`;
      } else {
        sparkHtml = '';
      }

      return `<div class="stock-monitor">
        <div class="stock-info">
          <div class="stock-name">${h(m.name)}</div>
          <span class="avail-pill avail-${a}">${availLabel(a)}</span>
          ${trackingSummary}
          <div class="stock-meta">Checked ${relativeTime(m.status?.lastCheckedTs)} · Changed ${relativeTime(m.status?.lastKnownChangeTs)}</div>
        </div>
        ${sparkHtml}
      </div>`;
    }).join('');
    return card('Stock Monitor', inner, { wide: true, meta: `${stocks.stats?.inStock || 0} in stock` });
  }

  function renderCuriosity(cur) {
    const stats = cur.stats || {};
    const runs = cur.runs || {};
    const open = cur.backlog?.open || [];

    // Prominent headline
    const investigated = stats.resolved7d || 0;
    const openCount = stats.openCount || 0;
    const headline = `<div class="curiosity-headline"><span class="hl-num">${investigated}</span> investigated this week · <span class="hl-num">${openCount}</span> open</div>`;

    const statsRow = `<div class="stat-row">
      <div class="stat-item"><span class="stat-value">${stats.resolvedAllTime || 0}</span><span class="stat-label">resolved all time</span></div>
      <div class="stat-item"><span class="stat-value">${runs.today || 0}<span style="color:var(--dim);font-size:13px">/${runs.budget?.dailyRunCap || '?'}</span></span><span class="stat-label">runs today</span></div>
      <div class="stat-item"><span class="stat-value">${runs.totalRuns || 0}</span><span class="stat-label">total runs</span></div>
    </div>`;

    const list = `<ul class="item-list">${withShowMore(open, 5, item => {
      const tags = (item.tags || []).map(t => `<span class="tag">${h(t)}</span>`).join('');
      const budgetInfo = item.loopBudget ? `<span class="curiosity-item-meta">Budget: ${item.loopBudget}</span>` : '';
      const ageInfo = item.addedTs ? `<span class="curiosity-item-meta">Open ${relativeTime(item.addedTs).replace(' ago', '')}</span>` : '';
      const meta = (budgetInfo || ageInfo) ? `<div>${budgetInfo}${budgetInfo && ageInfo ? ' · ' : ''}${ageInfo}</div>` : '';
      return `<li><div><div class="item-title">${h(item.title)}</div>${tags}${meta}</div></li>`;
    })}</ul>`;

    // Last resolved line
    const lastResolved = cur.backlog?.lastResolved;
    const resolvedLine = lastResolved
      ? `<div class="curiosity-resolved-line">Last resolved: ${h(lastResolved)}</div>`
      : (investigated > 0 ? `<div class="curiosity-resolved-line">${investigated} item${investigated !== 1 ? 's' : ''} resolved in the last 7 days</div>` : '');

    return card('Curiosity', headline + statsRow + list + resolvedLine, { wide: true });
  }

  function renderProjects(proj) {
    const active = proj.active || [];

    // Summary bar: count by status
    const counts = {};
    active.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1; });
    const statusOrder = ['live', 'building', 'active', 'paused', 'idea', 'done', 'failed', 'killed'];
    const summaryParts = statusOrder
      .filter(s => counts[s])
      .map(s => `<span class="status-badge ${badgeClass(s)}">${counts[s]} ${s}</span>`);
    const summaryBar = summaryParts.length
      ? `<div class="project-summary-bar">${summaryParts.join('')}</div>`
      : '';

    const list = `<ul class="item-list">${withShowMore(active, 5, p =>
      `<li>
        <span class="status-badge ${badgeClass(p.status)}">${h(p.status)}</span>
        <div><div class="item-title">${h(p.name)}</div><div class="item-excerpt">${h(p.notesExcerpt || '')}</div></div>
      </li>`
    )}</ul>`;
    return card('Projects', summaryBar + list, { meta: `${proj.stats?.activeCount || 0} active` });
  }

  function renderCapabilityGaps(gaps) {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    const open = (gaps.open || []).slice().sort((a, b) =>
      (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)
    );
    const statsRow = `<div class="stat-row">
      <div class="stat-item"><span class="stat-value">${gaps.stats?.openCount || 0}</span><span class="stat-label">open gaps</span></div>
    </div>`;
    const list = `<ul class="item-list">${withShowMore(open, 5, g =>
      `<li>
        <span class="status-dot" style="margin-top:6px;background:var(--${g.severity === 'high' ? 'red' : g.severity === 'medium' ? 'yellow' : 'muted'});flex-shrink:0"></span>
        <div><div class="item-title ${severityClass(g.severity)}">${h(g.title)}</div></div>
      </li>`
    )}</ul>`;
    return card('Capability Gaps', statsRow + list);
  }

  function renderDrive(drive) {
    const now = Date.now() / 1000;
    const auditOverdue = drive.next?.auditTs && now > drive.next.auditTs;
    const reportOverdue = drive.next?.reportTs && now > drive.next.reportTs;

    const auditRow = `<div class="drive-row">
      <span class="drive-label">Audit</span>
      <span class="drive-value">${relativeTime(drive.last?.auditTs)} → ${relativeTime(drive.next?.auditTs)}</span>
      ${auditOverdue ? '<span class="overdue-badge">AUDIT OVERDUE</span>' : ''}
    </div>`;
    const reportRow = `<div class="drive-row">
      <span class="drive-label">Report</span>
      <span class="drive-value">${relativeTime(drive.last?.reportTs)} → ${relativeTime(drive.next?.reportTs)}</span>
      ${reportOverdue ? '<span class="overdue-badge">REPORT OVERDUE</span>' : ''}
    </div>`;
    const html = auditRow + reportRow;

    const hasOverdue = auditOverdue || reportOverdue;
    const pillClass = hasOverdue ? 'pill-warn' : (drive.status === 'ok' ? 'pill-ok' : 'pill-warn');
    const pillLabel = hasOverdue ? 'overdue' : (drive.status || 'ok');
    return card('Drive', html, { meta: `<span class="pill ${pillClass}"><span class="pill-dot"></span>${pillLabel}</span>` });
  }

  function renderMemory(mem) {
    const today = mem.today || {};
    const days = [today, ...(mem.recentDays || [])].slice(0, 7);
    const statsHtml = `<div class="memory-stats">
      <div class="stat-item"><span class="stat-value">${formatBytes(today.byteCount || 0)}</span><span class="stat-label">today</span></div>
      <div class="stat-item"><span class="stat-value">${today.lineCount || 0}</span><span class="stat-label">lines</span></div>
      <div class="stat-item"><span class="stat-value">${formatBytes(mem.memoryMd?.byteCount || 0)}</span><span class="stat-label">MEMORY.md</span></div>
    </div>`;
    const chartHtml = `<div class="memory-chart-wrap">
      <div class="chart-label">Daily memory (7 days)</div>
      <canvas id="memory-chart" class="chart-canvas" width="500" height="100"></canvas>
    </div>`;
    const mdStats = mem.memoryMd || {};
    const mdLine = mdStats.lineCount
      ? `<div class="memory-md-line">${mdStats.lineCount} lines &middot; ${formatBytes(mdStats.byteCount || 0)} &middot; Long-term memory</div>`
      : '';
    return card('Memory', statsHtml + chartHtml + mdLine, { wide: true });
  }

  function renderHeartbeat(hb) {
    const checks = hb.lastChecks || {};
    const staleThresholds = {
      inbox: 24 * 3600,
      memory: 4 * 86400,
      drive: 8 * 86400,
      nicotine: 8 * 86400,
      weekly: 8 * 86400,
      calendar: 3 * 86400,
      _default: 24 * 3600,
    };
    function getStaleThreshold(key) {
      const k = key.toLowerCase();
      for (const [name, val] of Object.entries(staleThresholds)) {
        if (name !== '_default' && k.includes(name)) return val;
      }
      return staleThresholds._default;
    }
    const now = Date.now() / 1000;
    const html = Object.entries(checks).filter(([_, ts]) => ts && ts > 1000000).map(([key, ts]) => {
      const threshold = getStaleThreshold(key);
      const stale = ts && (now - ts) > threshold;
      const name = key.replace(/([A-Z])/g, ' $1').trim();
      return `<div class="hb-item">
        <span class="hb-name">${h(name)}</span>
        <span>
          <span class="hb-time">${relativeTime(ts)}</span>
          ${stale ? '<span class="stale-badge">stale</span>' : ''}
        </span>
      </div>`;
    }).join('');
    return card('Heartbeat', html);
  }

  // ── Sparkline (stock history) ────────────────────────────
  function drawSparkline(canvasId, points) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !points.length) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const minTs = points[0].ts;
    const maxTs = points[points.length - 1].ts;
    const range = maxTs - minTs || 1;
    const barH = h - 4;

    points.forEach((p, i) => {
      const nextTs = (i < points.length - 1) ? points[i + 1].ts : maxTs + (range / points.length);
      const x1 = ((p.ts - minTs) / range) * w;
      const x2 = ((nextTs - minTs) / range) * w;
      const inStock = p.availability === 'in_stock';
      ctx.fillStyle = inStock ? 'rgba(43,213,118,0.35)' : 'rgba(255,77,77,0.2)';
      ctx.fillRect(x1, 2, Math.max(x2 - x1, 2), barH);

      // Top line
      ctx.fillStyle = inStock ? '#2BD576' : '#FF4D4D';
      ctx.fillRect(x1, 0, Math.max(x2 - x1, 2), 2);
    });
  }

  // ── Bar chart (memory) ───────────────────────────────────
  function drawMemoryChart(mem) {
    const canvas = document.getElementById('memory-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const ch = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = ch * dpr;
    ctx.scale(dpr, dpr);

    const today = mem.today || {};
    const days = [today, ...(mem.recentDays || [])].slice(0, 7).reverse();
    const maxBytes = Math.max(...days.map(d => d.byteCount || 0), 1);
    const barW = Math.min(40, (w - 20) / days.length - 8);
    const gap = (w - barW * days.length) / (days.length + 1);
    const topPad = 18;
    const botPad = 20;
    const chartH = ch - topPad - botPad;

    days.forEach((d, i) => {
      const x = gap + i * (barW + gap);
      const ratio = (d.byteCount || 0) / maxBytes;
      const barHeight = Math.max(ratio * chartH, 2);
      const y = topPad + chartH - barHeight;

      // Bar
      const grad = ctx.createLinearGradient(x, y, x, y + barHeight);
      grad.addColorStop(0, 'rgba(122,162,255,0.7)');
      grad.addColorStop(1, 'rgba(122,162,255,0.2)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barHeight, 3);
      ctx.fill();

      // Value on top
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(formatBytes(d.byteCount || 0), x + barW / 2, y - 4);

      // Date label
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '10px system-ui, sans-serif';
      const label = (d.date || '').slice(5); // MM-DD
      ctx.fillText(label, x + barW / 2, ch - 4);
    });
  }

  // ── Simple Markdown → HTML ──────────────────────────────
  function renderMarkdown(md) {
    let text = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    text = text.replace(/```[\w]*\n([\s\S]*?)```/g, (_, code) =>
      `<pre class="md-code-block"><code>${code.trim()}</code></pre>`);
    const lines = text.split('\n');
    let html = '';
    let inList = false, listType = '', inBlockquote = false;
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      if (line.includes('<pre class="md-code-block">') || line.includes('</pre>')) {
        if (inList) { html += listType === 'ul' ? '</ul>' : '</ol>'; inList = false; }
        if (inBlockquote) { html += '</blockquote>'; inBlockquote = false; }
        html += line + '\n'; continue;
      }
      if (/^---+\s*$/.test(line.trim())) {
        if (inList) { html += listType === 'ul' ? '</ul>' : '</ol>'; inList = false; }
        if (inBlockquote) { html += '</blockquote>'; inBlockquote = false; }
        html += '<hr class="md-hr">'; continue;
      }
      const hm = line.match(/^(#{1,6})\s+(.+)/);
      if (hm) {
        if (inList) { html += listType === 'ul' ? '</ul>' : '</ol>'; inList = false; }
        if (inBlockquote) { html += '</blockquote>'; inBlockquote = false; }
        const lv = hm[1].length;
        html += `<h${lv} class="md-h${lv}">${inlineFmt(hm[2])}</h${lv}>`; continue;
      }
      if (line.match(/^&gt;\s?(.*)/)) {
        if (inList) { html += listType === 'ul' ? '</ul>' : '</ol>'; inList = false; }
        const c = line.replace(/^&gt;\s?/, '');
        if (!inBlockquote) { html += '<blockquote class="md-blockquote">'; inBlockquote = true; }
        html += `<p>${inlineFmt(c)}</p>`; continue;
      } else if (inBlockquote) { html += '</blockquote>'; inBlockquote = false; }
      if (/^\s*[-*]\s+/.test(line)) {
        const c = line.replace(/^\s*[-*]\s+/, '');
        if (!inList || listType !== 'ul') { if (inList) html += listType === 'ul' ? '</ul>' : '</ol>'; html += '<ul class="md-ul">'; inList = true; listType = 'ul'; }
        html += `<li>${inlineFmt(c)}</li>`; continue;
      }
      if (/^\s*\d+\.\s+/.test(line)) {
        const c = line.replace(/^\s*\d+\.\s+/, '');
        if (!inList || listType !== 'ol') { if (inList) html += listType === 'ul' ? '</ul>' : '</ol>'; html += '<ol class="md-ol">'; inList = true; listType = 'ol'; }
        html += `<li>${inlineFmt(c)}</li>`; continue;
      }
      if (inList) { html += listType === 'ul' ? '</ul>' : '</ol>'; inList = false; }
      if (!line.trim()) { html += '<br>'; continue; }
      html += `<p class="md-p">${inlineFmt(line)}</p>`;
    }
    if (inList) html += listType === 'ul' ? '</ul>' : '</ol>';
    if (inBlockquote) html += '</blockquote>';
    return html;
  }

  function inlineFmt(t) {
    t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    t = t.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return t;
  }

  // ── Document viewer ────────────────────────────────────────
  function renderDocuments(docs) {
    if (!docs || !docs.length) return '';
    const list = docs.map((d, i) =>
      `<div class="doc-item" data-doc-index="${i}">
        <div class="doc-name">${h(d.name)}</div>
        <div class="doc-size">${formatBytes(d.sizeBytes)}</div>
      </div>`
    ).join('');
    return card('Documents', `<div class="doc-list">${list}</div>`, { meta: `${docs.length} files` });
  }

  function openDocModal(doc) {
    const old = document.getElementById('doc-modal');
    if (old) old.remove();
    const modal = document.createElement('div');
    modal.id = 'doc-modal';
    modal.className = 'doc-modal-overlay';
    modal.innerHTML = `<div class="doc-modal-backdrop"></div>
      <div class="doc-modal-container">
        <div class="doc-modal-header">
          <h3 class="doc-modal-title">${h(doc.name)}</h3>
          <button class="doc-modal-close">&times;</button>
        </div>
        <div class="doc-modal-body">${renderMarkdown(doc.content)}</div>
      </div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('.doc-modal-close').addEventListener('click', close);
    modal.querySelector('.doc-modal-backdrop').addEventListener('click', close);
    const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => modal.classList.add('doc-modal-open'));
  }

  // ── Main render ──────────────────────────────────────────
  let dashboardInitialized = false;
  _startDashboard = function() {
    if (dashboardInitialized) return;
    dashboardInitialized = true;
    init();
  };
  // If already authenticated, the early showDashboard() call happened before
  // _startDashboard was set, so trigger it now.
  if (localStorage.getItem(AUTH_KEY) === 'authenticated') _startDashboard();

  async function init() {
    let state;
    try {
      const resp = await fetch('state.json', { cache: 'no-store' });
      state = await resp.json();
    } catch (e) {
      $('#dashboard').innerHTML = `<div class="loading-state">Failed to load state.json</div>`;
      return;
    }

    // Top bar — "Updated Xm ago · Last cron: Xm ago"
    const cronJobs = (state.sections?.cron?.jobs || []);
    const lastCronTs = cronJobs.reduce((max, j) => {
      const t = j.lastRun?.ts || 0;
      return t > max ? t : max;
    }, 0);
    const cronText = lastCronTs ? ` <span class="meta-sep">·</span> Last cron: ${h(relativeTime(lastCronTs))}` : '';
    $('#last-updated').innerHTML = `Updated ${h(relativeTime(state.generatedAt))}${cronText}`;

    const level = state.health?.overall || 'ok';
    const pill = $('#health-pill');
    pill.className = `pill ${healthPillClass(level)}`;
    pill.innerHTML = `<span class="pill-dot"></span>${level}`;

    if (state.links?.repo) {
      const link = $('#repo-link');
      link.href = state.links.repo;
      link.style.display = '';
      link.innerHTML = `GitHub<svg class="ext-icon" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3.5 1.5h7v7"/><path d="M10.5 1.5L1.5 10.5"/></svg>`;
    }

    // Health banner (FIX 1)
    const banner = $('#health-banner');
    const signals = state.health?.signals || [];
    if ((level === 'warn' || level === 'error') && signals.length) {
      banner.className = `health-banner banner-${level}`;
      banner.style.display = '';
      banner.innerHTML = signals.map(s =>
        `<div class="health-banner-line"><span class="banner-icon">${s.level === 'error' ? '✕' : '⚠'}</span>${h(s.message)}</div>`
      ).join('') + `<button class="health-banner-dismiss" onclick="this.parentElement.style.display='none'" title="Dismiss">✕</button>`;
    }

    // Sections
    const s = state.sections || {};
    const docs = state.documents || [];
    const html = [
      s.cron ? renderCron(s.cron) : '',
      s.heartbeat ? renderHeartbeat(s.heartbeat) : '',
      s.drive ? renderDrive(s.drive) : '',
      s.stocks ? renderStocks(s.stocks) : '',
      s.curiosity ? renderCuriosity(s.curiosity) : '',
      s.projects ? renderProjects(s.projects) : '',
      s.capabilityGaps ? renderCapabilityGaps(s.capabilityGaps) : '',
      s.memory ? renderMemory(s.memory) : '',
      renderDocuments(docs),
    ].join('');

    $('#dashboard').innerHTML = html;

    // Wire up document click handlers
    document.querySelectorAll('.doc-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.docIndex, 10);
        if (docs[idx]) openDocModal(docs[idx]);
      });
    });

    // Draw charts after DOM update
    requestAnimationFrame(() => {
      // Sparklines
      if (s.stocks?.monitors) {
        s.stocks.monitors.forEach(m => {
          if (m.history?.points?.length && hasTransition(m.history.points)) {
            drawSparkline(`spark-${m.key}`, m.history.points);
          }
        });
      }
      // Memory chart
      if (s.memory) drawMemoryChart(s.memory);
    });
  }

  // init() is now called via initDashboard() after auth
})();
