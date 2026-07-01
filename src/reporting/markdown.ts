/**
 * src/reporting/markdown.ts
 *
 * Reporting Engineer — Markdown Report Generator
 * Produces a professional AODA-style markdown report suitable for stakeholder sharing.
 *
 * Sections:
 *  1. Report Header (cover metadata)
 *  2. Important Notice (automation limitations)
 *  3. Testing Approach (what was / was not tested)
 *  4. Priority/Severity Table
 *  5. WCAG Level Reference Table
 *  6. Executive Summary (KPI counts)
 *  7. Per-page Findings (grouped by severity → rule)
 *  8. Incomplete / Needs Manual Review
 *  9. Framework Errors & Skipped Scans
 * 10. Limitations Statement (verbatim)
 * 11. Appendix: toolchain, tags, run metadata
 *
 * HARD CONSTRAINTS:
 *  - Reads ONLY from ScanRunResult — no axe/Playwright calls
 *  - Zero new npm dependencies
 *  - export function renderMarkdown(scanRun: ScanRunResult): string
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

/** Markdown-escape pipe characters (for table cells) and backtick sequences. */
function md(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/\|/g, '\\|')
    .replace(/`/g, "'");
}

/** Inline code in markdown. */
function code(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return `\`${String(raw).replace(/`/g, "'")}\``;
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const day = d.getDate().toString().padStart(2, '0');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
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

function severityEmoji(sev: string): string {
  switch (sev.toLowerCase()) {
    case 'critical': return '🔴';
    case 'serious':  return '🟠';
    case 'moderate': return '🟡';
    case 'minor':    return '🟢';
    default:         return '⚪';
  }
}

const SEV_ORDER: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

function sortFindings(findings: A11yFinding[]): A11yFinding[] {
  return [...findings].sort((a, b) => {
    const ao = SEV_ORDER[a.severity?.toLowerCase()] ?? 99;
    const bo = SEV_ORDER[b.severity?.toLowerCase()] ?? 99;
    return ao - bo;
  });
}

/** Group results by pageId → array of states. */
function groupByPage(results: PageScanResult[]): Map<string, PageScanResult[]> {
  const map = new Map<string, PageScanResult[]>();
  for (const r of results) {
    const arr = map.get(r.pageId) ?? [];
    arr.push(r);
    map.set(r.pageId, arr);
  }
  return map;
}

/** Collect unique violations across states for a page. */
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

/** Total node hits across all states for a page. */
function pageNodeCount(states: PageScanResult[]): number {
  return states.reduce((sum, s) => sum + s.violations.reduce((vs, v) => vs + v.nodes.length, 0), 0);
}

/** Group A11yFinding[] by severity. */
function groupBySeverity(findings: A11yFinding[]): Map<string, A11yFinding[]> {
  const map = new Map<string, A11yFinding[]>();
  for (const f of findings) {
    const sev = f.severity?.toLowerCase() ?? 'unknown';
    const arr = map.get(sev) ?? [];
    arr.push(f);
    map.set(sev, arr);
  }
  return map;
}

