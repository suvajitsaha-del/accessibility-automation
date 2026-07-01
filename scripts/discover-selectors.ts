// scripts/discover-selectors.ts
// Read-only selector discovery script for GO Transit accessibility POC.
// Run: npx tsx scripts/discover-selectors.ts > discovery-output.txt
// Safe: no form submissions, no purchases, no account creation.
// One click on GT-09 accordion-toggle (to disambiguate FAQ vs emergency banner) -- read-only UI.
// One hover on GT-01 nav group (to check if hover reveals the mega-menu).

import { chromium } from '@playwright/test';

// ── Targets ───────────────────────────────────────────────────────────────────
const TARGETS = [
    { id: 'GT-01', url: 'https://www.gotransit.com/en' },
    { id: 'GT-04', url: 'https://www.gotransit.com/en/plan-your-trip' },
    { id: 'GT-05', url: 'https://www.gotransit.com/en/see-schedules' },
    { id: 'GT-06', url: 'https://www.gotransit.com/en/service-updates' },
    { id: 'GT-09', url: 'https://www.gotransit.com/en/service-updates/sign-up-for-on-the-go-alerts' },
];

// ── Helper ────────────────────────────────────────────────────────────────────
async function dump(page: any, label: string, selector: string): Promise<void> {
    const loc = page.locator(selector);
    const count = await loc.count();
    const info: Record<string, unknown> = { label, selector, count };
    if (count > 0) {
        const first = loc.first();
        info.visible = await first.isVisible().catch(() => false);
        info.ariaExpanded = await first.getAttribute('aria-expanded').catch(() => null);
        info.role = await first.getAttribute('role').catch(() => null);
        info.testid = await first.getAttribute('data-testid').catch(() => null);
        info.ariaLabel = await first.getAttribute('aria-label').catch(() => null);
        info.outerHTML = (
            await first.evaluate((el: Element) => el.outerHTML).catch(() => '')
        ).slice(0, 500);
    }
    console.log(JSON.stringify(info, null, 2));
}

// ── Per-page probe sets ───────────────────────────────────────────────────────

async function probeGT01(page: any): Promise<void> {
    console.log('\n── GT-01: Cookie banner ──');
    await dump(page, 'cookie-banner', 'div[data-testid="cookies-banner-container"]');
    await dump(page, 'cookie-accept', 'button[data-testid="accept-cookies-button"]');

    console.log('\n── GT-01: Header nav — static state ──');
    await dump(page, 'nav-l1-item', '[data-testid="nav-l1-item"]');
    await dump(page, 'nav-l1-group-div', '[data-testid="nav-l1-item"] > div[role="group"]');
    await dump(page, 'nav-l1-btn-hidden', 'button[data-testid="nav-l1-btn"]');

    console.log('\n── GT-01: Header nav — hover investigation ──');
    // Hover the group div (the visible clickable area) and check if aria-expanded changes.
    const navGroup = page.locator('[data-testid="nav-l1-item"] > div[role="group"]').first();
    if (await navGroup.count() > 0) {
        await navGroup.hover();
        await page.waitForTimeout(600);
        await dump(page, 'post-hover-nav-l1-btn', 'button[data-testid="nav-l1-btn"]');
        await dump(page, 'post-hover-submenu-L2', '#tripplanning-L2, [id$="-L2"][role="menu"], [id$="-L2"][role="list"]');
        await dump(page, 'post-hover-any-expanded', '[aria-expanded="true"]');
    }

    console.log('\n── GT-01: Footer ──');
    await dump(page, 'footer', 'footer');
    await dump(page, 'footer-accordion-btns', 'footer button[aria-expanded]');
}

async function probeGT04(page: any): Promise<void> {
    console.log('\n── GT-04: Cookie banner ──');
    await dump(page, 'cookie-banner', 'div[data-testid="cookies-banner-container"]');
    await dump(page, 'cookie-accept', 'button[data-testid="accept-cookies-button"]');

    console.log('\n── GT-04: Trip planner form — static state ──');
    await dump(page, 'trip-search-block', '[data-testid="trip-search-results-block"]');
    await dump(page, 'all-comboboxes', '[role="combobox"]');
    await dump(page, 'depart-type-select', '[data-testid="depart-type-select"]');

    // Enumerate all data-testid values inside the trip form so we can find From/To fields.
    const form = page.locator('[data-testid="trip-search-results-block"]');
    if (await form.count() > 0) {
        console.log('\n── GT-04: All data-testid elements inside trip form ──');
        const testids = await form.locator('[data-testid]').evaluateAll(
            (els: Element[]) => els.map(el => ({
                tag: el.tagName,
                testid: el.getAttribute('data-testid'),
                role: el.getAttribute('role'),
                type: (el as HTMLInputElement).type ?? null,
                ariaLabel: el.getAttribute('aria-label'),
                placeholder: (el as HTMLInputElement).placeholder ?? null,
            }))
        );
        console.log(JSON.stringify({ label: 'trip-form-all-testids', count: testids.length, testids }, null, 2));
    }
}

