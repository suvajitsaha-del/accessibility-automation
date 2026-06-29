// src/reporting/html.ts
import type { ScanRunResult, PageScanResult, FrameworkError, A11yFinding } from '../contracts/scan-result.types';
import { LIMITATIONS_MD } from './limitations';

function h(s: string): string {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&#60;')
    .replaceAll('>', '&#62;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sevClass(sev: string): string {
  switch (sev) {
    case 'critical': return 'sev sev-critical';
    case 'serious': return 'sev sev-serious';
    case 'moderate': return 'sev sev-moderate';
    case 'minor': return 'sev sev-minor';
    default: return 'sev sev-unknown';
  }
}

function fmtError(e: FrameworkError): string {
  return `
    <div class="card err">
      <div><strong>${h(e.type)}</strong>: ${h(e.message)}</div>
      <div class="muted">
        ${e.pageId ? `<div>pageId: ${h(e.pageId)}</div>` : ''}
        ${e.pageUrl ? `<div>pageUrl: ${h(e.pageUrl)}</div>` : ''}
        ${e.interactionKind ? `<div>interactionKind: ${h(e.interactionKind)}</div>` : ''}
        <div>timestamp: ${h(e.timestamp)}</div>
      </div>
    </div>
  `;
}

function fmtFinding(f: A11yFinding): string {
  const nodes = f.nodes.map((n) => `
    <div class="node">
      ${n.html ? `<div><strong>HTML</strong>: <code>${h(n.html)}</code></div>` : ''}
      ${n.target?.length ? `<div><strong>Target(s)</strong>: <ul>${n.target.map((t) => `<li><code>${h(t)}</code></li>`).join('')}</ul></div>` : ''}
      ${n.failureSummary ? `<div><strong>Failure summary</strong>: ${h(n.failureSummary)}</div>` : ''}
    </div>
  `).join('');

  return `
    <div class="card finding">
      <div class="row">
        <div><code>${h(f.ruleId)}</code></div>
        <div class="${sevClass(f.severity)}">${h(f.severity)}</div>
      </div>
      <div><strong>Help</strong>: ${h(f.help)}</div>
      ${f.helpUrl ? `<div><a href="${h(f.helpUrl)}" target="_blank" rel="noreferrer">Help URL</a></div>` : ''}
      ${f.description ? `<div class="muted">${h(f.description)}</div>` : ''}
      ${nodes ? `<div class="nodes"><strong>Affected nodes</strong>${nodes}</div>` : ''}
    </div>
  `;
}

function groupByPage(results: PageScanResult[]): Map<string, PageScanResult[]> {
  const map = new Map<string, PageScanResult[]>();
  for (const r of results) {
    const key = `${r.pageId} — ${r.pageName}`;
    const arr = map.get(key) ?? [];
    arr.push(r);
    map.set(key, arr);
  }
  return map;
}

function mdToHtml(md: string): string {
  // very small markdown subset for LIMITATIONS
  const lines = md.split('\n');
  const out: string[] = [];
  let inUl = false;
  const closeUl = () => { if (inUl) out.push('</ul>'); inUl = false; };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('### ')) { closeUl(); out.push(`<h3>${h(line.slice(4))}</h3>`); continue; }
    if (line.startsWith('## ')) { closeUl(); out.push(`<h2>${h(line.slice(3))}</h2>`); continue; }
    if (line.startsWith('# '))  { closeUl(); out.push(`<h1>${h(line.slice(2))}</h1>`); continue; }
    if (line.startsWith('- ')) {
      if (!inUl) { inUl = true; out.push('<ul>'); }
      out.push(`<li>${h(line.slice(2))}</li>`);
      continue;
    }
    if (!line.trim()) { closeUl(); continue; }
    closeUl();
    out.push(`<p>${h(line)}</p>`);
  }
  closeUl();
  return out.join('\n');
}

