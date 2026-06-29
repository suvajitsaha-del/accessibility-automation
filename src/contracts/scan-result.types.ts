// src/contracts/scan-result.types.ts
import type { Severity, ScanLevel } from './config.types';
import type { WcagVersion } from '../config/wcag-tags';

export type ScanStatus = 'completed' | 'skipped' | 'framework-error';

export interface FrameworkError {
  type:
    | 'NavigationError'
    | 'TimeoutError'
    | 'SelectorNotFound'
    | 'InteractionError'
    | 'AxeError'
    | 'ConfigError'
    | 'UnknownError';
  message: string;
  pageId?: string | undefined;            // ← add | undefined
  pageUrl?: string | undefined;           // ← add | undefined
  interactionKind?: string | undefined;   // ← add | undefined
  timestamp: string;
  details?: Record<string, unknown> | undefined;  // ← add | undefined
}

export interface ScanMetadata {
  startedAt: string; // ISO
  finishedAt: string; // ISO
  toolchain: {
    playwrightTestVersion: string;
    axeCoreVersion: string;
    axePlaywrightVersion: string;
  };
  wcagVersion: WcagVersion;
  includeBestPractices: boolean;
  tagsUsed: string[];
  excludedTags: string[];
}

export interface AxeNodeRef {
  html: string;
  target: string[];
  failureSummary?: string | undefined;   // ← add | undefined
}

export interface A11yFinding {
  ruleId: string;
  description: string;
  help: string;
  helpUrl: string;

  /**
   * axe impact: "critical" | "serious" | "moderate" | "minor" | null
   */
  impact: string | null;

  /**
   * Normalized severity used for grouping.
   */
  severity: Severity;

  /**
   * Tags as provided by axe for the rule.
   */
  tags: string[];

  nodes: AxeNodeRef[];
}

export interface PageScanResult {
  siteId: string;
  pageId: string;
  pageName: string;
  pageUrl: string;

  /**
   * L1 = static page state after load/stability waits.
   * L2 = additional state(s) triggered by interactions (menus open, errors shown, etc.)
   */
  level: ScanLevel;

  /**
   * Friendly state label for L2 scans (e.g. "Header nav expanded", "Form errors displayed").
   * L1 can use "default".
   */
  state: string;

  status: ScanStatus;

  /**
   * Only includes findings matching configured WCAG tags.
   * Best-practice findings (if enabled) should be separated later in reporting.
   */
  violations: A11yFinding[];
  incomplete: A11yFinding[];
  passes: Pick<A11yFinding, 'ruleId' | 'tags'>[];

  /**
   * Notable but non-violating issues from axe (optional).
   */
  inapplicable?: Pick<A11yFinding, 'ruleId' | 'tags'>[];

  /**
   * Framework errors encountered while trying to scan this page/state.
   * These are also duplicated at the run-level errors array for convenience.
   */
  errors: FrameworkError[];
}

export interface ScanRunResult {
  runId: string;
  startedAt: string; // ISO
  finishedAt: string; // ISO

  metadata: ScanMetadata;

  /**
   * All scan results (multiple pages, multiple states).
   */
  results: PageScanResult[];

  /**
   * Run-level framework errors (warnings). Must NOT fail the run.
   */
  errors: FrameworkError[];

  /**
   * Aggregate counts to support quick summaries.
   */
  summary: {
    pagesPlanned: number;
    pageScansCompleted: number;
    pageScansWithFrameworkErrors: number;

    violationCountBySeverity: Record<Severity, number>;
    totalViolations: number;

    bestPracticeViolationCount?: number; // advisory only (if enabled later)
  };
}