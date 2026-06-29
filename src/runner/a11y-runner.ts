// src/runner/a11y-runner.ts
import type { Page } from '@playwright/test';
import { loadConfig } from '../../config/index';
import type { InteractionStepRef, PageConfig, SiteConfig } from '../contracts/config.types';
import type { FrameworkError, PageScanResult, ScanRunResult } from '../contracts/scan-result.types';
import { runAxeScan } from '../scanner/axe-scanner';
import { getToolVersions } from '../scanner/version-probe';
import { hasUnresolvedSelector, selectorNotFoundError } from './selector-utils';

function nowIso(): string {
    return new Date().toISOString();
}

function newFrameworkError(args: Omit<FrameworkError, 'timestamp'>): FrameworkError {
    return { ...args, timestamp: nowIso() };
}

/**
 * Cookie handling: CANDIDATE (filter-list sourced), not live DOM confirmed.
 * We seed cookies_accepted=true pre-goto, then check banner container post-load.
 *
 * CANDIDATE selectors (need live verification):
 * - div[data-testid="cookies-banner-container"] (from AdGuard filter lists)
 * Cookie name/value (need live verification):
 * - cookies_accepted=true (from AdGuard/Fanboy scriptlet patterns)
 */
async function seedCookieConsentCandidate(page: Page): Promise<void> {
    const url = new URL(page.url() || 'https://www.gotransit.com/en');
    await page.context().addCookies([
        {
            name: 'cookies_accepted',
            value: 'true',
            domain: "www.gotransit.com",
            path: '/',
        },
    ]);
}

async function checkCookieBannerCandidate(
    page: Page,
    siteId: string,
    pageId: string,
    pageUrl: string
): Promise<FrameworkError | null> {
    const candidateBannerSelector = 'div[data-testid="cookies-banner-container"]'; // CANDIDATE (filter list)
    try {
        const locator = page.locator(candidateBannerSelector);
        const count = await locator.count();
        if (count > 0) {
            return newFrameworkError({
                type: 'UnknownError',
                message:
                    'Cookie banner container appears present after cookie seeding (CANDIDATE selector from filter lists). Continuing scan.',
                pageId,
                pageUrl,
                details: {
                    siteId,
                    candidateBannerSelector,
                    count,
                },
            });
        }
        return null;
    } catch (e: any) {
        return newFrameworkError({
            type: 'UnknownError',
            message: `Cookie banner presence check failed (non-fatal). Continuing scan.`,
            pageId,
            pageUrl,
            details: {
                siteId,
                candidateBannerSelector,
                error: e?.message ? String(e.message) : String(e),
            },
        });
    }
}

function buildEmptyPageScan(args: {
    siteId: string;
    pageId: string;
    pageName: string;
    pageUrl: string;
    level: 'L1' | 'L2';
    state: string;
    status: 'framework-error' | 'skipped';
    errors: FrameworkError[];
}): PageScanResult {
    return {
        siteId: args.siteId,
        pageId: args.pageId,
        pageName: args.pageName,
        pageUrl: args.pageUrl,
        level: args.level,
        state: args.state,
        status: args.status,
        violations: [],
        incomplete: [],
        passes: [],
        inapplicable: [],
        errors: args.errors,
    };
}

async function scanL1Page(args: {
    page: Page;
    site: SiteConfig;
    pageConfig: PageConfig;
    pageUrl: string;
    runErrors: FrameworkError[];
}): Promise<PageScanResult> {
    const { page, site, pageConfig, pageUrl, runErrors } = args;

    const cfg = loadConfig();

    // Cookie seed is safe for GT; treat as candidate and non-fatal.
    // We seed before navigation by navigating in the caller after creating a new page and before goto
    // NOTE: page.url() may be empty before goto; seed uses hostname derived from fallback URL above.
    await seedCookieConsentCandidate(page);

    try {
        await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: cfg.execution.navigationTimeoutMs });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForFunction(() => document.body && document.body.innerText.length > 200, { timeout: 15000 })
            .catch(() => { /* non-fatal: scan whatever rendered */ });
        await page.waitForTimeout(2500);
    } catch (e: any) {
        const fe = newFrameworkError({
            type: 'NavigationError',
            message: `Navigation failed: ${pageUrl}`,
            pageId: pageConfig.id,
            pageUrl,
            details: { siteId: site.id, error: e?.message ? String(e.message) : String(e) },
        });
        runErrors.push(fe);
        return buildEmptyPageScan({
            siteId: site.id,
            pageId: pageConfig.id,
            pageName: pageConfig.name,
            pageUrl,
            level: 'L1',
            state: 'default',
            status: 'framework-error',
            errors: [fe],
        });
    }

    // Post-load check banner presence (CANDIDATE selector) and log informational error if present
    const bannerError = await checkCookieBannerCandidate(page, site.id, pageConfig.id, pageUrl);
    const pageErrors: FrameworkError[] = [];
    if (bannerError) {
        runErrors.push(bannerError);
        pageErrors.push(bannerError);
    }

    const axeOut = await runAxeScan(page, {
        accessibility: cfg.accessibility,
        siteId: site.id,
        pageId: pageConfig.id,
        pageUrl,
    });

    // Merge any axe framework errors (AxeError)
    for (const e of axeOut.errors) {
        runErrors.push(e);
        pageErrors.push(e);
    }

    return {
        siteId: site.id,
        pageId: pageConfig.id,
        pageName: pageConfig.name,
        pageUrl,
        level: 'L1',
        state: 'default',
        status: pageErrors.some((e) => e.type === 'AxeError') ? 'framework-error' : 'completed',
        violations: axeOut.violations,
        incomplete: axeOut.incomplete,
        passes: axeOut.passes,
        inapplicable: axeOut.inapplicable,
        errors: pageErrors,
    };
}

