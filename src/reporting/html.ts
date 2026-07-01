/**
 * src/reporting/html.ts
 *
 * Reporting Engineer — HTML Report Generator
 * Produces a self-contained single-file HTML accessibility scan report.
 *
 * Design: Allure-style light theme (KPI cards, CSS tabs, grouped violations)
 * + AODA/WCAG framing sections (report header, testing approach, priority table)
 *
 * HARD CONSTRAINTS:
 *  - Reads ONLY from ScanRunResult — no axe/Playwright calls
 *  - Zero new npm dependencies — plain TypeScript template literals
 *  - Self-contained single HTML file — no external CSS/JS/fonts
 *  - h() escape on ALL user data
 *  - export function renderHtml(scanRun: ScanRunResult): string
 *  - Report-only framing — never says "pass" or "fail" for compliance
 */

import type {
  ScanRunResult,
  PageScanResult,
  A11yFinding,
  FrameworkError,
} from '../contracts/scan-result.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** HTML-escape every piece of user/scan data before interpolation. */
function h(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&#60;')
    .replace(/>/g, '&#62;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const day = d.getDate().toString().padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mon = months[d.getMonth()];
    const yr = d.getFullYear();
    let hr = d.getHours();
    const ampm = hr >= 12 ? 'PM' : 'AM';
    hr = hr % 12 || 12;
    const min = d.getMinutes().toString().padStart(2, '0');
    return `${day} ${mon} ${yr}, ${hr}:${min} ${ampm}`;
  } catch {
    return iso;
  }
}

