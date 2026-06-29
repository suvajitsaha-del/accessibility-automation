// src/reporting/markdown.ts
import type { ScanRunResult, PageScanResult, FrameworkError, A11yFinding } from '../contracts/scan-result.types';
import { LIMITATIONS_MD } from './limitations';

function esc(s: string): string {
  return String(s ?? '').replaceAll('\r', '').trim();
}

function fmtFrameworkError(e: FrameworkError): string {
  const parts = [
    `- **${esc(e.type)}**: ${esc(e.message)}`,
    e.pageId ? `  - pageId: ${esc(e.pageId)}` : '',
    e.pageUrl ? `  - pageUrl: ${esc(e.pageUrl)}` : '',
    e.interactionKind ? `  - interactionKind: ${esc(e.interactionKind)}` : '',
    e.timestamp ? `  - timestamp: ${esc(e.timestamp)}` : '',
  ].filter(Boolean);
  return parts.join('\n');
}

function fmtFinding(f: A11yFinding): string[] {
  const lines: string[] = [];
  lines.push(`- **${esc(f.ruleId)}** (${esc(f.severity)}) — ${esc(f.help)}`);
  if (f.helpUrl) lines.push(`  - Help URL: ${esc(f.helpUrl)}`);
  if (f.description) lines.push(`  - Description: ${esc(f.description)}`);

  for (const node of f.nodes) {
    lines.push(`  - Node:`);
    if (node.html) lines.push(`    - HTML: \`${esc(node.html)}\``);
    if (node.target?.length) {
      lines.push(`    - Target(s):`);
      for (const t of node.target) lines.push(`      - \`${esc(t)}\``);
    }
    if (node.failureSummary) lines.push(`    - Failure summary: ${esc(node.failureSummary)}`);
  }
  return lines;
}

function groupByPageAndState(results: PageScanResult[]): Map<string, PageScanResult[]> {
  const map = new Map<string, PageScanResult[]>();
  for (const r of results) {
    const key = `${r.pageId} — ${r.pageName} (${r.pageUrl})`;
    const arr = map.get(key) ?? [];
    arr.push(r);
    map.set(key, arr);
  }
  return map;
}

export function renderMarkdown(scanRun: ScanRunResult): string {
  const md: string[] = [];

  md.push(`# Accessibility Automation Report (Report-only)`);
  md.push('');
  md.push(`## Summary`);
  md.push(`- Started: ${scanRun.metadata.startedAt}`);
  md.push(`- Finished: ${scanRun.metadata.finishedAt}`);
  md.push(`- WCAG config: ${scanRun.metadata.wcagVersion}`);
  md.push(`- includeBestPractices: ${String(scanRun.metadata.includeBestPractices)}`);
  md.push(`- Pages planned: ${scanRun.summary.pagesPlanned}`);
  md.push(`- Page scans completed: ${scanRun.summary.pageScansCompleted}`);
  md.push(`- Page scans with framework errors: ${scanRun.summary.pageScansWithFrameworkErrors}`);
  md.push(`- Total violations: ${scanRun.summary.totalViolations}`);
  md.push('');
  md.push(`### Severity breakdown (violations)`);
  md.push(`- Critical: ${scanRun.summary.violationCountBySeverity.critical}`);
  md.push(`- Serious: ${scanRun.summary.violationCountBySeverity.serious}`);
  md.push(`- Moderate: ${scanRun.summary.violationCountBySeverity.moderate}`);
  md.push(`- Minor: ${scanRun.summary.violationCountBySeverity.minor}`);
  md.push(`- Unknown: ${scanRun.summary.violationCountBySeverity.unknown}`);
  md.push('');
  md.push(`### Tool versions`);
  md.push(`- @playwright/test: ${scanRun.metadata.toolchain.playwrightTestVersion}`);
  md.push(`- axe-core: ${scanRun.metadata.toolchain.axeCoreVersion}`);
  md.push(`- @axe-core/playwright: ${scanRun.metadata.toolchain.axePlaywrightVersion}`);
  md.push('');

  md.push(`## Details by Page / State`);
  const grouped = groupByPageAndState(scanRun.results);
  for (const [pageKey, pageScans] of grouped.entries()) {
    md.push('');
    md.push(`### ${esc(pageKey)}`);

    for (const scan of pageScans) {
      md.push('');
      md.push(`#### ${scan.level} — state: ${esc(scan.state)} — status: ${esc(scan.status)}`);

      if (scan.violations.length) {
        md.push('');
        md.push(`##### Violations`);
        for (const v of scan.violations) md.push(...fmtFinding(v));
      } else {
        md.push('');
        md.push(`##### Violations`);
        md.push(`- None.`);
      }

      md.push('');
      md.push(`##### Incomplete / Needs Manual Review (NOT confirmed violations)`);
      if (scan.incomplete.length) {
        for (const inc of scan.incomplete) {
          md.push(`- **${esc(inc.ruleId)}** — ${esc(inc.help)}`);
          if (inc.helpUrl) md.push(`  - Help URL: ${esc(inc.helpUrl)}`);
        }
      } else {
        md.push(`- None.`);
      }

      if (scan.errors.length) {
        md.push('');
        md.push(`##### Framework Errors / Skipped (for this page/state)`);
        for (const e of scan.errors) md.push(fmtFrameworkError(e));
      }
    }
  }

  md.push('');
  md.push(`## Framework Errors / Skipped (Run-level)`);
  if (scanRun.errors.length) {
    for (const e of scanRun.errors) md.push(fmtFrameworkError(e));
  } else {
    md.push(`- None.`);
  }

  md.push('');
  md.push(`## Best Practices (Advisory)`);
  md.push(`- Not enabled in this run (includeBestPractices=false).`);
  md.push('');

  md.push(LIMITATIONS_MD);
  md.push('');

  return md.join('\n');
}