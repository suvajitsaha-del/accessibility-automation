// src/runner/report-writer.ts
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ScanRunResult } from '../contracts/scan-result.types';

export async function writeJsonReport(outputDir: string, fileName: string, data: ScanRunResult): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const outPath = path.join(outputDir, fileName);
  await writeFile(outPath, JSON.stringify(data, null, 2), 'utf-8');
  return outPath;
}