/** Collect all incomplete checks across all results, deduped by ruleId. */
function collectAllIncomplete(results: PageScanResult[]): Map<string, { description: string; pages: string[] }> {
  const map = new Map<string, { description: string; pages: Set<string> }>();
  for (const r of results) {
    for (const inc of r.incomplete) {
      const existing = map.get(inc.ruleId);
      if (existing) {
        existing.pages.add(`${r.pageId} — ${r.pageName} [${r.state}]`);
      } else {
        map.set(inc.ruleId, {
          description: inc.description,
          pages: new Set([`${r.pageId} — ${r.pageName} [${r.state}]`]),
        });
      }
    }
  }
  const out = new Map<string, { description: string; pages: string[] }>();
  for (const [ruleId, v] of map.entries()) {
    out.set(ruleId, { description: v.description, pages: [...v.pages] });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Section 1: Report Header
// ---------------------------------------------------------------------------

function renderHeader(scanRun: ScanRunResult): string {
  const meta = scanRun.metadata;
  const wcagLabel = meta.wcagVersion === 'wcag22aa'
    ? 'WCAG 2.2 Level AA'
    : 'WCAG 2.1 Level AA';

  const pageIds = [...new Set(scanRun.results.map(r => r.pageId))];
  const firstId = pageIds[0] ?? 'GT-01';
  const lastId  = pageIds[pageIds.length - 1] ?? 'GT-09';
  const scopeStr = pageIds.length > 0
    ? `Pages ${firstId} – ${lastId} (${pageIds.length} unique page(s) configured)`
    : 'See results section';

  const lines: string[] = [];
  lines.push('# Accessibility & AODA Automated Scan Report');
  lines.push('');
  lines.push('**Web Content Accessibility Guidelines (WCAG) 2.1 Level AA — Automated Scan Findings**');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|---|---|');
  lines.push(`| **Report Type** | Automated Scan Findings — NOT a Full Manual Audit |`);
  lines.push(`| **Site Under Test** | GO Transit — [https://www.gotransit.com](https://www.gotransit.com) |`);
  lines.push(`| **Scan Date** | ${md(formatDateTime(meta.startedAt))} |`);
  lines.push(`| **Standard** | ${md(wcagLabel)}${meta.wcagVersion !== 'wcag22aa' ? ' — includes AODA requirements for Ontario' : ''} |`);
  lines.push(`| **Tool** | axe-core ${md(meta.toolchain.axeCoreVersion)} + Playwright ${md(meta.toolchain.playwrightTestVersion)} |`);
  lines.push(`| **Scope** | ${md(scopeStr)} |`);
  lines.push(`| **Run ID** | ${code(scanRun.runId)} |`);
  lines.push(`| **Duration** | ${md(formatDuration(meta.startedAt, meta.finishedAt))} |`);
  lines.push('');
  lines.push('---');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Section 2: Important Notice
// ---------------------------------------------------------------------------

function renderNotice(): string {
  const lines: string[] = [];
  lines.push('## ⚠️ Important Notice — Automation Limitations');
  lines.push('');
  lines.push(
    '> Automated accessibility scanning with axe-core detects a **subset** of WCAG issues ' +
    'that are deterministically testable by code. Industry research consistently shows automated ' +
    'tools catch **20–40 % of potential WCAG failures**.'
  );
  lines.push('');
  lines.push(
    '> This report does **NOT** constitute a full WCAG audit or proof of AODA compliance. ' +
    'Manual testing — including keyboard-only navigation, screen reader testing (NVDA, VoiceOver, JAWS), ' +
    'zoom/reflow, and cognitive-accessibility review — **is required** before compliance claims can be made.'
  );
  lines.push('');
  lines.push('---');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Section 3: Testing Approach
// ---------------------------------------------------------------------------

function renderApproach(scanRun: ScanRunResult): string {
  const wcagLabel = scanRun.metadata.wcagVersion === 'wcag22aa'
    ? 'WCAG 2.2 Level AA'
    : 'WCAG 2.1 Level AA';
  const tagsUsed = scanRun.metadata.tagsUsed.map(t => code(t)).join(', ');

  const lines: string[] = [];
  lines.push('## 📋 Testing Approach & Scope');
  lines.push('');

  lines.push('### What Was Tested');
  lines.push('');
  lines.push(
    `An automated axe-core scan was executed against the **GO Transit production website (gotransit.com)** ` +
    `using the **${wcagLabel}** tag set (${tagsUsed}). ` +
    `The scanner checks every DOM element visible at page-load time plus selected interactive states.`
  );
  lines.push('');

  lines.push('### Checks Performed');
  lines.push('');
  lines.push('- **L1 — Full-page scans:** Automated axe-core scan on page load for all configured pages.');
  lines.push('- **L2 — Component/state scans:** Navigation flyouts, footer region, trip planner form, schedules widget,');
  lines.push('  service-updates tabs/accordion — where selectors were confirmed via live DOM discovery.');
  lines.push('- **Cookie/consent banner:** Dismissed before each scan to prevent overlay interference.');
  lines.push('- **Purchase flows blocked:** `tickets.gotransit.com` domain blocked; no ticket-purchase flows were triggered.');
  lines.push('- **Form validation states:** Login page scanned with obviously-invalid dummy credentials to expose');
  lines.push('  error states only (no data change, no account creation).');
  lines.push('');

  lines.push('### What Was NOT Tested (Requires Manual Review)');
  lines.push('');
  lines.push('- ⌨️  **Keyboard-only navigation** — Tab/Arrow key paths, focus order, focus trapping in modals/flyouts');
  lines.push('- 🔊  **Screen reader compatibility** — NVDA, VoiceOver, JAWS, TalkBack');
  lines.push('- 🔍  **Zoom to 200% and text-reflow** — WCAG 1.4.4, 1.4.10');
  lines.push('- 🎨  **Colour contrast in all interactive states** — hover, focus, disabled, error');
  lines.push('- 🧠  **Cognitive / language clarity and reading level**');
  lines.push('- 📝  **Manual form completion flows and error-recovery paths**');
  lines.push('- 🔒  **Login / registration pages (GT-07, GT-08)** — pending explicit safety sign-off');
  lines.push('- 👤  **Authenticated / post-login journeys** — deferred until non-production test accounts confirmed');
  lines.push('- 🎬  **Animated / time-limited content** — carousels, auto-advancing banners');
  lines.push('- 📄  **PDF / document accessibility** — timetable downloads, etc.');
  lines.push('');
  lines.push('---');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Section 4: Severity Priority Table
// ---------------------------------------------------------------------------

function renderSeverityTable(): string {
  const lines: string[] = [];
  lines.push('## 🎯 Severity Priority Levels');
  lines.push('');
  lines.push('| Severity (axe) | Priority | Description & WCAG Implication |');
  lines.push('|---|---|---|');
  lines.push('| 🔴 **Critical** | **Must Fix** | Likely a WCAG Level A or AA failure. Blocks users with disabilities from accessing content or completing tasks. Highest remediation priority. |');
  lines.push('| 🟠 **Serious** | **Should Fix** | Significant barrier for users with disabilities. May constitute a WCAG AA failure. High remediation priority. |');
  lines.push('| 🟡 **Moderate** | **Should Fix** | Medium barrier. Users may be able to work around the issue but with difficulty. WCAG Level AA may be implicated. |');
  lines.push('| 🟢 **Minor** | **Low Priority** | Minor inconvenience. Typically a best-practice gap rather than a hard WCAG failure. Address in future sprints. |');
  lines.push('');
  lines.push('---');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Section 5: WCAG Level Reference Table
// ---------------------------------------------------------------------------

function renderWcagLevelTable(): string {
  const lines: string[] = [];
  lines.push('## 📖 WCAG Conformance Level Reference');
  lines.push('');
  lines.push('| Level | Description |');
  lines.push('|---|---|');
  lines.push('| **Level A** | Most basic web accessibility features. Without these, some users will find it impossible to access information on the site. |');
  lines.push('| **Level AA** | Includes all Level A criteria. Addresses the biggest and most common barriers. **Required under Ontario\'s AODA Integrated Accessibility Standards Regulation (IASR).** This is the target standard for this scan. |');
  lines.push('| **Level AAA** | Includes A + AA criteria. Significant additional improvements. *Out of scope for this scan.* |');
  lines.push('');
  lines.push('---');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Section 6: Executive Summary
// ---------------------------------------------------------------------------

function renderExecutiveSummary(scanRun: ScanRunResult): string {
  const sv = scanRun.summary.violationCountBySeverity;
  const total = scanRun.summary.totalViolations;
  const pages = scanRun.summary.pageScansCompleted;
  const planned = scanRun.summary.pagesPlanned;
  const errors = scanRun.summary.pageScansWithFrameworkErrors;

  const lines: string[] = [];
  lines.push('## 📊 Executive Summary');
  lines.push('');

  // Top-level risk statement
  if (total === 0) {
    lines.push('> ✅ No automated violations were detected across the scanned pages. Manual review is still required.');
  } else if (sv.critical > 0) {
    lines.push(`> 🔴 **${sv.critical} critical violation(s) detected** — these represent likely WCAG Level A/AA failures that may actively block users with disabilities. Immediate remediation is recommended.`);
  } else if (sv.serious > 0) {
    lines.push(`> 🟠 **${sv.serious} serious violation(s) detected** — these represent significant accessibility barriers requiring prompt remediation.`);
  } else {
    lines.push(`> 🟡 **${total} violation(s) detected** — no critical issues found; moderate/minor issues should be addressed in upcoming sprints.`);
  }
  lines.push('');

  lines.push('### Scan Metrics');
  lines.push('');
  lines.push(`| Metric | Count |`);
  lines.push(`|---|---|`);
  lines.push(`| Pages planned | ${planned} |`);
  lines.push(`| Page scans completed | ${pages} |`);
  lines.push(`| Scans with framework errors | ${errors} |`);
  lines.push(`| **Total violations (element hits)** | **${total}** |`);
  lines.push(`| 🔴 Critical | ${sv.critical} |`);
  lines.push(`| 🟠 Serious | ${sv.serious} |`);
  lines.push(`| 🟡 Moderate | ${sv.moderate} |`);
  lines.push(`| 🟢 Minor | ${sv.minor} |`);
  if ((sv.unknown ?? 0) > 0) {
    lines.push(`| ⚪ Unknown | ${sv.unknown} |`);
  }
  lines.push('');

  // Risk summary sentence
  const total2 = total || 1;
  const critPct  = ((sv.critical / total2) * 100).toFixed(0);
  const seriPct  = ((sv.serious  / total2) * 100).toFixed(0);
  if (total > 0) {
    lines.push(
      `**Risk summary:** Of the ${total} total violation(s), ` +
      `${sv.critical} (${critPct}%) are critical and ${sv.serious} (${seriPct}%) are serious, ` +
      `representing the highest-priority remediation items. ` +
      `All findings require developer review and, where applicable, manual verification.`
    );
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Section 7: Per-page Findings
// ---------------------------------------------------------------------------

function renderPageFindings(scanRun: ScanRunResult): string {
  const byPage = groupByPage(scanRun.results);
  const lines: string[] = [];
  lines.push('## 🔍 Per-Page Findings');
  lines.push('');
  lines.push(
    '_Each page lists violations grouped by severity and then by rule. ' +
    'Node counts reflect element hits across all scan states for that page._'
  );
  lines.push('');

  for (const [pageId, states] of byPage) {
    const first = states[0];
    const nodeCount = pageNodeCount(states);
    const allViolations = sortFindings(allViolationsForPage(states));
    const stateList = states.map(s =>
      `${s.level}/${s.state === 'default' || !s.state ? 'default' : s.state}`
    ).join(', ');

    lines.push(`### ${md(first.pageId)} — ${md(first.pageName)}`);
    lines.push('');
    lines.push(`- **URL:** [${md(first.pageUrl)}](${first.pageUrl})`);
    lines.push(`- **Scan states:** ${md(stateList)}`);
    lines.push(`- **Total element hits:** ${nodeCount}`);
    lines.push('');

    if (allViolations.length === 0) {
      lines.push('> ✅ No automated violations detected on this page. Manual review still required.');
      lines.push('');
      // Still list incomplete if any
      const incItems = states.flatMap(s => s.incomplete);
      if (incItems.length > 0) {
        lines.push(`> ⚠️ ${incItems.length} incomplete check(s) require manual review (see Section 8).`);
        lines.push('');
      }
      lines.push('---');
      lines.push('');
      continue;
    }

    // Group by severity
    const bySev = groupBySeverity(allViolations);
    const sevOrder = ['critical', 'serious', 'moderate', 'minor', 'unknown'];

    for (const sev of sevOrder) {
      const findings = bySev.get(sev);
      if (!findings || findings.length === 0) continue;

      const emoji = severityEmoji(sev);
      const sevLabel = sev.charAt(0).toUpperCase() + sev.slice(1);
      lines.push(`#### ${emoji} ${sevLabel} (${findings.length} rule${findings.length !== 1 ? 's' : ''})`);
      lines.push('');
      lines.push('| Rule ID | Description | Nodes | WCAG Tags | Help |');
      lines.push('|---|---|---|---|---|');

      for (const f of findings) {
        const ruleId     = code(f.ruleId);
        const desc       = md(f.help);
        const nodeCount2 = f.nodes.length;
        const tags       = f.tags
          .filter(t => t.startsWith('wcag') || t.startsWith('best'))
          .map(t => code(t))
          .join(' ');
        const helpUrl    = `[docs](${f.helpUrl})`;
        lines.push(`| ${ruleId} | ${desc} | ${nodeCount2} | ${tags} | ${helpUrl} |`);
      }
      lines.push('');

      // Detail block per finding
      for (const f of findings) {
        lines.push(`<details>`);
        lines.push(`<summary>${emoji} ${code(f.ruleId)} — ${md(f.help)} (${f.nodes.length} element${f.nodes.length !== 1 ? 's' : ''})</summary>`);
        lines.push('');
        lines.push(`**Description:** ${md(f.description)}`);
        lines.push('');
        lines.push(`**axe rule:** ${code(f.ruleId)} — [Full documentation](${f.helpUrl})`);
        lines.push('');
        if (f.tags.length > 0) {
          lines.push(`**WCAG tags:** ${f.tags.map(t => code(t)).join(', ')}`);
          lines.push('');
        }
        lines.push(`**Affected elements (${f.nodes.length}):**`);
        lines.push('');
        for (const node of f.nodes) {
          const selector = node.target.join(' > ');
          lines.push(`- **Selector:** ${code(selector)}`);
          lines.push(`  \`\`\`html`);
          lines.push(`  ${node.html.trim().replace(/\n/g, '\n  ')}`);
          lines.push(`  \`\`\``);
          if (node.failureSummary) {
            lines.push(`  > *${md(node.failureSummary.trim())}*`);
          }
        }
        lines.push('');
        lines.push(`</details>`);
        lines.push('');
      }
    }

    // Per-page incomplete
    const incItems = states.flatMap(s => s.incomplete);
    if (incItems.length > 0) {
      lines.push(`> ⚠️ ${incItems.length} incomplete check(s) on this page require manual review (see Section 8).`);
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Section 8: Incomplete / Needs Manual Review
// ---------------------------------------------------------------------------

function renderIncompleteSection(scanRun: ScanRunResult): string {
  const incomplete = collectAllIncomplete(scanRun.results);
  const lines: string[] = [];
  lines.push('## ⚠️ Incomplete Checks — Requires Manual Review');
  lines.push('');

  if (incomplete.size === 0) {
    lines.push('_No incomplete checks recorded in this run._');
    lines.push('');
    lines.push('---');
    lines.push('');
    return lines.join('\n');
  }

  lines.push(
    'The following rules returned **incomplete** results — axe-core could not determine ' +
    'automatically whether a violation exists. **Each item below requires manual accessibility testing.**'
  );
  lines.push('');
  lines.push('| Rule ID | Description | Pages Affected |');
  lines.push('|---|---|---|');

  for (const [ruleId, v] of incomplete.entries()) {
    const pageList = v.pages.slice(0, 3).map(p => md(p)).join('; ') +
      (v.pages.length > 3 ? ` _+${v.pages.length - 3} more_` : '');
    lines.push(`| ${code(ruleId)} | ${md(v.description)} | ${pageList} |`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Section 9: Framework Errors & Skipped Scans
// ---------------------------------------------------------------------------

function renderErrorsSection(scanRun: ScanRunResult): string {
  const errors: FrameworkError[] = scanRun.errors ?? [];
  const skipped = scanRun.results.filter(r => r.status === 'skipped');
  const stateErrors = scanRun.results.flatMap(r => r.errors ?? []);
  const allErrors = [...errors, ...stateErrors];

  const lines: string[] = [];
  lines.push('## ❌ Framework Errors & Skipped Scans');
  lines.push('');

  if (allErrors.length === 0 && skipped.length === 0) {
    lines.push('_No framework errors or skipped scans recorded in this run._');
    lines.push('');
    lines.push('---');
    lines.push('');
    return lines.join('\n');
  }

  if (allErrors.length > 0) {
    lines.push(`### Framework Errors (${allErrors.length})`);
    lines.push('');
    lines.push('| Timestamp | Type | Page | Message |');
    lines.push('|---|---|---|---|');
    for (const err of allErrors) {
      const ts      = md(formatDateTime(err.timestamp));
      const type    = code(err.type);
      const pageRef = err.pageId ? md(err.pageId) : '—';
      const msg     = md(err.message.slice(0, 120) + (err.message.length > 120 ? '…' : ''));
      lines.push(`| ${ts} | ${type} | ${pageRef} | ${msg} |`);
    }
    lines.push('');
  }

  if (skipped.length > 0) {
    lines.push(`### Skipped Scans (${skipped.length})`);
    lines.push('');
    lines.push('| Page ID | Page Name | State | URL |');
    lines.push('|---|---|---|---|');
    for (const r of skipped) {
      lines.push(`| ${md(r.pageId)} | ${md(r.pageName)} | ${md(r.state)} | ${md(r.pageUrl)} |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Section 10: Verbatim Limitations Statement
// ---------------------------------------------------------------------------

function renderLimitationsStatement(): string {
  const lines: string[] = [];
  lines.push('## 📌 Limitations Statement (Verbatim — Do Not Omit)');
  lines.push('');
  lines.push('> **Automated accessibility scanning identifies a subset of potential WCAG failures.**');
  lines.push('> The findings in this report reflect only those issues detectable by the axe-core rule engine');
  lines.push('> at the time of the scan. The following categories of issues are **not detectable by automated');
  lines.push('> scanning** and must be assessed through structured manual testing:');
  lines.push('>');
  lines.push('> - Keyboard navigation order and operability');
  lines.push('> - Screen reader announcement accuracy and context');
  lines.push('> - Zoom/reflow behaviour at 200%+ magnification');
  lines.push('> - Colour contrast in non-default interactive states');
  lines.push('> - Cognitive accessibility: plain language, consistent navigation, error prevention');
  lines.push('> - Time-based media: captions, audio descriptions');
  lines.push('> - Touch target size and spacing on mobile');
  lines.push('> - Accessibility of custom JavaScript widgets (carousels, date pickers, modals) under');
  lines.push('>   keyboard and AT interaction');
  lines.push('>');
  lines.push('> **This report does not constitute proof of WCAG 2.1 AA conformance or AODA compliance.**');
  lines.push('> A complete accessibility audit requires a combination of automated scanning, expert manual');
  lines.push('> review, and testing with users who have disabilities.');
  lines.push('');
  lines.push('---');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Section 11: Appendix
// ---------------------------------------------------------------------------

function renderAppendix(scanRun: ScanRunResult): string {
  const meta = scanRun.metadata;
  const tc   = meta.toolchain;
  const wcagLabel = meta.wcagVersion === 'wcag22aa' ? 'WCAG 2.2 Level AA' : 'WCAG 2.1 Level AA';

  const lines: string[] = [];
  lines.push('## 🔧 Appendix: Toolchain & Configuration');
  lines.push('');

  lines.push('### Toolchain Versions');
  lines.push('');
  lines.push('| Tool | Version |');
  lines.push('|---|---|');
  lines.push(`| \`@playwright/test\` | ${md(tc.playwrightTestVersion)} |`);
  lines.push(`| \`axe-core\` | ${md(tc.axeCoreVersion)} |`);
  lines.push(`| \`@axe-core/playwright\` | ${md(tc.axePlaywrightVersion)} |`);
  lines.push('');

  lines.push('### Scan Configuration');
  lines.push('');
  lines.push('| Setting | Value |');
  lines.push('|---|---|');
  lines.push(`| WCAG standard | ${md(wcagLabel)} |`);
  lines.push(`| Include best practices | ${meta.includeBestPractices ? 'Yes' : 'No'} |`);
  lines.push(`| Tags used | ${meta.tagsUsed.map(t => code(t)).join(', ')} |`);
  if (meta.excludedTags && meta.excludedTags.length > 0) {
    lines.push(`| Tags excluded | ${meta.excludedTags.map(t => code(t)).join(', ')} |`);
  } else {
    lines.push(`| Tags excluded | _(none)_ |`);
  }
  lines.push('');

  lines.push('### Run Metadata');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|---|---|');
  lines.push(`| Run ID | ${code(scanRun.runId)} |`);
  lines.push(`| Started | ${md(formatDateTime(meta.startedAt))} |`);
  lines.push(`| Finished | ${md(formatDateTime(meta.finishedAt))} |`);
  lines.push(`| Duration | ${md(formatDuration(meta.startedAt, meta.finishedAt))} |`);
  lines.push(`| Pages planned | ${scanRun.summary.pagesPlanned} |`);
  lines.push(`| Scans completed | ${scanRun.summary.pageScansCompleted} |`);
  lines.push(`| Scans with errors | ${scanRun.summary.pageScansWithFrameworkErrors} |`);
  lines.push('');

  lines.push('### WCAG Tag Reference');
  lines.push('');
  lines.push('| Tag | Meaning |');
  lines.push('|---|---|');
  lines.push('| `wcag2a` | WCAG 2.x Level A (core rules) |');
  lines.push('| `wcag2aa` | WCAG 2.x Level AA (core rules) |');
  lines.push('| `wcag21a` | WCAG 2.1 Level A additions |');
  lines.push('| `wcag21aa` | WCAG 2.1 Level AA additions |');
  lines.push('| `wcag22aa` | WCAG 2.2 Level AA additions |');
  lines.push('| `best-practice` | axe best-practice rules (advisory, not a WCAG criterion) |');
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('*Report generated by **go-transit-a11y-poc**.');
  lines.push(`Automated scan only — does not constitute full WCAG/AODA compliance certification.*`);
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

export function renderMarkdown(scanRun: ScanRunResult): string {
  const parts: string[] = [
    renderHeader(scanRun),
    renderNotice(),
    renderApproach(scanRun),
    renderSeverityTable(),
    renderWcagLevelTable(),
    renderExecutiveSummary(scanRun),
    renderPageFindings(scanRun),
    renderIncompleteSection(scanRun),
    renderErrorsSection(scanRun),
    renderLimitationsStatement(),
    renderAppendix(scanRun),
  ];

  return parts.join('\n');
}