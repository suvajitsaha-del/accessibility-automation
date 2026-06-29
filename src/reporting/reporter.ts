// src/reporting/reporter.ts
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { ScanRunResult } from '../contracts/scan-result.types';
import { renderHtml } from './html';
import { renderMarkdown } from './markdown';

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

export async function generateReportsFromJson(args: {
  /**
   * Hard seam: Reporter reads ONLY the JSON output and produces reports.
   * It must not call Playwright or axe.
   */
  inputJsonPath: string; // should be reports/scan-run.json
  outputDir: string; // reports/
  writeHtml: boolean;
  writeMarkdownSummary: boolean;
}): Promise<{ htmlPath?: string; markdownPath?: string }> {
  const scanRun = await readJson<ScanRunResult>(args.inputJsonPath);

  await mkdir(args.outputDir, { recursive: true });

  const out: { htmlPath?: string; markdownPath?: string } = {};

  if (args.writeHtml) {
    const html = renderHtml(scanRun);
    const outPath = path.join(args.outputDir, 'index.html');
    await writeFile(outPath, html, 'utf-8');
    out.htmlPath = outPath;
  }

  if (args.writeMarkdownSummary) {
    const md = renderMarkdown(scanRun);
    const outPath = path.join(args.outputDir, 'summary.md');
    await writeFile(outPath, md, 'utf-8');
    out.markdownPath = outPath;
  }

  return out;
}