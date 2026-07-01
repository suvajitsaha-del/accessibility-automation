// config/index.ts
// Merges + validates all config
import { z } from 'zod';

import { accessibilityConfig } from './accessibility.config';
import { executionConfig } from './execution.config';
import { reportConfig } from './report.config';
import { sitesConfig } from './sites.config';

import { getAxeTagsForVersion, EXCLUDED_TAGS } from '../src/config/wcag-tags';
import type { RuntimeConfig } from '../src/contracts/config.types';

// ---- Zod schemas (runtime validation) ----

const WcagVersionSchema = z.union([z.literal('wcag21aa'), z.literal('wcag22aa')]);

const AccessibilityConfigSchema = z.object({
  wcagVersion: WcagVersionSchema,
  includeBestPractices: z.boolean(),
  disabledRules: z.array(z.string()),
  enabledRules: z.array(z.string()),
  excludedTags: z.array(z.string()),
  impactToSeverity: z
    .record(z.string(), z.union([
      z.literal('critical'),
      z.literal('serious'),
      z.literal('moderate'),
      z.literal('minor'),
      z.literal('unknown'),
    ]))
    .optional(),
});

const ReportConfigSchema = z.object({
  outputDir: z.string().min(1),
  writeJson: z.boolean(),
  writeHtml: z.boolean(),
  writeMarkdownSummary: z.boolean(),
  includeBestPracticeSection: z.boolean(),
});

const ExecutionConfigSchema = z.object({
  baseUrl: z.string(),
  browser: z.union([z.literal('chromium'), z.literal('firefox'), z.literal('webkit')]),
  headless: z.boolean(),
  navigationTimeoutMs: z.number().int().positive(),
  actionTimeoutMs: z.number().int().positive(),
  throttleMsBetweenPages: z.number().int().nonnegative(),
  downgradeFrameworkErrorsToWarnings: z.boolean(),
  blockThirdPartyRequests: z.boolean().optional(),
});

const InteractionStepRefSchema = z.object({
  kind: z.string().min(1),
  selectors: z.record(z.string(), z.string()).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});

const PageConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url().optional(),
  scanLevels: z.array(z.union([z.literal('L1'), z.literal('L2')])).min(1),
  interactions: z.array(InteractionStepRefSchema),
  notes: z.string().optional(),
});

const SiteAuthSchema = z.object({
  maxLoginAttempts: z.number().int().min(0),
  authThrottleMs: z.number().int().min(0),
  dummyUsername: z.string(),
  dummyPassword: z.string(),
  allowRegistrationSubmit: z.literal(false), // hard guard
});

const SiteConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  baseUrl: z.string().url(),
  auth: SiteAuthSchema.optional(),
  pages: z.array(PageConfigSchema).min(1),
});

const RuntimeConfigSchema = z.object({
  accessibility: AccessibilityConfigSchema,
  report: ReportConfigSchema,
  execution: ExecutionConfigSchema,
  sites: z.array(SiteConfigSchema).min(1),
});

// ---- Build + validate runtime config ----

export function loadConfig(): RuntimeConfig & {
  /**
   * Derived values used by scanner/reporting later.
   * Tags must come from src/config/wcag-tags.ts SSoT.
   */
  derived: {
    axeTags: string[];
    excludedTags: string[];
  };
}{
  // Apply locked defaults/guardrails at merge-time too (defense in depth)
  const merged: RuntimeConfig = {
    accessibility: {
      ...accessibilityConfig,
      includeBestPractices: accessibilityConfig.includeBestPractices ?? false,
      excludedTags: accessibilityConfig.excludedTags?.length
        ? accessibilityConfig.excludedTags
        : [...EXCLUDED_TAGS],
    },
    report: reportConfig,
    execution: {
      ...executionConfig,
      downgradeFrameworkErrorsToWarnings:
        executionConfig.downgradeFrameworkErrorsToWarnings ?? true,
    },
    sites: sitesConfig,
  };

  const parsed = RuntimeConfigSchema.safeParse(merged);
  if (!parsed.success) {
    // This is a config authoring error; runner later can choose to treat as framework-error warning.
    // For now, we throw to stop broken config from producing misleading output.
    throw new Error(`Invalid config:\n${parsed.error.toString()}`);
  }

  const axeTags = getAxeTagsForVersion(
    parsed.data.accessibility.wcagVersion,
    parsed.data.accessibility.includeBestPractices
  );

  return {
    ...parsed.data,
    derived: {
      axeTags,
      excludedTags: parsed.data.accessibility.excludedTags,
    },
  } as RuntimeConfig & {
    derived: { axeTags: string[]; excludedTags: string[] };
  };
}