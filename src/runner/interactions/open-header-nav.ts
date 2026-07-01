// src/runner/interactions/open-header-nav.ts
/**
 * Interaction: openHeaderNav
 *
 * Hovers each of the 4 top-level nav group divs to reveal the mega-menu flyout.
 * Runs axe scoped to the open flyout after each hover.
 *
 * MECHANISM: hover on div[role="group"] inside nav-l1-item.
 * DO NOT click nav-l1-btn (it is a focus-only skip link at -top-[10000px]).
 * DO NOT click any link inside the flyout.
 *
 * Selectors — [VERIFIED] via live DOM discovery script:
 *   Nav group trigger : [data-testid="nav-l1-item"] > div[role="group"]  (count:4)
 *   Nav toggle btn    : button[data-testid="nav-l1-btn"]  (aria-controls = submenu id)
 *   Submenu pattern   : #{ariaControls}  (e.g. #tripplanning-L2)
 *
 * Returns: { errors: FrameworkError[], scanScopes: Array<{label: string, scope: string}> }
 */
import type { Page } from '@playwright/test';
import type { FrameworkError } from '../../contracts/scan-result.types';

const NAV_GROUP_SELECTOR = '[data-testid="nav-l1-item"] > div[role="group"]';
const NAV_BTN_SELECTOR = 'button[data-testid="nav-l1-btn"]';
const HOVER_SETTLE_MS = 600;
const EXPANDED_TIMEOUT_MS = 5_000;

function makeError(
    type: FrameworkError['type'],
    message: string,
    details?: Record<string, unknown>
): FrameworkError {
    return {
        type,
        message,
        interactionKind: 'openHeaderNav',
        timestamp: new Date().toISOString(),
        ...(details ? { details } : {}),
    };
}

export interface NavScanScope {
    stateLabel: string;
    scope: string; // CSS selector to scope axe scan to
}

export interface OpenHeaderNavResult {
    errors: FrameworkError[];
    scanScopes: NavScanScope[]; // one per successfully opened flyout
}

export async function openHeaderNav(page: Page): Promise<OpenHeaderNavResult> {
    const errors: FrameworkError[] = [];
    const scanScopes: NavScanScope[] = [];

    const groups = page.locator(NAV_GROUP_SELECTOR);
    const groupCount = await groups.count();

    if (groupCount === 0) {
        errors.push(makeError('SelectorNotFound',
            `No nav group divs found: ${NAV_GROUP_SELECTOR}`));
        return { errors, scanScopes };
    }

    for (let i = 0; i < groupCount; i++) {
        const group = groups.nth(i);
        const btn = page.locator(NAV_BTN_SELECTOR).nth(i);

        // Read the submenu id from aria-controls BEFORE hover
        let ariaControls: string | null = null;
        try {
            ariaControls = await btn.getAttribute('aria-controls');
        } catch {
            // non-fatal — we'll try to scan without a scoped selector
        }

        // Hover the visible group div
        try {
            await group.hover({ timeout: EXPANDED_TIMEOUT_MS });
            await page.waitForTimeout(HOVER_SETTLE_MS);
        } catch (e: any) {
            errors.push(makeError('InteractionError',
                `Hover failed on nav group ${i}: ${String(e?.message ?? e)}`,
                { index: i, ariaControls }));
            continue;
        }

        // Verify aria-expanded flipped to true
        try {
            await page.waitForFunction(
                ({ sel, idx }: { sel: string; idx: number }) => {
                    const btns = document.querySelectorAll(sel);
                    return btns[idx]?.getAttribute('aria-expanded') === 'true';
                },
                { sel: NAV_BTN_SELECTOR, idx: i },
                { timeout: EXPANDED_TIMEOUT_MS }
            );
        } catch {
            errors.push(makeError('InteractionError',
                `aria-expanded did not flip to true for nav item ${i} after hover.`,
                { index: i, ariaControls }));
            // Still scan whatever is visible — don't skip entirely
        }

        // Determine scan scope
        const scope = ariaControls
            ? `[id="${ariaControls}"]`   
            : 'header nav';

        const label = ariaControls
            ? `nav-flyout-open:${ariaControls}`
            : `nav-flyout-open:item-${i}`;

        scanScopes.push({ stateLabel: label, scope });

        // Move mouse away after scanning (caller fires axe, then we move away)
        // Caller is responsible for calling axe immediately after receiving scanScopes.
        // We do NOT hover away here — let the runner fire axe first, then navigate.
    }

    return { errors, scanScopes };
}