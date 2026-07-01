/**
 * dismiss-cookie-banner.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Interaction: dismissCookieBanner
 *
 * Clicks the cookie-accept button and waits for the banner container to
 * disappear from the DOM / become hidden. If the banner is already gone,
 * this is a safe no-op. Any failure is captured as a FrameworkError and the
 * run continues.
 *
 * Selectors — Verified via live DOM discovery script (not filter lists).
 *   Banner container : div[data-testid="cookies-banner-container"]
 *   Accept button    : button[data-testid="accept-cookies-button"]
 *                      (text="Close" — acts as cookie accept)
 *
 * Returns: FrameworkError[]  (empty array = success / already dismissed)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Page } from '@playwright/test';
import type { FrameworkError } from '../../contracts/scan-result.types';

// ── Selectors ────────────────────────────────────────────────────────────────
// Source: live DOM discovery script — data-testid values confirmed in production.
const BANNER_SELECTOR = 'div[data-testid="cookies-banner-container"]';
const ACCEPT_BUTTON_SELECTOR = 'button[data-testid="accept-cookies-button"]';

/** Maximum ms to wait for the accept button to be attached to DOM. */
const BUTTON_ATTACH_TIMEOUT_MS = 5_000;
/** Maximum ms to wait for banner to disappear after clicking accept. */
const BANNER_HIDE_TIMEOUT_MS = 5_000;

// ── Helper ────────────────────────────────────────────────────────────────────
function makeError(
  type: FrameworkError['type'],
  message: string,
  details?: Record<string, unknown>,
): FrameworkError {
  return {
    type,
    message,
    interactionKind: 'dismissCookieBanner',
    timestamp: new Date().toISOString(),
    ...(details ? { details } : {}),
  };
}

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * Dismisses the GO Transit cookie / consent banner.
 *
 * Safe to call on any page load; if the banner is absent the function
 * returns immediately with an empty error array.
 *
 * @param page  Playwright Page object (already navigated to the target URL).
 * @returns     Array of FrameworkErrors encountered; empty means success.
 */
export async function dismissCookieBanner(page: Page): Promise<FrameworkError[]> {
  const errors: FrameworkError[] = [];

  try {
    const bannerLocator = page.locator(BANNER_SELECTOR);

    // ── 1. Check whether the banner is present at all ────────────────────────
    // Use waitFor with a short timeout; if it never appears, treat as already
    // dismissed (common on repeat visits within the same browser context).
    let bannerVisible = false;
    try {
      await bannerLocator.waitFor({ state: 'visible', timeout: BUTTON_ATTACH_TIMEOUT_MS });
      bannerVisible = true;
    } catch {
      // Banner not present — already dismissed or not applicable on this page.
      // This is not an error; return cleanly.
      return errors;
    }

    if (!bannerVisible) {
      return errors;
    }

    // ── 2. Locate and click the accept/close button ──────────────────────────
    const acceptButton = page.locator(ACCEPT_BUTTON_SELECTOR);

    let buttonCount = 0;
    try {
      buttonCount = await acceptButton.count();
    } catch (countErr) {
      errors.push(
        makeError('SelectorNotFound', `Could not count accept button: ${String(countErr)}`, {
          selector: ACCEPT_BUTTON_SELECTOR,
        }),
      );
      return errors;
    }

    if (buttonCount === 0) {
      errors.push(
        makeError(
          'SelectorNotFound',
          `Cookie banner visible but accept button not found (selector: ${ACCEPT_BUTTON_SELECTOR})`,
          { bannerSelector: BANNER_SELECTOR, acceptSelector: ACCEPT_BUTTON_SELECTOR },
        ),
      );
      return errors;
    }

    try {
      // force:true bypasses Playwright's visibility check — the button may be
      // rendered off-screen or behind an overlay layer during animation.
      await acceptButton.click({ force: true, timeout: BUTTON_ATTACH_TIMEOUT_MS });
    } catch (clickErr) {
      errors.push(
        makeError('InteractionError', `Failed to click cookie accept button: ${String(clickErr)}`, {
          selector: ACCEPT_BUTTON_SELECTOR,
        }),
      );
      return errors;
    }

    // ── 3. Wait for banner to disappear ──────────────────────────────────────
    try {
      await bannerLocator.waitFor({ state: 'hidden', timeout: BANNER_HIDE_TIMEOUT_MS });
    } catch (hideErr) {
      // Banner did not disappear — warn but do not hard-fail the run.
      // The axe scan will proceed; the banner may skew results.
      errors.push(
        makeError(
          'TimeoutError',
          `Cookie banner did not hide after accept click within ${BANNER_HIDE_TIMEOUT_MS}ms — scan may include banner in results`,
          { selector: BANNER_SELECTOR, detail: String(hideErr) },
        ),
      );
    }
  } catch (unexpected) {
    errors.push(
      makeError(
        'UnknownError',
        `Unexpected error in dismissCookieBanner: ${String(unexpected)}`,
        { stack: unexpected instanceof Error ? unexpected.stack : undefined },
      ),
    );
  }

  return errors;
}