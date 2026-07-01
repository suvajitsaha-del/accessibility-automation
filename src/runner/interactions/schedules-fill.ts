// src/runner/interactions/schedules-fill.ts
/**
 * Interaction: schedulesOpenAndScan
 *
 * FILL-AND-STOP ONLY. Never clicks "Search Schedules" or "View Details".
 * Focuses the departure station combobox, types a safe station name to
 * reveal the autocomplete dropdown, scans, then clears.
 *
 * Selectors — [VERIFIED] via live DOM discovery script:
 *   Departure input  : input[data-testid="schedules-station-input"]  (role=combobox)
 *   Widget container : [data-testid="schedules-widget-container"]
 *
 * HARD BLOCKS (never click):
 *   button[data-testid="search-schedules-btn"]  — type=submit
 *   button[data-testid="view-details-button"]   — type=submit
 */
import type { Page } from '@playwright/test';
import type { FrameworkError } from '../../contracts/scan-result.types';

// [VERIFIED] selectors
const DEPARTURE_INPUT = 'input[data-testid="schedules-station-input"]';
const WIDGET_CONTAINER = '[data-testid="schedules-widget-container"]';

// [HARD-BLOCKED]
const BLOCKED_SELECTORS = [
  'button[data-testid="search-schedules-btn"]',
  'button[data-testid="view-details-button"]',
];

const SAFE_STATION = 'Union';
const TYPE_DELAY_MS = 80;
const SETTLE_MS     = 800;

export interface SchedulesFillResult {
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
    interactionKind: 'schedulesOpenAndScan',
    timestamp: new Date().toISOString(),
    ...(details ? { details } : {}),
  };
}

async function assertNotSubmitted(page: Page): Promise<void> {
  for (const sel of BLOCKED_SELECTORS) {
    if (await page.locator(sel).count() > 0) {
      const url = page.url();
      if (!url.includes('see-schedules')) {
        throw new Error(
          `SAFETY HARD-BLOCK: Navigation away from see-schedules. URL: ${url}`
        );
      }
    }
  }
}

export async function schedulesFill(page: Page): Promise<SchedulesFillResult> {
  const errors: FrameworkError[] = [];
  const scanScopes: Array<{ stateLabel: string; scope: string }> = [];

  const widget = page.locator(WIDGET_CONTAINER);
  if (await widget.count() === 0) {
    errors.push(makeError('SelectorNotFound',
      `Schedules widget container not found: ${WIDGET_CONTAINER}`));
    return { errors, scanScopes };
  }

  const input = page.locator(DEPARTURE_INPUT).first();
  if (await input.count() === 0) {
    errors.push(makeError('SelectorNotFound',
      `Departure station input not found: ${DEPARTURE_INPUT}`));
    return { errors, scanScopes };
  }

  try {
    await input.click({ timeout: 5_000 });
    await input.type(SAFE_STATION, { delay: TYPE_DELAY_MS });
    await page.waitForTimeout(SETTLE_MS);

    await assertNotSubmitted(page);

    scanScopes.push({
      stateLabel: 'schedules-station-autocomplete-open',
      scope: WIDGET_CONTAINER,
    });

    // Clear safely
    await input.clear();
    await page.waitForTimeout(300);
  } catch (e: any) {
    if (String(e?.message).includes('SAFETY HARD-BLOCK')) throw e;
    errors.push(makeError('InteractionError',
      `Schedules input interaction failed: ${String(e?.message ?? e)}`));
  }

  return { errors, scanScopes };
}