export function renderHtml(scanRun: ScanRunResult): string {
  const nav = groupByPage(scanRun.results);
  const navItems = [...nav.keys()].map((k, i) => `<li><a href="#p${i}">${h(k)}</a></li>`).join('');

  const pageSections = [...nav.entries()].map(([pageKey, scans], i) => {
    const scansHtml = scans.map((s) => {
      const violationsHtml = s.violations.length ? s.violations.map(fmtFinding).join('') : `<div class="muted">No violations.</div>`;
      const incompleteHtml = s.incomplete.length
        ? s.incomplete.map((inc) => `
            <div class="card inc">
              <div class="row">
                <div><code>${h(inc.ruleId)}</code></div>
                <div class="sev sev-unknown">not confirmed</div>
              </div>
              <div><strong>Help</strong>: ${h(inc.help)}</div>
              ${inc.helpUrl ? `<div><a href="${h(inc.helpUrl)}" target="_blank" rel="noreferrer">Help URL</a></div>` : ''}
            </div>
          `).join('')
        : `<div class="muted">None.</div>`;

      const errorsHtml = s.errors.length ? s.errors.map(fmtError).join('') : `<div class="muted">None.</div>`;

      return `
        <section class="state">
          <h3>${h(s.level)} — state: ${h(s.state)} — status: ${h(s.status)}</h3>
          <div class="muted">URL: <a href="${h(s.pageUrl)}" target="_blank" rel="noreferrer">${h(s.pageUrl)}</a></div>

          <h4>Violations</h4>
          ${violationsHtml}

          <h4>Incomplete / Needs Manual Review (NOT confirmed violations)</h4>
          ${incompleteHtml}

          <h4>Framework Errors / Skipped (this page/state)</h4>
          ${errorsHtml}
        </section>
      `;
    }).join('');

    return `
      <section id="p${i}" class="page">
        <h2>${h(pageKey)}</h2>
        ${scansHtml}
      </section>
    `;
  }).join('');

  const runErrors = scanRun.errors.length ? scanRun.errors.map(fmtError).join('') : `<div class="muted">None.</div>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Accessibility Report (Report-only)</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 0; background:#0b1020; color:#e8eefc; }
    a { color:#9ecbff; }
    header { padding: 18px 20px; border-bottom: 1px solid #233058; position: sticky; top: 0; background:#0b1020; }
    main { display: grid; grid-template-columns: 320px 1fr; gap: 18px; padding: 18px 20px; }
    nav { border: 1px solid #233058; border-radius: 10px; padding: 12px; background:#121a33; position: sticky; top: 86px; align-self: start;}
    .content { min-width: 0; }
    .muted { color:#aab6d6; }
    code { background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 6px; }
    .card { border: 1px solid #233058; border-radius: 10px; padding: 10px 12px; margin: 10px 0; background:#0f1730; }
    .row { display:flex; justify-content: space-between; gap: 12px; align-items:center; }
    .sev { font-size: 12px; padding: 3px 8px; border-radius: 999px; border: 1px solid #233058; }
    .sev-critical { background: rgba(255, 86, 86, 0.18); border-color: rgba(255, 86, 86, 0.35); }
    .sev-serious { background: rgba(255, 154, 50, 0.18); border-color: rgba(255, 154, 50, 0.35); }
    .sev-moderate { background: rgba(255, 215, 64, 0.16); border-color: rgba(255, 215, 64, 0.35); }
    .sev-minor { background: rgba(144, 238, 144, 0.12); border-color: rgba(144, 238, 144, 0.30); }
    .sev-unknown { background: rgba(160, 174, 255, 0.12); border-color: rgba(160, 174, 255, 0.30); }
    .page { border-top: 1px solid #233058; padding-top: 12px; margin-top: 16px; }
    .state { border: 1px dashed rgba(255,255,255,0.12); border-radius: 10px; padding: 12px; margin: 14px 0; }
    .nodes .node { margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.12); }
    footer { padding: 24px 20px; border-top: 1px solid #233058; color:#aab6d6; }
  </style>
</head>
<body>
  <header>
    <div style="display:flex; justify-content:space-between; gap:16px; align-items: baseline;">
      <div>
        <h1 style="margin:0;">Accessibility Automation Report (Report-only)</h1>
        <div class="muted">
          Started: ${h(scanRun.metadata.startedAt)} &nbsp; | &nbsp; Finished: ${h(scanRun.metadata.finishedAt)}
        </div>
      </div>
      <div class="muted" style="text-align:right;">
        <div>WCAG config: <code>${h(scanRun.metadata.wcagVersion)}</code></div>
        <div>axe-core: ${h(scanRun.metadata.toolchain.axeCoreVersion)}</div>
        <div>@axe-core/playwright: ${h(scanRun.metadata.toolchain.axePlaywrightVersion)}</div>
        <div>@playwright/test: ${h(scanRun.metadata.toolchain.playwrightTestVersion)}</div>
      </div>
    </div>
  </header>

  <main>
    <nav>
      <h2 style="margin:0 0 10px 0; font-size: 16px;">Summary</h2>
      <div class="muted">
        <div><strong>Pages planned:</strong> ${scanRun.summary.pagesPlanned}</div>
        <div><strong>Scans completed:</strong> ${scanRun.summary.pageScansCompleted}</div>
        <div><strong>Total violations:</strong> ${scanRun.summary.totalViolations}</div>
      </div>

      <h3 style="margin:12px 0 8px 0; font-size: 14px;">Severity</h3>
      <ul class="muted">
        <li>Critical: ${scanRun.summary.violationCountBySeverity.critical}</li>
        <li>Serious: ${scanRun.summary.violationCountBySeverity.serious}</li>
        <li>Moderate: ${scanRun.summary.violationCountBySeverity.moderate}</li>
        <li>Minor: ${scanRun.summary.violationCountBySeverity.minor}</li>
        <li>Unknown: ${scanRun.summary.violationCountBySeverity.unknown}</li>
      </ul>

      <h3 style="margin:12px 0 8px 0; font-size: 14px;">Pages</h3>
      <ul>${navItems}</ul>
    </nav>

    <div class="content">
      ${pageSections}

      <section class="page">
        <h2>Framework Errors / Skipped (Run-level)</h2>
        ${runErrors}
      </section>

      <section class="page">
        <h2>Best Practices (Advisory)</h2>
        <div class="muted">Not enabled in this run (includeBestPractices=false).</div>
      </section>

      <section class="page">
        ${mdToHtml(LIMITATIONS_MD)}
      </section>
    </div>
  </main>

  <footer>
    Report-only POC. Automated results do not imply pass/fail compliance.
  </footer>
</body>
</html>`;
}