async function probeGT05(page: any): Promise<void> {
    console.log('\n── GT-05: Cookie banner ──');
    await dump(page, 'cookie-banner', 'div[data-testid="cookies-banner-container"]');
    await dump(page, 'cookie-accept', 'button[data-testid="accept-cookies-button"]');

    console.log('\n── GT-05: Schedules — controls ──');
    await dump(page, 'gt05-main-first-testid', 'main [data-testid]');
    await dump(page, 'gt05-comboboxes', '[role="combobox"]');
    await dump(page, 'gt05-selects', 'select');
    await dump(page, 'gt05-aria-expanded', '[aria-expanded]');
    await dump(page, 'gt05-buttons-in-main', 'main button');

    // Enumerate all data-testid values in main
    console.log('\n── GT-05: All data-testid elements in main ──');
    const mainEl = page.locator('main');
    if (await mainEl.count() > 0) {
        const testids = await mainEl.locator('[data-testid]').evaluateAll(
            (els: Element[]) => els.map(el => ({
                tag: el.tagName,
                testid: el.getAttribute('data-testid'),
                role: el.getAttribute('role'),
                type: (el as HTMLInputElement).type ?? null,
            }))
        );
        console.log(JSON.stringify({ label: 'gt05-main-all-testids', count: testids.length, testids }, null, 2));
    }
}
async function probeGT06(page: any): Promise<void> {
    await dump(page, 'cookie-accept', 'button[data-testid="accept-cookies-button"]');
    await dump(page, 'gt06-all-aria-expanded', '[aria-expanded]');
    await dump(page, 'gt06-filter-buttons', 'main button');
    await dump(page, 'gt06-comboboxes', '[role="combobox"]');

    const mainEl = page.locator('main');
    if (await mainEl.count() > 0) {
        const testids = await mainEl.locator('[data-testid]').evaluateAll(
            (els: Element[]) => els.map(el => ({
                tag: el.tagName,
                testid: el.getAttribute('data-testid'),
                role: el.getAttribute('role'),
                type: (el as HTMLInputElement).type ?? null,
                ariaLabel: el.getAttribute('aria-label'),
            }))
        );
        console.log(JSON.stringify({ label: 'gt06-all-testids', count: testids.length, testids }, null, 2));
    }
}

async function probeGT09(page: any): Promise<void> {
    console.log('\n── GT-09: Cookie banner ──');
    await dump(page, 'cookie-banner', 'div[data-testid="cookies-banner-container"]');
    await dump(page, 'cookie-accept', 'button[data-testid="accept-cookies-button"]');

    console.log('\n── GT-09: Accordion — static state (before click) ──');
    await dump(page, 'all-aria-expanded-btns', 'button[aria-expanded]');
    await dump(page, 'accordion-toggle-btn', 'button[data-testid="accordion-toggle"]');
    await dump(page, 'accordion-summary-container', '[data-testid="accordion-summary-container"]');

    // Click the first accordion-toggle to disambiguate:
    // Is this the FAQ or the emergency banner?
    const toggleBtn = page.locator('button[data-testid="accordion-toggle"]').first();
    if (await toggleBtn.count() > 0) {
        console.log('\n── GT-09: After clicking first accordion-toggle ──');
        await toggleBtn.click();
        await page.waitForTimeout(600);

        // Check if aria-expanded flipped — and what content appeared
        await dump(page, 'post-click-toggle-state', 'button[data-testid="accordion-toggle"]');
        await dump(page, 'post-click-accordion-details', '[data-testid="accordion-details"]');
        await dump(page, 'post-click-any-expanded', '[aria-expanded="true"]');
        await dump(page, 'post-click-emergency-banner', '[data-testid="accordion-summary-container"]');

        // If it expanded, capture the visible text of the expanded content:
        const details = page.locator('[aria-expanded="true"]');
        if (await details.count() > 0) {
            const expandedText = await details.first()
                .evaluate((el: Element) => el.textContent?.trim().slice(0, 300))
                .catch(() => '');
            console.log(JSON.stringify({ label: 'post-click-expanded-text', text: expandedText }, null, 2));
        }
    }
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({
        userAgent: 'GO-A11y-POC/0.1 (read-only selector discovery)',
    });
    const page = await ctx.newPage();

    for (const t of TARGETS) {
        console.log(`\n\n===== ${t.id} ${t.url} =====`);
        await page.goto(t.url, { waitUntil: 'networkidle', timeout: 60_000 });
        await page.waitForTimeout(2_500); // let React hydrate

        switch (t.id) {
            case 'GT-01': await probeGT01(page); break;
            case 'GT-04': await probeGT04(page); break;
            case 'GT-05': await probeGT05(page); break;
            case 'GT-09': await probeGT09(page); break;
            case 'GT-06': await probeGT06(page); break;

        }

        // Throttle between pages — polite to production
        await page.waitForTimeout(4_000);
    }

    await browser.close();
    console.log('\n\n===== Discovery complete =====');
})();