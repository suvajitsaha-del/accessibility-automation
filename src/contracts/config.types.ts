// src/contracts/config.types.ts
import type { WcagVersion } from '../config/wcag-tags';

/**
 * Canonical config types used across config/ and src/.
 * NOTE: Zod schemas live in config/index.ts (runtime validation).
 */

export type Severity = 'critical' | 'serious' | 'moderate' | 'minor' | 'unknown';

export type ScanLevel = 'L1' | 'L2';

export interface AccessibilityConfig {
  /**
   * LOCKED NAMING: wcagVersion
   * LOCKED VALUES: "wcag21aa" | "wcag22aa"
   */
  wcagVersion: WcagVersion;

  /**
   * includeBestPractices: false by default (advisory only, separate section later).
   */
  includeBestPractices: boolean;

  /**
   * Optional axe rule IDs to disable (e.g. site-specific false positives).
   * Keep minimal and well-justified.
   */
  disabledRules: string[];

  /**
   * Optional axe rule IDs to include explicitly.
   * If empty, we rely on tags-only selection.
   */
  enabledRules: string[];

  /**
   * Tag filters to exclude even if present (e.g. experimental).
   * Defaults come from src/config/wcag-tags.ts EXCLUDED_TAGS.
   */
  excludedTags: string[];

  /**
   * For later: provide an explicit mapping from axe impact -> framework severity.
   * If not provided, scanner will use a sensible default.
   */
  impactToSeverity?: Partial<Record<string, Severity>>;
}

export interface ReportConfig {
  outputDir: string; // e.g., "reports"
  writeJson: boolean;
  writeHtml: boolean;
  writeMarkdownSummary: boolean;

  /**
   * If true, include a separate advisory section for best-practice findings.
   * This should remain true even if includeBestPractices=false, to keep the
   * report format stable; section may be empty.
   */
  includeBestPracticeSection: boolean;
}

export interface ExecutionConfig {
  /**
   * Base URL can be set globally, but pages may be absolute.
   * Keep empty string by default for clarity.
   */
  baseUrl: string;

  browser: 'chromium' | 'firefox' | 'webkit';
  headless: boolean;

  /**
   * Timeouts/stability
   */
  navigationTimeoutMs: number;
  actionTimeoutMs: number;

  /**
   * Throttling to reduce load/ToS risk and decrease flakiness.
   */
  throttleMsBetweenPages: number;

  /**
   * Keep run green: navigation/interaction failures become warnings in ScanRunResult.errors.
   */
  downgradeFrameworkErrorsToWarnings: boolean;

  /**
   * Optional: block network domains/resources later.
   */
  blockThirdPartyRequests?: boolean;
}

export interface SiteAuthConfig {
  /**
   * NEVER submit real credentials. Use dummy creds only.
   * maxLoginAttempts: 1 (per requirement)
   */
  maxLoginAttempts: number;
  authThrottleMs: number;
  dummyUsername: string;
  dummyPassword: string;

  /**
   * Hard guardrail for registration submit (must remain false).
   */
  allowRegistrationSubmit: boolean;
}

export type InteractionKind =
  | 'dismissCookieBanner'
  | 'openHeaderNav'
  | 'openFooter'
  | 'tripPlannerOpenAndScan'
  | 'schedulesOpenAndScan'
  | 'serviceUpdatesOpenAndScan'
  | 'loginScanOnly'
  | 'registrationScanOnly'
  | 'alertsSignupScanOnly'
  | 'triggerFormValidationErrors';

export interface InteractionStepRef {
  kind: InteractionKind;

  /**
   * Any selectors here MUST be treated as placeholders until confirmed.
   * Mark such selectors with "[CONFIRM]" in sites.config.ts.
   */
  selectors?: Record<string, string>;

  /**
   * Kind-specific parameters (e.g. safe dummy inputs).
   */
  params?: Record<string, unknown>;
}

export interface PageConfig {
  id: string; // e.g., "GT-01"
  name: string;
  url?: string; // optional for runtime-discovered/redirect flows
  scanLevels: ScanLevel[];

  /**
   * Interaction references to produce L2 states.
   * These are executed by Playwright assistant code later.
   */
  interactions: InteractionStepRef[];

  notes?: string;
}

export interface SiteConfig {
  id: string; // e.g., "go-transit"
  name: string;
  /**
   * Base URL for convenience; pages can still be absolute.
   */
  baseUrl: string;
  pages: PageConfig[];
  auth?: SiteAuthConfig;
}

export interface RuntimeConfig {
  accessibility: AccessibilityConfig;
  report: ReportConfig;
  execution: ExecutionConfig;
  sites: SiteConfig[];
}