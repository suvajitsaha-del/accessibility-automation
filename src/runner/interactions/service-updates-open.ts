// src/runner/interactions/service-updates-open.ts
/**
 * Interaction: serviceUpdatesOpenAndScan
 *
 * Drives two L2 states on the Service Updates page (GT-06):
 *
 * State 1 — Tab switch (Train / Bus / Station):
 *   Clicks each of the 3 tab buttons and scans the tabs container after each switch.
 *   Client-side only — no network call triggered by tab switch.
 *
 * State 2 — Service line accordion open:
 *   Clicks the first "View Updates" accordion button to expand service detail.
 *   Client-side only — no network call triggered.
 *
 * Selectors — [VERIFIED] via live DOM discovery script (2026-06-30):
 *   Tab buttons     : button[data-testid="tabs-button-t"] / tabs-button-b / tabs-button-s
 *   Tabs container  : [data-testid="tabs-container"]               (scan scope for tab states)
 *   Accordion btn   : button[data-testid="network-status-line-accordion-header-button"]
 *   Accordion scope : [data-testid="network-status-line-accordion-container"]
 *
 * HARD BLOCKS (never click — enforced in code):
 *   button[data-testid="nsb-hero-cta"]       — "Refresh" triggers live network data fetch
 *   button[data-testid="nsb-system-map-cta"] — triggers page navigation
 */
import type { Page } from '@playwright/test';
import type { FrameworkError } from '../../contracts/scan-result.types';

// [VERIFIED] selectors
const TAB_BUTTONS = [
  { selector: 'button[data-testid="tabs-button-t"]', label: 'service-updates-tab-train' },
  { selector: 'button[data-testid="tabs-button-b"]', label: 'service-updates-tab-bus'   },
  { selector: 'button[data-testid="tabs-button-s"]', label: 'service-updates-tab-station' },
] as const;

const TABS_CONTAINER      = '[data-testid="tabs-container"]';
const ACCORDION_BTN       = 'button[data-testid="network-status-line-accordion-header-button"]';
const ACCORDION_CONTAINER = '[data-testid="network-status-line-accordion-container"]';

// [HARD-BLOCKED] — never click, referenced for defensive guard only
const BLOCKED_SELECTORS = [
  'button[data-testid="nsb-hero-cta"]',       // Refresh — live network fetch
  'button[data-testid="nsb-system-map-cta"]', // System map — navigation
] as const;

const SETTLE_MS = 500;

export interface ServiceUpdatesResult {
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
    interactionKind: 'serviceUpdatesOpenAndScan',
    timestamp: new Date().toISOString(),
    ...(details ? { details } : {}),
  };
}

async function assertNoNavigation(page: Page): Promise<void> {
  const url = page.url();
  if (!url.includes('service-updates')) {
    throw new Error(
      `SAFETY HARD-BLOCK: Navigation away from service-updates. URL: ${url}`
    );
  }
}

export async function serviceUpdatesOpen(page: Page): Promise<ServiceUpdatesResult> {
  const errors: FrameworkError[] = [];
  const scanScopes: Array<{ stateLabel: string; scope: string }> = [];

  // ── State 1: Tab switching ─────────────────────────────────────────────────
  const tabsContainer = page.locator(TABS_CONTAINER);
  if (await tabsContainer.count() === 0) {
    errors.push(makeError('SelectorNotFound',
      `Tabs container not found: ${TABS_CONTAINER}`));
  } else {
    for (const tab of TAB_BUTTONS) {
      const btn = page.locator(tab.selector);
      if (await btn.count() === 0) {
        errors.push(makeError('SelectorNotFound',
          `Tab button not found: ${tab.selector}`,
          { label: tab.label }));
        continue;
      }

      try {
        await btn.click({ timeout: 5_000 });
        await page.waitForTimeout(SETTLE_MS);
        await assertNoNavigation(page);

        scanScopes.push({
          stateLabel: tab.label,
          scope: TABS_CONTAINER,
        });
      } catch (e: any) {
        if (String(e?.message).includes('SAFETY HARD-BLOCK')) throw e;
        errors.push(makeError('InteractionError',
          `Tab click failed for ${tab.label}: ${String(e?.message ?? e)}`,
          { selector: tab.selector }));
      }
    }
  }

  // ── State 2: Service line accordion open ───────────────────────────────────
  const accordionBtn = page.locator(ACCORDION_BTN).first();
  if (await accordionBtn.count() === 0) {
    errors.push(makeError('SelectorNotFound',
      `No accordion buttons found: ${ACCORDION_BTN}`));
  } else {
    try {
      await accordionBtn.click({ timeout: 5_000 });
      await page.waitForTimeout(SETTLE_MS);
      await assertNoNavigation(page);

      // Scope to the first accordion container only
      const firstContainer = page.locator(ACCORDION_CONTAINER).first();
      if (await firstContainer.count() > 0) {
        scanScopes.push({
          stateLabel: 'service-updates-accordion-open',
          scope: `${ACCORDION_CONTAINER}:first-of-type`,
        });
      } else {
        // Fallback: scan the full tabs area if container not isolatable
        scanScopes.push({
          stateLabel: 'service-updates-accordion-open',
          scope: TABS_CONTAINER,
        });
      }
    } catch (e: any) {
      if (String(e?.message).includes('SAFETY HARD-BLOCK')) throw e;
      errors.push(makeError('InteractionError',
        `Accordion open failed: ${String(e?.message ?? e)}`));
    }
  }

  return { errors, scanScopes };
}