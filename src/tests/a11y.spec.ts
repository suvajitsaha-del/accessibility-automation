// src/tests/a11y.spec.ts
import { test } from '@playwright/test';
import { loadConfig } from '../../config/index';
import { runSiteScans } from '../runner/a11y-runner';
import { writeJsonReport } from '../runner/report-writer';
import path from 'node:path';
import { generateReportsFromJson } from '../reporting/reporter';

test('accessibility scan (report-only)', async ({ page }) => {
    const cfg = loadConfig();

    // POC: first site only (GO Transit) — not hardcoded; comes from config.
    const site = cfg.sites[0];
    if (!site) throw new Error('No sites configured');

    const run = await runSiteScans(page, site);

    if (cfg.report.writeJson) {
        await writeJsonReport(cfg.report.outputDir, 'scan-run.json', run);
    }

    // Batch B reporting: consume ONLY the JSON file (clean seam)
    await generateReportsFromJson({
        inputJsonPath: path.join(process.cwd(), cfg.report.outputDir, 'scan-run.json'),
        outputDir: path.join(process.cwd(), cfg.report.outputDir),
        writeHtml: cfg.report.writeHtml,
        writeMarkdownSummary: cfg.report.writeMarkdownSummary,
    });
    // Report-only: never fail the run based on violations.
    // Framework errors are captured in run.errors and pageResult.errors.
});