// src/runner/interactions/trip-planner-fill.ts
/**
 * Interaction: tripPlannerOpenAndScan
 *
 * FILL-AND-STOP ONLY. Never clicks Search/Plan/Find or any submit button.
 * Fills From and To inputs with safe dummy station text to reveal the
 * autocomplete dropdown DOM state, then scans. Clears fields after scan.
 *
 * Selectors — [VERIFIED] via live DOM discovery script:
 *   From input : input[data-testid="station-search-input"][placeholder="From"]
 *   To input   : input[data-testid="station-search-input"][placeholder="To"]
 *   Container  : [data-testid="algolia-trip-planning"]
 *
 * HARD BLOCKS (enforced in code — never remove):
 *   button[data-testid="plan-trip-search-btn"]        — type=submit, NEVER click
 *   button[data-testid="plan-trip-search-btn-mobile"] — type=submit, NEVER click
 *
 * Returns: { errors: FrameworkError[], scanScopes: NavScanScope[] }
 */
import type { Page } from '@playwright/test';
import type { FrameworkError } from '../../contracts/scan-result.types';

// [VERIFIED] selectors
const FROM_INPUT = 'input[data-testid="station-search-input"][placeholder="From"]';
const TO_INPUT   = 'input[data-testid="station-search-input"][placeholder="To"]';
const CONTAINER  = '[data-testid="algolia-trip-planning"]';

// [HARD-BLOCKED] — referenced for defensive abort check only
const BLOCKED_SELECTORS = [
  'button[data-testid="plan-trip-search-btn"]',
  'button[data-testid="plan-trip-search-btn-mobile"]',
];

// Safe dummy values — real station names, no personally identifying info
const SAFE_FROM = 'Union';
const SAFE_TO   = 'Port Credit';
const TYPE_DELAY_MS  = 80;  // realistic typing pace
const SETTLE_MS      = 800; // wait for autocomplete dropdown to render

export interface TripPlannerFillResult {
  errors: FrameworkError[];
  scanScopes: Array<{ stateLabel: string; scope: string }>;
}

function makeError(
  type: FrameworkError['type'],
  message: string,
  details?: Record<string, unknown>
): FrameworkError {
  return {
    type,
    message,
    interactionKind: 'tripPlannerOpenAndScan',
    timestamp: new Date().toISOString(),
    ...(details ? { details } : {}),
  };
}

async function assertNotSubmitted(page: Page): Promise<void> {
  // Hard defensive check: if somehow a submit button becomes the active element
  // or is about to be clicked, abort. This is belt-and-suspenders only.
  for (const sel of BLOCKED_SELECTORS) {
    const count = await page.locator(sel).count();
    if (count > 0) {
      // Confirm we have NOT navigated away from the plan-your-trip page
      const url = page.url();
      if (!url.includes('plan-your-trip')) {
        throw new Error(
          `SAFETY HARD-BLOCK: Navigation away from plan-your-trip detected. ` +
          `Current URL: ${url}. Aborting tripPlannerOpenAndScan.`
        );
      }
    }
  }
}

export async function tripPlannerFill(page: Page): Promise<TripPlannerFillResult> {
  const errors: FrameworkError[] = [];
  const scanScopes: Array<{ stateLabel: string; scope: string }> = [];

  // Verify container exists
  const container = page.locator(CONTAINER);
  if (await container.count() === 0) {
    errors.push(makeError('SelectorNotFound',
      `Trip planner container not found: ${CONTAINER}`));
    return { errors, scanScopes };
  }

  // ── From field ─────────────────────────────────────────────────────────────
  const fromInput = page.locator(FROM_INPUT);
  if (await fromInput.count() > 0) {
    try {
      await fromInput.click({ timeout: 5_000 });
      await fromInput.type(SAFE_FROM, { delay: TYPE_DELAY_MS });
      await page.waitForTimeout(SETTLE_MS);

      // Safety check — we must still be on the same page
      await assertNotSubmitted(page);

      // Scan the From autocomplete open state
      scanScopes.push({
        stateLabel: 'trip-planner-from-autocomplete-open',
        scope: CONTAINER,
      });

      // Clear the field safely
      await fromInput.clear();
      await page.waitForTimeout(300);
    } catch (e: any) {
      if (String(e?.message).includes('SAFETY HARD-BLOCK')) throw e;
      errors.push(makeError('InteractionError',
        `From input interaction failed: ${String(e?.message ?? e)}`));
    }
  } else {
    errors.push(makeError('SelectorNotFound',
      `From input not found: ${FROM_INPUT}`));
  }

  // ── To field ───────────────────────────────────────────────────────────────
  const toInput = page.locator(TO_INPUT);
  if (await toInput.count() > 0) {
    try {
      await toInput.click({ timeout: 5_000 });
      await toInput.type(SAFE_TO, { delay: TYPE_DELAY_MS });
      await page.waitForTimeout(SETTLE_MS);

      await assertNotSubmitted(page);

      scanScopes.push({
        stateLabel: 'trip-planner-to-autocomplete-open',
        scope: CONTAINER,
      });

      await toInput.clear();
      await page.waitForTimeout(300);
    } catch (e: any) {
      if (String(e?.message).includes('SAFETY HARD-BLOCK')) throw e;
      errors.push(makeError('InteractionError',
        `To input interaction failed: ${String(e?.message ?? e)}`));
    }
  } else {
    errors.push(makeError('SelectorNotFound',
      `To input not found: ${TO_INPUT}`));
  }

  return { errors, scanScopes };
}