// src/scanner/version-probe.ts
import { readFileSync } from 'node:fs';
import path from 'node:path';

type ToolVersions = {
  playwrightTestVersion: string;
  axeCoreVersion: string;
  axePlaywrightVersion: string;
};

function safeGetDepVersion(pkg: any, name: string): string {
  const v =
    pkg?.devDependencies?.[name] ??
    pkg?.dependencies?.[name] ??
    pkg?.peerDependencies?.[name];

  return typeof v === 'string' && v.trim() ? v.trim() : 'unknown';
}

export function getToolVersions(): ToolVersions {
  try {
    const repoRoot = process.cwd();
    const pkgPath = path.join(repoRoot, 'package.json');
    const raw = readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw);

    return {
      playwrightTestVersion: safeGetDepVersion(pkg, '@playwright/test'),
      axeCoreVersion: safeGetDepVersion(pkg, 'axe-core'),
      axePlaywrightVersion: safeGetDepVersion(pkg, '@axe-core/playwright'),
    };
  } catch {
    return {
      playwrightTestVersion: 'unknown',
      axeCoreVersion: 'unknown',
      axePlaywrightVersion: 'unknown',
    };
  }
}