async function runL2Interactions(args: {
    page: Page;
    site: SiteConfig;
    pageConfig: PageConfig;
    pageUrl: string;
    runErrors: FrameworkError[];
}): Promise<PageScanResult[]> {
    const { page, site, pageConfig, pageUrl, runErrors } = args;
    const cfg = loadConfig();

    const results: PageScanResult[] = [];

    for (const step of pageConfig.interactions) {
        // Rule: any selector containing "[CONFIRM]" is UNRESOLVED; do not query it.
        if (hasUnresolvedSelector(step.selectors)) {
            const fe = selectorNotFoundError({
                siteId: site.id,
                pageId: pageConfig.id,
                pageUrl,
                interactionKind: step.kind,
                message: `Skipped interaction because selectors contain [CONFIRM] placeholders.`,
                selectors: step.selectors,
            });
            runErrors.push(fe);

            results.push(
                buildEmptyPageScan({
                    siteId: site.id,
                    pageId: pageConfig.id,
                    pageName: pageConfig.name,
                    pageUrl,
                    level: 'L2',
                    state: `interaction:${step.kind}`,
                    status: 'skipped',
                    errors: [fe],
                })
            );
            continue;
        }

        // No resolved interactions implemented yet (by design): keep it safe.
        const fe = newFrameworkError({
            type: 'InteractionError',
            message: `Interaction kind "${step.kind}" not implemented yet (safe skip).`,
            pageId: pageConfig.id,
            pageUrl,
            interactionKind: step.kind,
            details: { siteId: site.id },
        });

        runErrors.push(fe);

        results.push(
            buildEmptyPageScan({
                siteId: site.id,
                pageId: pageConfig.id,
                pageName: pageConfig.name,
                pageUrl,
                level: 'L2',
                state: `interaction:${step.kind}`,
                status: 'skipped',
                errors: [fe],
            })
        );

        // throttle between interactions to reduce flakiness/load
        if (cfg.execution.throttleMsBetweenPages > 0) {
            await page.waitForTimeout(cfg.execution.throttleMsBetweenPages);
        }
    }

    return results;
}

function initScanRunResult(args: {
    wcagVersion: 'wcag21aa' | 'wcag22aa';
    includeBestPractices: boolean;
    tagsUsed: string[];
    excludedTags: string[];
}): ScanRunResult {
    const toolVersions = getToolVersions();
    const startedAt = nowIso();

    return {
        runId: `run-${startedAt}`,
        startedAt,
        finishedAt: startedAt, // overwritten at end
        metadata: {
            startedAt,
            finishedAt: startedAt,
            toolchain: {
                playwrightTestVersion: toolVersions.playwrightTestVersion,
                axeCoreVersion: toolVersions.axeCoreVersion,
                axePlaywrightVersion: toolVersions.axePlaywrightVersion,
            },
            wcagVersion: args.wcagVersion,
            includeBestPractices: args.includeBestPractices,
            tagsUsed: args.tagsUsed,
            excludedTags: args.excludedTags,
        },
        results: [],
        errors: [],
        summary: {
            pagesPlanned: 0,
            pageScansCompleted: 0,
            pageScansWithFrameworkErrors: 0,
            violationCountBySeverity: {
                critical: 0,
                serious: 0,
                moderate: 0,
                minor: 0,
                unknown: 0,
            },
            totalViolations: 0,
        },
    };
}

function addToSummary(run: ScanRunResult, pageResult: PageScanResult): void {
    if (pageResult.status === 'completed') run.summary.pageScansCompleted += 1;
    if (pageResult.status === 'framework-error') run.summary.pageScansWithFrameworkErrors += 1;

    for (const v of pageResult.violations) {
        run.summary.totalViolations += 1;
        run.summary.violationCountBySeverity[v.severity] =
            (run.summary.violationCountBySeverity[v.severity] ?? 0) + 1;
    }
}

export async function runSiteScans(page: Page, site: SiteConfig): Promise<ScanRunResult> {
    const cfg = loadConfig();

    const run = initScanRunResult({
        wcagVersion: cfg.accessibility.wcagVersion,
        includeBestPractices: cfg.accessibility.includeBestPractices,
        tagsUsed: cfg.derived.axeTags,
        excludedTags: cfg.derived.excludedTags,
    });

    // L1 priority: scan every page with a URL (GT-01..GT-09 have URLs except GT-02/GT-03/GT-10 & GT-07/08 runtime)
    const pagesWithUrls = site.pages.filter((p) => typeof p.url === 'string' && p.url.length > 0);
    run.summary.pagesPlanned = pagesWithUrls.length;

    for (const p of pagesWithUrls) {
        const url = p.url!;
        // L1 scan always
        const l1 = await scanL1Page({ page, site, pageConfig: p, pageUrl: url, runErrors: run.errors });
        run.results.push(l1);
        addToSummary(run, l1);

        // L2 scans only if requested and safe (resolved selectors)
        if (p.scanLevels.includes('L2')) {
            const l2 = await runL2Interactions({ page, site, pageConfig: p, pageUrl: url, runErrors: run.errors });
            for (const r of l2) {
                run.results.push(r);
                addToSummary(run, r);
            }
        }

        if (cfg.execution.throttleMsBetweenPages > 0) {
            await page.waitForTimeout(cfg.execution.throttleMsBetweenPages);
        }
    }

    const finishedAt = nowIso();
    run.finishedAt = finishedAt;
    run.metadata.finishedAt = finishedAt;

    return run;
}