function formatDuration(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (isNaN(ms) || ms < 0) return '';
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function severityColour(sev: string): string {
  switch (sev.toLowerCase()) {
    case 'critical': return '#d32f2f';
    case 'serious': return '#e65100';
    case 'moderate': return '#f9a825';
    case 'minor': return '#388e3c';
    default: return '#757575';
  }
}

function severityBg(sev: string): string {
  switch (sev.toLowerCase()) {
    case 'critical': return '#ffebee';
    case 'serious': return '#fff3e0';
    case 'moderate': return '#fffde7';
    case 'minor': return '#f1f8e9';
    default: return '#f5f5f5';
  }
}

/** Group PageScanResult[] by pageId, collecting all states per page. */
function groupByPage(results: PageScanResult[]): Map<string, PageScanResult[]> {
  const map = new Map<string, PageScanResult[]>();
  for (const r of results) {
    const arr = map.get(r.pageId) ?? [];
    arr.push(r);
    map.set(r.pageId, arr);
  }
  return map;
}

/** Collect all violations across states for a page group, deduplicated by ruleId+nodeTarget. */
function allViolationsForPage(states: PageScanResult[]): A11yFinding[] {
  const seen = new Set<string>();
  const out: A11yFinding[] = [];
  for (const s of states) {
    for (const v of s.violations) {
      const key = `${v.ruleId}::${v.nodes.map(n => n.target.join(',')).join('|')}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(v);
      }
    }
  }
  return out;
}

/** Violation count for a page group (total node hits across all states). */
function pageViolationCount(states: PageScanResult[]): number {
  return states.reduce((sum, s) => sum + s.violations.reduce((vs, v) => vs + v.nodes.length, 0), 0);
}

/** Sort findings: critical → serious → moderate → minor → unknown. */
const SEV_ORDER: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };
function sortFindings(findings: A11yFinding[]): A11yFinding[] {
  return [...findings].sort((a, b) => {
    const ao = SEV_ORDER[a.severity?.toLowerCase()] ?? 99;
    const bo = SEV_ORDER[b.severity?.toLowerCase()] ?? 99;
    return ao - bo;
  });
}

/** Summarise incomplete findings across all page groups. */
function allIncomplete(results: PageScanResult[]): { ruleId: string; description: string; pages: string[] }[] {
  const map = new Map<string, { description: string; pages: Set<string> }>();
  for (const r of results) {
    for (const inc of r.incomplete) {
      const existing = map.get(inc.ruleId);
      if (existing) {
        existing.pages.add(r.pageName);
      } else {
        map.set(inc.ruleId, { description: inc.description, pages: new Set([r.pageName]) });
      }
    }
  }
  return [...map.entries()].map(([ruleId, v]) => ({ ruleId, description: v.description, pages: [...v.pages] }));
}

// ---------------------------------------------------------------------------
// CSS — complete inline styles (light theme, Allure-inspired)
// ---------------------------------------------------------------------------

function css(): string {
  return `
/* =========================================================
   GO Transit Accessibility Report — Inline Styles
   Light theme, Allure-inspired layout
   ========================================================= */

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --col-critical:  #d32f2f;
  --col-serious:   #e65100;
  --col-moderate:  #f9a825;
  --col-minor:     #388e3c;
  --col-unknown:   #757575;
  --bg-page:       #f4f5f7;
  --bg-card:       #ffffff;
  --bg-sidebar:    #1a1f2e;
  --text-sidebar:  #c8cdd8;
  --accent:        #1a73e8;
  --border:        #e0e0e0;
  --text-primary:  #212121;
  --text-secondary:#5f6368;
  --radius:        8px;
  --shadow:        0 1px 4px rgba(0,0,0,.12);
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
  background: var(--bg-page);
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.5;
}

/* ---- AODA Report Cover ---- */
.aoda-cover {
  background: #1a1f2e;
  color: #fff;
  padding: 40px 48px 36px;
}
.aoda-cover .report-title {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -.3px;
  margin-bottom: 6px;
}
.aoda-cover .report-subtitle {
  font-size: 15px;
  color: #b0bec5;
  margin-bottom: 24px;
}
.aoda-cover .meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px 32px;
}
.aoda-cover .meta-item { display: flex; flex-direction: column; gap: 2px; }
.aoda-cover .meta-label { font-size: 11px; text-transform: uppercase; letter-spacing: .7px; color: #78909c; }
.aoda-cover .meta-value { font-size: 14px; color: #eceff1; font-weight: 500; }
.aoda-cover .report-type-badge {
  display: inline-block;
  margin-top: 20px;
  background: #e65100;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .6px;
  text-transform: uppercase;
  padding: 4px 12px;
  border-radius: 4px;
}

/* ---- Limitations banner ---- */
.limitations-banner {
  background: #fff8e1;
  border-left: 4px solid #f9a825;
  padding: 14px 20px;
  font-size: 13px;
  color: #5f4c00;
  line-height: 1.6;
}
.limitations-banner strong { color: #3e2900; }

/* ---- Testing Approach section ---- */
.approach-section {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin: 20px 24px;
  overflow: hidden;
}
.approach-section summary {
  padding: 14px 20px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
  background: #fafafa;
  border-bottom: 1px solid var(--border);
}
.approach-section summary::-webkit-details-marker { display: none; }
.approach-section summary::before { content: '▶'; font-size: 10px; color: var(--accent); transition: transform .2s; }
details[open] .approach-section summary::before { transform: rotate(90deg); }
.approach-body { padding: 20px 24px; }
.approach-body h4 { font-size: 13px; font-weight: 700; color: var(--text-primary); margin: 16px 0 8px; text-transform: uppercase; letter-spacing: .5px; }
.approach-body h4:first-child { margin-top: 0; }
.approach-body ul { padding-left: 18px; }
.approach-body ul li { margin-bottom: 4px; color: var(--text-secondary); font-size: 13px; }
.approach-body p { font-size: 13px; color: var(--text-secondary); line-height: 1.6; margin-bottom: 8px; }

/* ---- WCAG + Severity tables inside approach ---- */
.approach-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
  font-size: 13px;
}
.approach-table th {
  background: #f5f5f5;
  font-weight: 600;
  text-align: left;
  padding: 8px 12px;
  border: 1px solid var(--border);
  color: var(--text-primary);
}
.approach-table td {
  padding: 8px 12px;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  vertical-align: top;
}
.approach-table tr:nth-child(even) td { background: #fafafa; }
.sev-badge-inline {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .4px;
  color: #fff;
}

/* ---- Top header bar (run metadata) ---- */
.run-header {
  background: #fff;
  border-bottom: 1px solid var(--border);
  padding: 14px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}
.run-header .run-title { font-size: 18px; font-weight: 700; color: var(--text-primary); }
.run-header .run-badges { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.wcag-badge {
  background: #1a73e8;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 4px;
  letter-spacing: .4px;
}
.runid-badge {
  background: #eeeeee;
  color: #555;
  font-size: 11px;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 4px;
  font-family: monospace;
}
.run-times {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}
.run-time-item { display: flex; flex-direction: column; gap: 1px; }
.run-time-label { font-size: 10px; text-transform: uppercase; letter-spacing: .7px; color: var(--text-secondary); }
.run-time-value { font-size: 13px; font-weight: 600; color: var(--text-primary); }

/* ---- KPI cards ---- */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
  padding: 20px 24px 0;
}
.kpi-card {
  background: var(--bg-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 20px 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.kpi-card .kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: .7px; color: var(--text-secondary); }
.kpi-card .kpi-value { font-size: 32px; font-weight: 700; line-height: 1; }
.kpi-card.kpi-total  .kpi-value { color: var(--text-primary); }
.kpi-card.kpi-critical .kpi-value { color: var(--col-critical); }
.kpi-card.kpi-serious  .kpi-value { color: var(--col-serious); }
.kpi-card.kpi-moderate .kpi-value { color: var(--col-moderate); }
.kpi-card.kpi-minor    .kpi-value { color: var(--col-minor); }
.kpi-card.kpi-pages    .kpi-value { color: var(--accent); }
.kpi-sub { font-size: 12px; color: var(--text-secondary); }

/* ---- Severity bar ---- */
.severity-section {
  margin: 20px 24px 0;
  background: var(--bg-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 18px 20px;
}
.section-title { font-size: 13px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: .6px; margin-bottom: 12px; }
.sev-bar {
  height: 12px;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  background: #eee;
}
.sev-bar-seg { height: 100%; transition: width .3s; }
.sev-legend { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
.sev-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}
.sev-chip-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

/* ---- SVG bar chart: violations per page ---- */
.chart-section {
  margin: 16px 24px 0;
  background: var(--bg-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 18px 20px;
}
.chart-section svg { width: 100%; overflow: visible; }

/* ---- Toolchain strip ---- */
.toolchain-strip {
  margin: 16px 24px 0;
  background: var(--bg-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 14px 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
}
.tool-item { font-size: 12px; color: var(--text-secondary); }
.tool-item strong { color: var(--text-primary); }
.tag-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.tag-chip {
  background: #e8f0fe;
  color: #1a73e8;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 3px;
  font-family: monospace;
}

/* ---- Main layout (sidebar + content) ---- */
.main-layout {
  display: flex;
  min-height: calc(100vh - 60px);
}
.sidebar {
  width: 260px;
  min-width: 220px;
  background: var(--bg-sidebar);
  flex-shrink: 0;
  padding: 16px 0;
  position: sticky;
  top: 0;
  align-self: flex-start;
  max-height: 100vh;
  overflow-y: auto;
}
.sidebar-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .8px;
  color: #546e7a;
  padding: 0 16px 10px;
  font-weight: 600;
}
.sidebar-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  color: var(--text-sidebar);
  font-size: 13px;
  border-left: 3px solid transparent;
  transition: background .15s, border-color .15s;
  text-decoration: none;
}
.sidebar-item:hover { background: rgba(255,255,255,.06); }
.sidebar-item.active { background: rgba(26,115,232,.15); border-left-color: var(--accent); color: #fff; }
.sidebar-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--col-critical); flex-shrink: 0; }
.sidebar-dot.no-violation { background: #4caf50; }
.sidebar-count {
  margin-left: auto;
  background: rgba(255,255,255,.12);
  color: #ccc;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: 600;
}
.sidebar-section-header {
  padding: 14px 16px 4px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .8px;
  color: #37474f;
  font-weight: 700;
}

/* ---- Content area ---- */
.content-area {
  flex: 1;
  min-width: 0;
  padding: 0 0 40px;
}

/* ---- Page panel ---- */
.page-panel {
  display: none;
  padding: 20px 24px 0;
}
.page-panel.active { display: block; }

.page-panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.page-panel-title { font-size: 18px; font-weight: 700; color: var(--text-primary); }
.page-panel-url { font-size: 12px; color: var(--accent); word-break: break-all; text-decoration: none; }
.page-panel-url:hover { text-decoration: underline; }

/* ---- State sub-tabs ---- */
.state-tabs { display: flex; gap: 0; border-bottom: 2px solid var(--border); margin-bottom: 16px; flex-wrap: wrap; }
.state-tab {
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  border: none;
  background: none;
  border-bottom: 3px solid transparent;
  margin-bottom: -2px;
  white-space: nowrap;
  transition: color .15s, border-color .15s;
}
.state-tab:hover { color: var(--text-primary); }
.state-tab.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }

/* ---- State panel ---- */
.state-panel { display: none; }
.state-panel.active { display: block; }

/* ---- Violation cards ---- */
.violation-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-left: 4px solid var(--col-critical);
  border-radius: var(--radius);
  margin-bottom: 12px;
  overflow: hidden;
}
.vc-header {
  padding: 14px 16px 10px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex-wrap: wrap;
}
.vc-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: .5px;
  color: #fff;
  flex-shrink: 0;
  white-space: nowrap;
}
.vc-rule-id {
  font-family: monospace;
  font-size: 12px;
  font-weight: 600;
  background: #f5f5f5;
  color: #333;
  padding: 3px 8px;
  border-radius: 3px;
  flex-shrink: 0;
  white-space: nowrap;
}
.vc-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
  min-width: 160px;
}
.vc-body { padding: 0 16px 14px; }
.vc-desc { font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; }
.vc-node-count { font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; }
.vc-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px; }
.vc-tag {
  font-family: monospace;
  font-size: 11px;
  background: #f5f5f5;
  color: #555;
  padding: 2px 6px;
  border-radius: 3px;
}
.vc-helpurl { font-size: 12px; }
.vc-helpurl a { color: var(--accent); text-decoration: none; }
.vc-helpurl a:hover { text-decoration: underline; }

/* ---- Collapsible nodes ---- */
.nodes-toggle {
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 5px 12px;
  font-size: 12px;
  color: var(--accent);
  cursor: pointer;
  margin-top: 4px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.nodes-toggle:hover { background: #e8f0fe; }
.nodes-list { display: none; margin-top: 10px; }
.nodes-list.open { display: block; }
.node-item {
  background: #fafafa;
  border: 1px solid #eee;
  border-radius: 4px;
  padding: 8px 12px;
  margin-bottom: 6px;
}
.node-target {
  font-family: monospace;
  font-size: 11px;
  color: #555;
  background: #f0f0f0;
  padding: 2px 6px;
  border-radius: 3px;
  display: inline-block;
  margin-bottom: 4px;
  word-break: break-all;
}
.node-html {
  font-family: monospace;
  font-size: 11px;
  color: #333;
  background: #f8f8f8;
  border: 1px solid #e0e0e0;
  border-radius: 3px;
  padding: 6px 8px;
  white-space: pre-wrap;
  word-break: break-all;
  margin-bottom: 4px;
}
.node-failure {
  font-size: 11px;
  color: #b71c1c;
  font-style: italic;
}

/* ---- Empty state ---- */
.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-secondary);
}
.empty-state .checkmark { font-size: 40px; margin-bottom: 10px; }
.empty-state p { font-size: 14px; }

/* ---- Incomplete / errors section ---- */
.section-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 16px;
  overflow: hidden;
}
.section-card-header {
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 600;
  background: #fafafa;
  border-bottom: 1px solid var(--border);
  color: var(--text-primary);
}
.section-card-body { padding: 14px 16px; }
.inc-item { margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #f0f0f0; }
.inc-item:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.inc-rule { font-family: monospace; font-size: 12px; font-weight: 600; color: var(--text-primary); }
.inc-desc { font-size: 13px; color: var(--text-secondary); margin-top: 2px; }
.inc-pages { font-size: 11px; color: #888; margin-top: 2px; }
.err-item { margin-bottom: 10px; }
.err-type { font-family: monospace; font-size: 12px; font-weight: 600; color: #c62828; }
.err-msg { font-size: 13px; color: var(--text-secondary); margin-top: 2px; }
.err-meta { font-size: 11px; color: #888; margin-top: 2px; }

/* ---- Skipped pages list ---- */
.skipped-list { list-style: none; padding: 0; }
.skipped-list li { padding: 6px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: var(--text-secondary); }
.skipped-list li:last-child { border-bottom: none; }

/* ---- Scrollbar ---- */
.sidebar::-webkit-scrollbar { width: 4px; }
.sidebar::-webkit-scrollbar-thumb { background: #37474f; border-radius: 2px; }

/* ---- Responsive ---- */
@media (max-width: 768px) {
  .main-layout { flex-direction: column; }
  .sidebar { width: 100%; max-height: 280px; position: relative; }
  .kpi-row { grid-template-columns: repeat(2, 1fr); }
  .aoda-cover { padding: 24px 16px 20px; }
}

/* ---- Print ---- */
@media print {
  .sidebar { display: none; }
  .content-area { padding: 0; }
  .page-panel { display: block !important; page-break-before: always; }
  .state-panel { display: block !important; }
  .nodes-list { display: block !important; }
}
  `.trim();
}

// ---------------------------------------------------------------------------
// JavaScript — inline (tab switching, collapsibles)
// ---------------------------------------------------------------------------

function js(): string {
  return `
(function() {
  // Page sidebar navigation
  function showPage(pageId) {
    document.querySelectorAll('.page-panel').forEach(function(el) {
      el.classList.remove('active');
    });
    document.querySelectorAll('.sidebar-item[data-page]').forEach(function(el) {
      el.classList.remove('active');
    });
    var panel = document.getElementById('page-' + pageId);
    if (panel) panel.classList.add('active');
    var sideItem = document.querySelector('.sidebar-item[data-page="' + pageId + '"]');
    if (sideItem) sideItem.classList.add('active');
    // activate first state tab for this page
    var firstTab = document.querySelector('#page-' + pageId + ' .state-tab');
    if (firstTab) activateStateTab(firstTab);
  }

  function activateStateTab(tabEl) {
    var pagePanel = tabEl.closest('.page-panel');
    if (!pagePanel) return;
    pagePanel.querySelectorAll('.state-tab').forEach(function(t) { t.classList.remove('active'); });
    pagePanel.querySelectorAll('.state-panel').forEach(function(p) { p.classList.remove('active'); });
    tabEl.classList.add('active');
    var stateId = tabEl.getAttribute('data-state');
    var statePanel = pagePanel.querySelector('.state-panel[data-state="' + stateId + '"]');
    if (statePanel) statePanel.classList.add('active');
  }

  // Toggle node list
  window.toggleNodes = function(btnEl) {
    var listId = btnEl.getAttribute('data-target');
    var list = document.getElementById(listId);
    if (!list) return;
    var open = list.classList.toggle('open');
    btnEl.innerHTML = open
      ? '&#9660; Hide affected elements (' + btnEl.getAttribute('data-count') + ')'
      : '&#9654; View affected elements (' + btnEl.getAttribute('data-count') + ')';
  };

  // Attach sidebar click handlers
  document.querySelectorAll('.sidebar-item[data-page]').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.preventDefault();
      showPage(el.getAttribute('data-page'));
    });
  });

  // Attach state tab click handlers
  document.querySelectorAll('.state-tab').forEach(function(el) {
    el.addEventListener('click', function() {
      activateStateTab(el);
    });
  });

  // Show first page by default
  var firstSidebar = document.querySelector('.sidebar-item[data-page]');
  if (firstSidebar) showPage(firstSidebar.getAttribute('data-page'));
})();
  `.trim();
}

// ---------------------------------------------------------------------------
// AODA Cover Section
// ---------------------------------------------------------------------------

function renderAodaCover(scanRun: ScanRunResult): string {
  const meta = scanRun.metadata;
  const wcagLabel = meta.wcagVersion === 'wcag22aa'
    ? 'WCAG 2.2 Level AA'
    : 'WCAG 2.1 Level AA';
  const aodaNote = meta.wcagVersion !== 'wcag22aa'
    ? ' (includes AODA requirements for Ontario)'
    : '';

  // Determine page scope from planned results
  const pageIds = [...new Set(scanRun.results.map(r => r.pageId))];
  const firstPageId = pageIds[0] ?? 'GT-01';
  const lastPageId = pageIds[pageIds.length - 1] ?? 'GT-09';
  const scopeStr = pageIds.length > 0
    ? `Pages ${h(firstPageId)} – ${h(lastPageId)} (${pageIds.length} unique page(s))`
    : 'See page list';

  return `
<div class="aoda-cover">
  <div class="report-title">Accessibility &amp; AODA Automated Scan Report</div>
  <div class="report-subtitle">Web Content Accessibility Guidelines (WCAG) 2.1 Level AA — Automated Scan Findings</div>
  <div class="meta-grid">
    <div class="meta-item">
      <span class="meta-label">Site Under Test</span>
      <span class="meta-value">GO Transit &mdash; gotransit.com</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Scan Date</span>
      <span class="meta-value">${h(formatDateTime(meta.startedAt))}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Standard</span>
      <span class="meta-value">${h(wcagLabel)}${aodaNote}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Tool</span>
      <span class="meta-value">axe-core ${h(meta.toolchain.axeCoreVersion)} + Playwright ${h(meta.toolchain.playwrightTestVersion)}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Scope</span>
      <span class="meta-value">${scopeStr}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Run ID</span>
      <span class="meta-value" style="font-family:monospace;font-size:12px;">${h(scanRun.runId)}</span>
    </div>
  </div>
  <div class="report-type-badge">&#9888;&nbsp; Automated Scan Findings — NOT a Full Manual Audit</div>
</div>
  `.trim();
}

// ---------------------------------------------------------------------------
// Limitations Banner
// ---------------------------------------------------------------------------

function renderLimitationsBanner(): string {
  return `
<div class="limitations-banner">
  <strong>Important — Automation Limitations:</strong>
  Automated accessibility scanning with axe-core detects a subset of WCAG issues that are
  deterministically testable by code. Industry research consistently shows automated tools catch
  <strong>20–40 % of potential WCAG failures</strong>. This report does <strong>NOT</strong> constitute
  a full WCAG audit or proof of AODA compliance. Manual testing — including keyboard-only navigation,
  screen reader testing (NVDA, VoiceOver, JAWS), zoom/reflow, and cognitive-accessibility review —
  is required before compliance claims can be made.
</div>
  `.trim();
}

// ---------------------------------------------------------------------------
// Testing Approach Section (collapsible)
// ---------------------------------------------------------------------------
function buildPagesTestedRows(scanRun: ScanRunResult): string {
  const byPage = groupByPage(scanRun.results);
  const rows: string[] = [];

  for (const [pageId, states] of byPage) {
    const first = states[0];
    const stateLabels = states
      .map(s => s.state === 'default' || !s.state ? `${s.level}/default` : `${s.level}/${s.state}`)
      .join(', ');

    rows.push(`
      <tr>
        <td>${h(pageId)}</td>
        <td>${h(first.pageName)}</td>
        <td><a href="${h(first.pageUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);font-size:12px;">${h(first.pageUrl)}</a></td>
        <td style="font-size:12px;">${h(stateLabels)}</td>
      </tr>
    `.trim());
  }

  return rows.join('\n');
}
function renderApproachSection(scanRun: ScanRunResult): string {
  const wcagLabel = scanRun.metadata.wcagVersion === 'wcag22aa'
    ? 'WCAG 2.2 Level AA'
    : 'WCAG 2.1 Level AA';
  const tagsUsed = scanRun.metadata.tagsUsed.map(t => `<code>${h(t)}</code>`).join(', ');

  return `
<details class="approach-wrapper" open>
  <div class="approach-section">
    <summary>&#128196;&nbsp; Testing Approach &amp; Scope — What Was (and Was Not) Tested</summary>
    <div class="approach-body">

      <h4>1 — What Was Tested</h4>
      <p>
        An automated axe-core scan was executed against the <strong>GO Transit production website
        (gotransit.com)</strong> using the <strong>${h(wcagLabel)}</strong> tag set
        (${tagsUsed}). The scanner checks every DOM element visible at page-load time plus
        selected interactive states.
      </p>

      <h4>2 — Checks Performed</h4>
      <ul>
        <li><strong>L1 — Full-page scans:</strong> Automated axe-core scan on page load for all
            configured pages (home, header/nav, footer, trip planner, schedules, service updates).</li>
        <li><strong>L2 — Component/state scans:</strong> Navigation flyouts, footer region, trip
            planner form, schedules widget, service-updates tabs/accordion, where selectors were
            confirmed via live DOM discovery.</li>
        <li><strong>Cookie/consent banner:</strong> Dismissed before each scan to prevent overlay
            interference.</li>
        <li><strong>Purchase flows blocked:</strong> tickets.gotransit.com domain blocked; no
            ticket-purchase flows were triggered.</li>
        <li><strong>Form validation states:</strong> Login page scanned with obviously-invalid
            dummy credentials to expose error states only (no data change, no account creation).</li>
      </ul>
      
<h4>Pages &amp; States Scanned</h4>
<table class="approach-table">
  <thead>
    <tr><th>ID</th><th>Page</th><th>URL</th><th>States Scanned</th></tr>
  </thead>
  <tbody>
    ${buildPagesTestedRows(scanRun)}
  </tbody>
</table>
      <h4>3 — What Was NOT Tested (Requires Manual Review)</h4>
      <ul>
        <li>Keyboard-only navigation (Tab / Arrow key paths, focus order, focus trapping)</li>
        <li>Screen reader compatibility (NVDA, VoiceOver, JAWS, TalkBack)</li>
        <li>Zoom to 200 % and text-reflow (WCAG 1.4.4, 1.4.10)</li>
        <li>Colour contrast in all interactive states (hover, focus, disabled, error)</li>
        <li>Cognitive / language clarity and reading level</li>
        <li>Manual form completion flows and error-recovery paths</li>
        <li>Login/registration pages (GT-07, GT-08) — pending explicit safety sign-off</li>
        <li>Authenticated / post-login journeys — deferred until non-production test accounts confirmed</li>
        <li>Animated / time-limited content (carousels, auto-advancing banners)</li>
        <li>PDF/document accessibility (timetable downloads, etc.)</li>
      </ul>

      <h4>4 — Severity Priority Levels</h4>
      <table class="approach-table">
        <thead>
          <tr>
            <th style="width:110px">axe Severity</th>
            <th style="width:100px">Priority</th>
            <th>Description &amp; WCAG Implication</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="sev-badge-inline" style="background:#d32f2f">Critical</span></td>
            <td><strong>Must Fix</strong></td>
            <td>Likely a WCAG Level A or AA failure. Blocks users with disabilities from accessing content or completing tasks. Highest remediation priority.</td>
          </tr>
          <tr>
            <td><span class="sev-badge-inline" style="background:#e65100">Serious</span></td>
            <td><strong>Should Fix</strong></td>
            <td>Significant barrier for users with disabilities. May constitute a WCAG AA failure. High remediation priority.</td>
          </tr>
          <tr>
            <td><span class="sev-badge-inline" style="background:#f9a825;color:#333">Moderate</span></td>
            <td><strong>Should Fix</strong></td>
            <td>Medium barrier. Users may be able to work around the issue but with difficulty. WCAG Level AA may be implicated.</td>
          </tr>
          <tr>
            <td><span class="sev-badge-inline" style="background:#388e3c">Minor</span></td>
            <td><strong>Low Priority</strong></td>
            <td>Minor inconvenience. Typically a best-practice gap rather than a hard WCAG failure. Address in future sprints.</td>
          </tr>
        </tbody>
      </table>

      <h4>5 — WCAG Conformance Levels (Reference)</h4>
      <table class="approach-table">
        <thead>
          <tr><th>Level</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Level A</strong></td>
            <td>Most basic web accessibility features. Without these, some users will find it impossible to access information on the site.</td>
          </tr>
          <tr>
            <td><strong>Level AA</strong></td>
            <td>Includes all Level A criteria. Addresses the biggest and most common barriers. <strong>Required under Ontario's AODA Integrated Accessibility Standards Regulation (IASR).</strong> This is the target standard for this scan.</td>
          </tr>
          <tr>
            <td><strong>Level AAA</strong></td>
            <td>Includes A + AA criteria. Significant additional improvements. <em>Out of scope for this scan.</em></td>
          </tr>
        </tbody>
      </table>

    </div>
  </div>
</details>
  `.trim();
}

// ---------------------------------------------------------------------------
// Run Header (Allure-style metadata bar)
// ---------------------------------------------------------------------------

function renderRunHeader(scanRun: ScanRunResult): string {
  const meta = scanRun.metadata;
  const wcagLabel = meta.wcagVersion === 'wcag22aa' ? 'WCAG 2.2 AA' : 'WCAG 2.1 AA';
  return `
<div class="run-header">
  <div>
    <div class="run-title">Accessibility Scan Report</div>
  </div>
  <div class="run-badges">
    <span class="wcag-badge">${h(wcagLabel)}</span>
    <span class="runid-badge">Run ${h(scanRun.runId)}</span>
  </div>
  <div class="run-times">
    <div class="run-time-item">
      <span class="run-time-label">Started</span>
      <span class="run-time-value">${h(formatDateTime(meta.startedAt))}</span>
    </div>
    <div class="run-time-item">
      <span class="run-time-label">Finished</span>
      <span class="run-time-value">${h(formatDateTime(meta.finishedAt))}</span>
    </div>
    <div class="run-time-item">
      <span class="run-time-label">Duration</span>
      <span class="run-time-value">${h(formatDuration(meta.startedAt, meta.finishedAt))}</span>
    </div>
  </div>
</div>
  `.trim();
}

// ---------------------------------------------------------------------------
// KPI Cards
// ---------------------------------------------------------------------------

function renderKpiRow(scanRun: ScanRunResult): string {
  const sv = scanRun.summary.violationCountBySeverity;
  const total = scanRun.summary.totalViolations;
  const pages = scanRun.summary.pageScansCompleted;
  return `
<div class="kpi-row">
  <div class="kpi-card kpi-total">
    <span class="kpi-label">Total Violations</span>
    <span class="kpi-value">${total}</span>
    <span class="kpi-sub">across all pages &amp; states</span>
  </div>
  <div class="kpi-card kpi-critical">
    <span class="kpi-label">Critical</span>
    <span class="kpi-value">${sv.critical}</span>
    <span class="kpi-sub">must fix</span>
  </div>
  <div class="kpi-card kpi-serious">
    <span class="kpi-label">Serious</span>
    <span class="kpi-value">${sv.serious}</span>
    <span class="kpi-sub">should fix</span>
  </div>
  <div class="kpi-card kpi-moderate">
    <span class="kpi-label">Moderate</span>
    <span class="kpi-value">${sv.moderate}</span>
    <span class="kpi-sub">should fix</span>
  </div>
  <div class="kpi-card kpi-minor">
    <span class="kpi-label">Minor</span>
    <span class="kpi-value">${sv.minor}</span>
    <span class="kpi-sub">low priority</span>
  </div>
  <div class="kpi-card kpi-pages">
    <span class="kpi-label">Pages Scanned</span>
    <span class="kpi-value">${pages}</span>
    <span class="kpi-sub">${scanRun.summary.pagesPlanned} planned</span>
  </div>
</div>
  `.trim();
}

// ---------------------------------------------------------------------------
// Severity Stacked Bar
// ---------------------------------------------------------------------------

function renderSeverityBar(scanRun: ScanRunResult): string {
  const sv = scanRun.summary.violationCountBySeverity;
  const total = scanRun.summary.totalViolations || 1;
  const pct = (n: number) => ((n / total) * 100).toFixed(1);

  const segments = [
    { label: 'Critical', count: sv.critical, colour: '#d32f2f' },
    { label: 'Serious', count: sv.serious, colour: '#e65100' },
    { label: 'Moderate', count: sv.moderate, colour: '#f9a825' },
    { label: 'Minor', count: sv.minor, colour: '#388e3c' },
    { label: 'Unknown', count: sv.unknown ?? 0, colour: '#757575' },
  ].filter(s => s.count > 0);

  const bars = segments.map(s =>
    `<div class="sev-bar-seg" style="width:${pct(s.count)}%;background:${s.colour};" title="${s.label}: ${s.count}"></div>`
  ).join('');

  const chips = segments.map(s =>
    `<div class="sev-chip"><div class="sev-chip-dot" style="background:${s.colour};"></div>${h(s.label)} ${s.count} &nbsp;<span style="color:#999">${pct(s.count)}%</span></div>`
  ).join('');

  return `
<div class="severity-section">
  <div class="section-title">Severity Breakdown</div>
  <div class="sev-bar">${bars}</div>
  <div class="sev-legend">${chips}</div>
</div>
  `.trim();
}

// ---------------------------------------------------------------------------
// Violations per Page — SVG Horizontal Bar Chart
// ---------------------------------------------------------------------------

function renderPageChart(byPage: Map<string, PageScanResult[]>): string {
  interface ChartRow { label: string; count: number; }
  const rows: ChartRow[] = [];
  for (const [, states] of byPage) {
    const first = states[0];
    const count = pageViolationCount(states);
    rows.push({ label: `${first.pageId} ${first.pageName}`, count });
  }
  if (rows.length === 0) return '';

  const maxCount = Math.max(...rows.map(r => r.count), 1);
  const BAR_MAX_W = 320;
  const ROW_H = 28;
  const LABEL_W = 180;
  const svgH = rows.length * ROW_H + 10;
  const svgW = LABEL_W + BAR_MAX_W + 60;

  const bars = rows.map((r, i) => {
    const barW = Math.max((r.count / maxCount) * BAR_MAX_W, r.count > 0 ? 4 : 0);
    const y = i * ROW_H + 4;
    const colour = r.count === 0 ? '#c8e6c9' : '#d32f2f';
    const labelX = LABEL_W - 6;
    const labelText = r.label.length > 26 ? r.label.slice(0, 24) + '…' : r.label;
    return `
    <text x="${labelX}" y="${y + 14}" text-anchor="end" font-size="11" fill="#5f6368" font-family="sans-serif">${h(labelText)}</text>
    <rect x="${LABEL_W}" y="${y + 2}" width="${barW}" height="18" rx="3" fill="${colour}" opacity=".85"/>
    ${r.count > 0 ? `<text x="${LABEL_W + barW + 5}" y="${y + 14}" font-size="11" fill="#333" font-family="sans-serif">${r.count}</text>` : ''}
    `.trim();
  }).join('\n');

  return `
<div class="chart-section">
  <div class="section-title">Violations per Page</div>
  <svg height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" aria-label="Violations per page bar chart">
    <title>Violations per page</title>
    ${bars}
  </svg>
</div>
  `.trim();
}

// ---------------------------------------------------------------------------
// Toolchain Strip
// ---------------------------------------------------------------------------

function renderToolchainStrip(scanRun: ScanRunResult): string {
  const tc = scanRun.metadata.toolchain;
  const tags = scanRun.metadata.tagsUsed;
  const bp = scanRun.metadata.includeBestPractices
    ? '<span class="tag-chip" style="background:#e8f5e9;color:#2e7d32">best-practice ✓</span>'
    : '';
  const tagChips = tags.map(t => `<span class="tag-chip">${h(t)}</span>`).join('');
  return `
<div class="toolchain-strip">
  <div class="tool-item">Playwright&nbsp;<strong>${h(tc.playwrightTestVersion)}</strong></div>
  <div class="tool-item">axe-core&nbsp;<strong>${h(tc.axeCoreVersion)}</strong></div>
  <div class="tool-item">@axe-core/playwright&nbsp;<strong>${h(tc.axePlaywrightVersion)}</strong></div>
  <div style="flex:1"></div>
  <div class="tag-chips">${tagChips}${bp}</div>
</div>
  `.trim();
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function renderSidebar(byPage: Map<string, PageScanResult[]>): string {
  const items: string[] = [];
  for (const [pageId, states] of byPage) {
    const first = states[0];
    const count = pageViolationCount(states);
    const dotClass = count > 0 ? 'sidebar-dot' : 'sidebar-dot no-violation';
    items.push(`
      <a class="sidebar-item" data-page="${h(pageId)}" href="#" aria-label="${h(first.pageName)} — ${count} violation${count !== 1 ? 's' : ''}">
        <span class="${dotClass}"></span>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${h(first.pageId)} ${h(first.pageName)}</span>
        <span class="sidebar-count">${count}</span>
      </a>
    `.trim());
  }

  // Errors / skipped entries
  const errored = [...byPage.values()].flat().filter(r => r.status === 'framework-error' || r.status === 'skipped');
  if (errored.length > 0) {
    items.push('<div class="sidebar-section-header">Issues</div>');
    items.push(`<div class="sidebar-item" style="color:#ef9a9a;font-size:12px;">⚠ ${errored.length} scan(s) with errors/skipped</div>`);
  }

  return `
<nav class="sidebar" role="navigation" aria-label="Page list">
  <div class="sidebar-title">Pages</div>
  ${items.join('\n')}
</nav>
  `.trim();
}

// ---------------------------------------------------------------------------
// Individual violation card
// ---------------------------------------------------------------------------

let _nodeCounter = 0;

function renderViolationCard(v: A11yFinding, stateKey: string): string {
  _nodeCounter++;
  const nodeListId = `nodes-${stateKey}-${_nodeCounter}`;
  const sev = v.severity?.toLowerCase() ?? 'unknown';
  const borderColour = severityColour(sev);
  const badgeBg = severityColour(sev);
  const badgeFg = sev === 'moderate' ? '#333' : '#fff';

  const tagChips = v.tags
    .map(t => `<span class="vc-tag">${h(t)}</span>`)
    .join('');

  const nodeCount = v.nodes.length;
  const nodeItems = v.nodes.map((node, ni) => {
    const targets = node.target.join(', ');
    return `
      <div class="node-item">
        <div class="node-target" title="CSS selector">${h(targets)}</div>
        <div class="node-html">${h(node.html.trim())}</div>
        ${node.failureSummary
        ? `<div class="node-failure">${h(node.failureSummary.trim())}</div>`
        : ''}
      </div>
    `.trim();
  }).join('\n');

  return `
<div class="violation-card" style="border-left-color:${borderColour};">
  <div class="vc-header">
    <span class="vc-badge" style="background:${badgeBg};color:${badgeFg};">${h(sev)}</span>
    <span class="vc-rule-id">${h(v.ruleId)}</span>
    <span class="vc-title">${h(v.help)}</span>
  </div>
  <div class="vc-body">
    <p class="vc-desc">${h(v.description)}</p>
    <p class="vc-node-count">${nodeCount} affected element${nodeCount !== 1 ? 's' : ''} across this scan state</p>
    <div class="vc-tags">${tagChips}</div>
    <div class="vc-helpurl">&#128279; <a href="${h(v.helpUrl)}" target="_blank" rel="noopener noreferrer">axe rule documentation</a></div>
    <button class="nodes-toggle" onclick="toggleNodes(this)" data-target="${nodeListId}" data-count="${nodeCount}">
      &#9654; View affected elements (${nodeCount})
    </button>
    <div class="nodes-list" id="${nodeListId}">
      ${nodeItems}
    </div>
  </div>
</div>
  `.trim();
}

// ---------------------------------------------------------------------------
// State panel (L1/L2 scan results for one state)
// ---------------------------------------------------------------------------

function renderStatePanel(
  state: PageScanResult,
  stateIndex: number,
  pageId: string,
): string {
  const stateKey = `${pageId}-${stateIndex}`;
  const sorted = sortFindings(state.violations);

  let body: string;
  if (sorted.length === 0) {
    const incompleteNote = state.incomplete.length > 0
      ? `<p style="margin-top:10px;font-size:13px;color:#e65100;">&#9888; ${state.incomplete.length} item(s) require manual review (listed below).</p>`
      : '';
    body = `
      <div class="empty-state">
        <div class="checkmark">&#10003;</div>
        <p>No automated violations detected in this state.</p>
        ${incompleteNote}
      </div>
    `.trim();
  } else {
    body = sorted.map(v => renderViolationCard(v, stateKey)).join('\n');
  }

  // Incomplete items for this state
  let incompleteHtml = '';
  if (state.incomplete.length > 0) {
    const incItems = state.incomplete.map(inc => `
      <div class="inc-item">
        <div class="inc-rule">${h(inc.ruleId)}</div>
        <div class="inc-desc">${h(inc.description)}</div>
        <div class="inc-pages">${inc.nodes.length} element(s) — manual review required</div>
      </div>
    `.trim()).join('\n');
    incompleteHtml = `
      <div class="section-card" style="margin-top:16px;">
        <div class="section-card-header">&#9888; Incomplete Checks — Requires Manual Review (${state.incomplete.length})</div>
        <div class="section-card-body">${incItems}</div>
      </div>
    `.trim();
  }

  // State-level framework errors
  let errorsHtml = '';
  if (state.errors && state.errors.length > 0) {
    const errItems = state.errors.map(err => `
      <div class="err-item">
        <div class="err-type">${h(err.type)}</div>
        <div class="err-msg">${h(err.message)}</div>
        <div class="err-meta">${h(formatDateTime(err.timestamp))}</div>
      </div>
    `.trim()).join('\n');
    errorsHtml = `
      <div class="section-card" style="margin-top:16px;">
        <div class="section-card-header" style="color:#c62828;">&#10060; Framework Errors (${state.errors.length})</div>
        <div class="section-card-body">${errItems}</div>
      </div>
    `.trim();
  }

  return `
<div class="state-panel" data-state="${stateKey}">
  ${body}
  ${incompleteHtml}
  ${errorsHtml}
</div>
  `.trim();
}

