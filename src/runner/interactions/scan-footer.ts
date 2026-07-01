// src/runner/interactions/scan-footer.ts
/**
 * Interaction: openFooter
 *
 * Scrolls the footer landmark into view and confirms it is visible.
 * No accordion buttons exist on desktop (count:0 confirmed via live DOM discovery).
 * State label: "footer-visible"
 *
 * Selector — [VERIFIED] via live DOM discovery script:
 *   footer  (count:1, visible:true, static nav landmark)
 *
 * Returns: FrameworkError[] (empty = success)
 */
import type { Page } from '@playwright/test';
import type { FrameworkError } from '../../contracts/scan-result.types';

const FOOTER_SELECTOR = 'footer'; // [VERIFIED]
const SCROLL_TIMEOUT_MS = 5_000;

function makeError(
  type: FrameworkError['type'],
  message: string,
  details?: Record<string, unknown>
): FrameworkError {
  return {
    type,
    message,
    interactionKind: 'openFooter',
    timestamp: new Date().toISOString(),
    ...(details ? { details } : {}),
  };
}

export interface ScanFooterResult {
  errors: FrameworkError[];
  /** CSS selector to scope the axe scan to — caller passes this to runAxeScan. */
  scanScope: string;
}

export async function scanFooter(page: Page): Promise<ScanFooterResult> {
  const errors: FrameworkError[] = [];

  try {
    const footer = page.locator(FOOTER_SELECTOR);
    const count = await footer.count();

    if (count === 0) {
      errors.push(
        makeError('SelectorNotFound', `Footer element not found: ${FOOTER_SELECTOR}`)
      );
      return { errors, scanScope: FOOTER_SELECTOR };
    }

    // Scroll footer into view
    await footer.first().scrollIntoViewIfNeeded({ timeout: SCROLL_TIMEOUT_MS });

    // Brief settle for any lazy-loaded content
    await page.waitForTimeout(300);

    const isVisible = await footer.first().isVisible();
    if (!isVisible) {
      errors.push(
        makeError('InteractionError', 'Footer found but not visible after scroll.')
      );
    }
  } catch (e: any) {
    errors.push(
      makeError('InteractionError', `Footer scroll failed: ${String(e?.message ?? e)}`)
    );
  }

  return {
    errors,
    scanScope: FOOTER_SELECTOR, // axe will scan ONLY the footer element
  };
}