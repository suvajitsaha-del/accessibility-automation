// src/runner/a11y-runner.ts
import type { Page } from '@playwright/test';
import { loadConfig } from '../../config/index';
import type { PageConfig, SiteConfig } from '../contracts/config.types';
import type { FrameworkError, PageScanResult, ScanRunResult } from '../contracts/scan-result.types';
import { runAxeScan } from '../scanner/axe-scanner';
import { runInteraction } from './interaction-runner';
import { getToolVersions } from '../scanner/version-probe';
import { dismissCookieBanner } from './interactions/dismiss-cookie-banner';

function nowIso(): string {
  return new Date().toISOString();
}

function buildEmptyPageScan(args: {
  siteId: string;
  pageId: string;
  pageName: string;
  pageUrl: string;
  level: 'L1' | 'L2';
  state: string;
  status: 'completed' | 'skipped' | 'framework-error';
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

async function seedCookieConsent(page: Page, pageUrl: string): Promise<void> {
  // CANDIDATE cookie-seeding (filter-list sourced). Used as a pre-goto fallback.
  // The real click-based dismissal runs after navigation.
  try {
    const hostname = new URL(pageUrl).hostname;
    await page.context().addCookies([
      { name: 'cookies_accepted', value: 'true', domain: hostname, path: '/' },
    ]);
  } catch {
    // non-fatal
  }
}

async function navigatePage(
  page: Page,
  pageUrl: string,
  cfg: ReturnType<typeof loadConfig>,
  pageId: string,
  runErrors: FrameworkError[]
): Promise<boolean> {
  // Block tickets subdomain at context level
  await page.route('**/tickets.gotransit.com/**', (route) => {
    route.abort('blockedbyclient');
  });

  try {
    await page.goto(pageUrl, {
      waitUntil: 'domcontentloaded',
      timeout: cfg.execution.navigationTimeoutMs,
    });
    return true;
  } catch (e: any) {
    const fe: FrameworkError = {
      type: 'NavigationError',
      message: `Navigation failed: ${pageUrl} — ${String(e?.message ?? e)}`,
      pageId,
      pageUrl,
      timestamp: nowIso(),
    };
    runErrors.push(fe);
    return false;
  }
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
  const pageErrors: FrameworkError[] = [];

  // Seed cookie pre-navigation (CANDIDATE)
  await seedCookieConsent(page, pageUrl);

  const navigated = await navigatePage(page, pageUrl, cfg, pageConfig.id, runErrors);
  if (!navigated) {
    const fe = runErrors[runErrors.length - 1]!;
    pageErrors.push(fe);
    return buildEmptyPageScan({
      siteId: site.id,
      pageId: pageConfig.id,
      pageName: pageConfig.name,
      pageUrl,
      level: 'L1',
      state: 'default',
      status: 'framework-error',
      errors: pageErrors,
    });
  }

  // Click-dismiss cookie banner after load (VERIFIED selectors)
  const bannerErrors = await dismissCookieBanner(page);
  for (const e of bannerErrors) {
    runErrors.push(e);
    pageErrors.push(e);
  }

  // Short settle
  await page.waitForTimeout(400);

  // Run axe L1
  const axeOut = await runAxeScan(page, {
    accessibility: cfg.accessibility,
    siteId: site.id,
    pageId: pageConfig.id,
    pageUrl,
  });

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
    inapplicable: axeOut.inapplicable ?? [],
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
    if (step.kind === 'dismissCookieBanner') continue;

    const interactionResult = await runInteraction(page, step.kind, pageConfig.id, pageUrl);
    for (const e of interactionResult.errors) runErrors.push(e);

    // ── Multi-scope path (openHeaderNav, tripPlannerOpenAndScan, etc.) ────────
    if (interactionResult.scanScopes && interactionResult.scanScopes.length > 0) {
      for (const scope of interactionResult.scanScopes) {
        const axeOut = await runAxeScan(page, {
          accessibility: cfg.accessibility,
          siteId: site.id,
          pageId: pageConfig.id,
          pageUrl,
          interactionKind: step.kind,
          ...(scope.scope ? { include: scope.scope } : {}),
        });

        const pageErrors = [...axeOut.errors];
        for (const e of axeOut.errors) runErrors.push(e);

        results.push({
          siteId: site.id,
          pageId: pageConfig.id,
          pageName: pageConfig.name,
          pageUrl,
          level: 'L2',
          state: scope.stateLabel,
          status: axeOut.errors.length > 0 ? 'framework-error' : 'completed',
          violations: axeOut.violations,
          incomplete: axeOut.incomplete,
          passes: axeOut.passes,
          inapplicable: axeOut.inapplicable ?? [],
          errors: pageErrors,
        });

        if (cfg.execution.throttleMsBetweenPages > 0) {
          await page.waitForTimeout(cfg.execution.throttleMsBetweenPages);
        }
      }
      continue;
    }

    // ── Single-scope path (openFooter) or skip ────────────────────────────────
    if (!interactionResult.shouldScan) {
      results.push(buildEmptyPageScan({
        siteId: site.id,
        pageId: pageConfig.id,
        pageName: pageConfig.name,
        pageUrl,
        level: 'L2',
        state: interactionResult.stateLabel,
        status: 'skipped',
        errors: interactionResult.errors,
      }));
      continue;
    }

    const axeOut = await runAxeScan(page, {
      accessibility: cfg.accessibility,
      siteId: site.id,
      pageId: pageConfig.id,
      pageUrl,
      interactionKind: step.kind,
      ...(interactionResult.scanScope ? { include: interactionResult.scanScope } : {}),
    });

    const pageErrors = [...interactionResult.errors, ...axeOut.errors];
    for (const e of axeOut.errors) runErrors.push(e);

    results.push({
      siteId: site.id,
      pageId: pageConfig.id,
      pageName: pageConfig.name,
      pageUrl,
      level: 'L2',
      state: interactionResult.stateLabel,
      status: axeOut.errors.length > 0 ? 'framework-error' : 'completed',
      violations: axeOut.violations,
      incomplete: axeOut.incomplete,
      passes: axeOut.passes,
      inapplicable: axeOut.inapplicable ?? [],
      errors: pageErrors,
    });

    if (cfg.execution.throttleMsBetweenPages > 0) {
      await page.waitForTimeout(cfg.execution.throttleMsBetweenPages);
    }
  }

  return results;
}

function initScanRunResult(cfg: ReturnType<typeof loadConfig>): ScanRunResult {
  const startedAt = nowIso();
  const toolVersions = getToolVersions();
  return {
    runId: `run-${startedAt}`,
    startedAt,
    finishedAt: startedAt,
    metadata: {
      startedAt,
      finishedAt: startedAt,
      toolchain: {
        playwrightTestVersion: toolVersions.playwrightTestVersion,
        axeCoreVersion: toolVersions.axeCoreVersion,
        axePlaywrightVersion: toolVersions.axePlaywrightVersion,
      },
      wcagVersion: cfg.accessibility.wcagVersion,
      includeBestPractices: cfg.accessibility.includeBestPractices,
      tagsUsed: cfg.derived.axeTags,
      excludedTags: cfg.derived.excludedTags,
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

function addToSummary(run: ScanRunResult, r: PageScanResult): void {
  if (r.status === 'completed') run.summary.pageScansCompleted += 1;
  if (r.status === 'framework-error') run.summary.pageScansWithFrameworkErrors += 1;
  for (const v of r.violations) {
    run.summary.totalViolations += 1;
    run.summary.violationCountBySeverity[v.severity] =
      (run.summary.violationCountBySeverity[v.severity] ?? 0) + 1;
  }
}

export async function runSiteScans(page: Page, site: SiteConfig): Promise<ScanRunResult> {
  const cfg = loadConfig();
  const run = initScanRunResult(cfg);

  const pagesWithUrls = site.pages.filter(
    (p): p is PageConfig & { url: string } =>
      typeof p.url === 'string' && p.url.length > 0
  );
  run.summary.pagesPlanned = pagesWithUrls.length;

  for (const pageConfig of pagesWithUrls) {
    // L1
    const l1 = await scanL1Page({
      page,
      site,
      pageConfig,
      pageUrl: pageConfig.url,
      runErrors: run.errors,
    });
    run.results.push(l1);
    addToSummary(run, l1);

    // L2 (only if configured)
    if (pageConfig.scanLevels.includes('L2') && pageConfig.interactions.length > 0) {
      const l2Results = await runL2Interactions({
        page,
        site,
        pageConfig,
        pageUrl: pageConfig.url,
        runErrors: run.errors,
      });
      for (const r of l2Results) {
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