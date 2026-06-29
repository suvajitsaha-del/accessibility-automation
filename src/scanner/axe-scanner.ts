// src/scanner/axe-scanner.ts
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
            failureSummary: n.failureSummary,
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

export async function runAxeScan(
    page: Page,
    opts: {
        accessibility: AccessibilityConfig;
        siteId: string;
        pageId: string;
        pageUrl: string;
        interactionKind?: string;
    }
): Promise<AxeScanOutput> {
    const { accessibility: cfg } = opts;

    const tagsUsed = getAxeTagsForVersion(cfg.wcagVersion, cfg.includeBestPractices);

    try {
        // let builder = new AxeBuilder({ page }).withTags(tagsUsed);
        let builder = new AxeBuilder({ page: page as any }).withTags(tagsUsed);

        // Disable rules explicitly
        for (const ruleId of cfg.disabledRules) {
            builder = builder.disableRules(ruleId);
        }

        // Optional explicit enables: implemented by "withRules" if provided.
        // NOTE: We do NOT use inline tags; tags are resolved only via wcag-tags SSoT.
        if (cfg.enabledRules.length > 0) {
            builder = builder.withRules(cfg.enabledRules);
        }

        // Excluded tags: implemented by excluding rule IDs whose tags match excludedTags.
        // @axe-core/playwright does not directly accept "excludeTags", so we apply a post-filter.
        const raw = await builder.analyze();

        // // --- TEMP DEBUG (remove after diagnosis) ---
        // console.log('[AXE DEBUG] url:', opts.pageUrl);
        // console.log('[AXE DEBUG] raw.violations:', raw.violations.length);
        // console.log('[AXE DEBUG] raw.passes:', raw.passes.length);
        // console.log('[AXE DEBUG] raw.incomplete:', raw.incomplete.length);
        // console.log('[AXE DEBUG] raw.inapplicable:', raw.inapplicable.length);
        // console.log('[AXE DEBUG] tagsUsed:', tagsUsed);
        // // --- END DEBUG ---
        const requestedTags = new Set(tagsUsed);

        const filterByExcludedTags = <T extends { tags: string[] }>(arr: T[]): T[] =>
            arr.filter((x) => x.tags.some((t) => requestedTags.has(t)));

        const violations = normalizeFindings(filterByExcludedTags(raw.violations as any), cfg);
        const incomplete = normalizeFindings(filterByExcludedTags(raw.incomplete as any), cfg);

        const passes = filterByExcludedTags(raw.passes as any).map((p: any) => ({
            ruleId: p.id as string,
            tags: p.tags as string[],
        }));

        const inapplicable = filterByExcludedTags(raw.inapplicable as any).map((p: any) => ({
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
            interactionKind: opts.interactionKind,
            timestamp: new Date().toISOString(),
            details: {
                name: e?.name,
            },
        };

        // Report-only: return empty findings and record error (do not throw)
        return {
            violations: [],
            incomplete: [],
            passes: [],
            inapplicable: [],
            errors: [err],
            tagsUsed,
        };
    }
}