// ---------------------------------------------------------------------------
// Page panel (all states for one page)
// ---------------------------------------------------------------------------

function renderPagePanel(pageId: string, states: PageScanResult[]): string {
  const first = states[0];
  const totalViolations = pageViolationCount(states);

  // Build state tabs
  const tabs = states.map((s, i) => {
    const stateKey = `${pageId}-${i}`;
    const stateLabel = s.state === 'default' || !s.state
      ? `${s.level} — default`
      : `${s.level} — ${s.state}`;
    const skipped = s.status === 'skipped' ? ' ⊘' : s.status === 'framework-error' ? ' ⚠' : '';
    return `<button class="state-tab" data-state="${stateKey}">${h(stateLabel)}${skipped}</button>`;
  }).join('\n');

  // Build state panels
  const panels = states.map((s, i) => renderStatePanel(s, i, pageId)).join('\n');

  return `
<div class="page-panel" id="page-${h(pageId)}">
  <div class="page-panel-header">
    <div>
      <div class="page-panel-title">${h(first.pageId)} — ${h(first.pageName)}</div>
      <a class="page-panel-url" href="${h(first.pageUrl)}" target="_blank" rel="noopener noreferrer">${h(first.pageUrl)}</a>
    </div>
    <div style="text-align:right;">
      <span style="font-size:24px;font-weight:700;color:${totalViolations > 0 ? '#d32f2f' : '#388e3c'};">${totalViolations}</span>
      <span style="font-size:12px;color:#777;display:block;">total element hits</span>
    </div>
  </div>
  <div class="state-tabs">${tabs}</div>
  ${panels}
</div>
  `.trim();
}

