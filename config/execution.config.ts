// config/execution.config.ts
import type { ExecutionConfig } from '../src/contracts/config.types';

export const executionConfig: ExecutionConfig = {
  baseUrl: '',
  browser: 'chromium',
  headless: true,

  navigationTimeoutMs: 45_000,
  actionTimeoutMs: 15_000,

  throttleMsBetweenPages: 750,

  /**
   * LOCKED DECISION:
   * Navigation/interaction failures must be recorded under ScanRunResult.errors
   * and must NOT fail the run (keep green on prod flakiness).
   */
  downgradeFrameworkErrorsToWarnings: true,

  blockThirdPartyRequests: false,
};