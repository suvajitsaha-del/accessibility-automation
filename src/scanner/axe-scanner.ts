// src/scanner/axe-scanner.ts
//Wraps axe, normalizes output
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import type { AccessibilityConfig } from '../contracts/config.types';
import type { A11yFinding, FrameworkError } from '../contracts/scan-result.types';
import { getAxeTagsForVersion } from '../config/wcag-tags';

type AxeImpact = 'critical' | 'serious' | 'moderate' | 'minor' | null;

function toSeverity(
    impact: AxeImpact,
    impactToSeverity?: Record<string, 'critical' | 'serious' | 'moderate' | 'minor' | 'unknown'>
): 'critical' | 'serious' | 'moderate' | 'minor' | 'unknown' {
    if (!impact) return 'unknown';
    if (impactToSeverity?.[impact]) return impactToSeverity[impact]!;
    return impact;
}

function normalizeFindings(
  items: Array<{
    id: string;
    description: string;
    help: string;
    helpUrl: string;
    impact: AxeImpact;
    tags: string[];
    nodes: Array<{ html: string; target: string[]; failureSummary?: string }>;
  }>,
  cfg: AccessibilityConfig
): A11yFinding[] {
  return items.map((r) => ({
    ruleId: r.id,
    description: r.description,
    help: r.help,
    helpUrl: r.helpUrl,
    impact: r.impact,
    severity: toSeverity(r.impact, cfg.impactToSeverity as any),
    tags: r.tags,
    nodes: r.nodes.map((n) => ({
      html: n.html,
      target: n.target,
      // exactOptionalPropertyTypes: omit key entirely when undefined
      ...(n.failureSummary !== undefined ? { failureSummary: n.failureSummary } : {}),
    })),
  }));
}

export interface AxeScanOutput {
    violations: A11yFinding[];
    incomplete: A11yFinding[];
    passes: Pick<A11yFinding, 'ruleId' | 'tags'>[];
    inapplicable: Pick<A11yFinding, 'ruleId' | 'tags'>[];
    errors: FrameworkError[];
    tagsUsed: string[];
}

// src/scanner/axe-scanner.ts — change only the opts type and builder setup

export async function runAxeScan(
  page: Page,
  opts: {
    accessibility: AccessibilityConfig;
    siteId: string;
    pageId: string;
    pageUrl: string;
    interactionKind?: string;
    /**
     * Optional CSS selector to scope the axe scan to a specific element.
     * If omitted, axe scans the full page.
     * Used for L2 component scans (e.g. footer-only, nav-open state).
     */
    include?: string;
  }
): Promise<AxeScanOutput> {
  const { accessibility: cfg } = opts;
  const tagsUsed = getAxeTagsForVersion(cfg.wcagVersion, cfg.includeBestPractices);

  try {
    let builder = new AxeBuilder({ page: page as any }).withTags(tagsUsed);

    // Scope scan to a specific element if requested
    if (opts.include) {
      builder = builder.include(opts.include);
    }

    for (const ruleId of cfg.disabledRules) {
      builder = builder.disableRules(ruleId);
    }

    if (cfg.enabledRules.length > 0) {
      builder = builder.withRules(cfg.enabledRules);
    }

    const raw = await builder.analyze();

    const requestedTags = new Set(tagsUsed);
    const filterByTags = <T extends { tags: string[] }>(arr: T[]): T[] =>
      arr.filter((x) => x.tags.some((t) => requestedTags.has(t)));

    const violations = normalizeFindings(filterByTags(raw.violations as any), cfg);
    const incomplete = normalizeFindings(filterByTags(raw.incomplete as any), cfg);
    const passes = filterByTags(raw.passes as any).map((p: any) => ({
      ruleId: p.id as string,
      tags: p.tags as string[],
    }));
    const inapplicable = filterByTags(raw.inapplicable as any).map((p: any) => ({
      ruleId: p.id as string,
      tags: p.tags as string[],
    }));

    return { violations, incomplete, passes, inapplicable, errors: [], tagsUsed };

  } catch (e: any) {
    const err: FrameworkError = {
      type: 'AxeError',
      message: e?.message ? String(e.message) : 'Unknown axe error',
      pageId: opts.pageId,
      pageUrl: opts.pageUrl,
      // exactOptionalPropertyTypes: omit key entirely when undefined
      ...(opts.interactionKind !== undefined ? { interactionKind: opts.interactionKind } : {}),
      timestamp: new Date().toISOString(),
      details: { name: e?.name },
    };
    return { violations: [], incomplete: [], passes: [], inapplicable: [], errors: [err], tagsUsed };
  }
}