// ---------------------------------------------------------------------------
// Global summary panels (incomplete + errors + skipped)
// ---------------------------------------------------------------------------

function renderGlobalSummaryPanels(scanRun: ScanRunResult): string {
  const incomplete = allIncomplete(scanRun.results);
  const errors = scanRun.errors ?? [];
  const skipped = scanRun.results.filter(r => r.status === 'skipped');

  const parts: string[] = [];

  if (incomplete.length > 0) {
    const items = incomplete.map(inc => `
      <div class="inc-item">
        <div class="inc-rule">${h(inc.ruleId)}</div>
        <div class="inc-desc">${h(inc.description)}</div>
        <div class="inc-pages">Seen on: ${inc.pages.map(p => h(p)).join(', ')}</div>
      </div>
    `.trim()).join('\n');
    parts.push(`
      <div class="section-card">
        <div class="section-card-header">&#9888; Incomplete Checks Across All Pages — Manual Review Required (${incomplete.length} rule${incomplete.length !== 1 ? 's' : ''})</div>
        <div class="section-card-body">${items}</div>
      </div>
    `.trim());
  }

  if (errors.length > 0) {
    const errItems = errors.map(err => `
      <div class="err-item">
        <div class="err-type">${h(err.type)}</div>
        <div class="err-msg">${h(err.message)}</div>
        <div class="err-meta">${err.pageId ? `Page: ${h(err.pageId)} | ` : ''}${h(formatDateTime(err.timestamp))}</div>
      </div>
    `.trim()).join('\n');
    parts.push(`
      <div class="section-card">
        <div class="section-card-header" style="color:#c62828;">&#10060; Run-Level Framework Errors (${errors.length})</div>
        <div class="section-card-body">${errItems}</div>
      </div>
    `.trim());
  }

  if (skipped.length > 0) {
    const skipItems = skipped.map(r =>
      `<li>${h(r.pageId)} — ${h(r.pageName)} [${h(r.state)}]</li>`
    ).join('\n');
    parts.push(`
      <div class="section-card">
        <div class="section-card-header">&#8856; Skipped Scans (${skipped.length})</div>
        <div class="section-card-body">
          <ul class="skipped-list">${skipItems}</ul>
        </div>
      </div>
    `.trim());
  }

  if (parts.length === 0) return '';

  return `
<div class="page-panel" id="page-__summary__">
  <div class="page-panel-header">
    <div class="page-panel-title">Global — Incomplete &amp; Errors</div>
  </div>
  ${parts.join('\n')}
</div>
  `.trim();
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

export function renderHtml(scanRun: ScanRunResult): string {
  // Reset counter for idempotency
  _nodeCounter = 0;

  const byPage = groupByPage(scanRun.results);

  const wcagLabel = scanRun.metadata.wcagVersion === 'wcag22aa'
    ? 'WCAG 2.2 Level AA'
    : 'WCAG 2.1 Level AA';

  // Build sidebar entries, including summary panel link if needed
  const hasGlobalSummary =
    allIncomplete(scanRun.results).length > 0 ||
    (scanRun.errors ?? []).length > 0 ||
    scanRun.results.some(r => r.status === 'skipped');

  const sidebarExtra = hasGlobalSummary
    ? `<a class="sidebar-item" data-page="__summary__" href="#" aria-label="Global incomplete and errors">
        <span class="sidebar-dot" style="background:#f9a825;"></span>
        <span style="flex:1">Global — Issues</span>
      </a>`
    : '';

  // Build page panels
  const pagePanels: string[] = [];
  for (const [pageId, states] of byPage) {
    pagePanels.push(renderPagePanel(pageId, states));
  }

  const globalSummary = renderGlobalSummaryPanels(scanRun);
  if (globalSummary) pagePanels.push(globalSummary);

  const sidebarHtml = renderSidebar(byPage);
  // Inject extra sidebar item
  const sidebarWithExtra = sidebarHtml.replace(
    '</nav>',
    `${sidebarExtra}\n</nav>`,
  );

  const scanDate = formatDateTime(scanRun.metadata.startedAt);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="Accessibility and AODA Automated Scan Report — GO Transit — ${h(wcagLabel)}" />
  <meta name="generator" content="go-transit-a11y-poc" />
  <title>A11y Report — GO Transit — ${h(wcagLabel)} — ${h(scanDate)}</title>
  <style>
${css()}
  </style>
</head>
<body>

<!-- ═══════════════════════════════════════════════════
     AODA REPORT COVER
     ═══════════════════════════════════════════════════ -->
${renderAodaCover(scanRun)}

<!-- LIMITATIONS BANNER -->
${renderLimitationsBanner()}

<!-- ═══════════════════════════════════════════════════
     TESTING APPROACH (collapsible)
     ═══════════════════════════════════════════════════ -->
<div style="margin:0 0 4px;">
${renderApproachSection(scanRun)}
</div>

<!-- ═══════════════════════════════════════════════════
     RUN HEADER (Allure-style)
     ═══════════════════════════════════════════════════ -->
${renderRunHeader(scanRun)}

<!-- KPI CARDS -->
${renderKpiRow(scanRun)}

<!-- SEVERITY BAR -->
${renderSeverityBar(scanRun)}

<!-- VIOLATIONS PER PAGE CHART -->
${renderPageChart(byPage)}

<!-- TOOLCHAIN STRIP -->
${renderToolchainStrip(scanRun)}

<!-- ═══════════════════════════════════════════════════
     MAIN LAYOUT: SIDEBAR + CONTENT
     ═══════════════════════════════════════════════════ -->
<div class="main-layout" style="margin-top:20px;">
  ${sidebarWithExtra}
  <main class="content-area" role="main" aria-label="Scan results by page">
    ${pagePanels.join('\n    ')}
  </main>
</div>

<!-- ═══════════════════════════════════════════════════
     FOOTER
     ═══════════════════════════════════════════════════ -->
<footer style="background:#f4f5f7;border-top:1px solid #e0e0e0;padding:16px 24px;font-size:11px;color:#9e9e9e;text-align:center;">
  Generated by go-transit-a11y-poc &mdash; axe-core ${h(scanRun.metadata.toolchain.axeCoreVersion)}
  &mdash; ${h(wcagLabel)} &mdash; Run ${h(scanRun.runId)}
  &mdash; ${h(formatDateTime(scanRun.metadata.finishedAt))}
  &mdash; <strong>Automated scan only. Does not constitute full WCAG/AODA compliance certification.</strong>
</footer>

<script>
${js()}
</script>
</body>
</html>`;
}