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
  pageId?: string;
  pageUrl?: string;
  interactionKind?: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface ScanMetadata {
  startedAt: string;
  finishedAt: string;
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
  failureSummary?: string;
}

export interface A11yFinding {
  ruleId: string;
  description: string;
  help: string;
  helpUrl: string;
  impact: string | null;
  severity: Severity;
  tags: string[];
  nodes: AxeNodeRef[];
}

export interface PageScanResult {
  siteId: string;
  pageId: string;
  pageName: string;
  pageUrl: string;
  level: ScanLevel;
  state: string;
  status: ScanStatus;
  violations: A11yFinding[];
  incomplete: A11yFinding[];
  passes: Pick<A11yFinding, 'ruleId' | 'tags'>[];
  inapplicable?: Pick<A11yFinding, 'ruleId' | 'tags'>[];
  errors: FrameworkError[];
}

export interface ScanRunResult {
  runId: string;
  startedAt: string;
  finishedAt: string;
  metadata: ScanMetadata;
  results: PageScanResult[];
  errors: FrameworkError[];
  summary: {
    pagesPlanned: number;
    pageScansCompleted: number;
    pageScansWithFrameworkErrors: number;
    violationCountBySeverity: Record<Severity, number>;
    totalViolations: number;
    bestPracticeViolationCount?: number;
  };
}