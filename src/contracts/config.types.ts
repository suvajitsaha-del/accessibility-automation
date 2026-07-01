// src/contracts/config.types.ts
import type { WcagVersion } from '../config/wcag-tags';

export type Severity = 'critical' | 'serious' | 'moderate' | 'minor' | 'unknown';

export type ScanLevel = 'L1' | 'L2';

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
  selectors?: Record<string, string>;
  params?: Record<string, unknown>;
}

export interface PageConfig {
  id: string;
  name: string;
  url?: string;
  scanLevels: ScanLevel[];
  interactions: InteractionStepRef[];
  notes?: string;
}

export interface SiteAuthConfig {
  maxLoginAttempts: number;
  authThrottleMs: number;
  dummyUsername: string;
  dummyPassword: string;
  allowRegistrationSubmit: false;
}

export interface SiteConfig {
  id: string;
  name: string;
  baseUrl: string;
  pages: PageConfig[];
  auth?: SiteAuthConfig;
}

export interface AccessibilityConfig {
  wcagVersion: WcagVersion;
  includeBestPractices: boolean;
  disabledRules: string[];
  enabledRules: string[];
  excludedTags: string[];
  impactToSeverity?: Partial<Record<string, Severity>>;
}

export interface ReportConfig {
  outputDir: string;
  writeJson: boolean;
  writeHtml: boolean;
  writeMarkdownSummary: boolean;
  includeBestPracticeSection: boolean;
}

export interface ExecutionConfig {
  baseUrl: string;
  browser: 'chromium' | 'firefox' | 'webkit';
  headless: boolean;
  navigationTimeoutMs: number;
  actionTimeoutMs: number;
  throttleMsBetweenPages: number;
  downgradeFrameworkErrorsToWarnings: boolean;
  blockThirdPartyRequests?: boolean;
}

export interface RuntimeConfig {
  accessibility: AccessibilityConfig;
  report: ReportConfig;
  execution: ExecutionConfig;
  sites: SiteConfig[];
}