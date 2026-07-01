// config/sites.config.ts
import type { SiteConfig } from '../src/contracts/config.types';

/**
 * SELECTOR STATUS LEGEND:
 *   [VERIFIED]  — confirmed via live DOM discovery script (data-testid/aria observed directly).
 *   [CANDIDATE] — observed in filter lists or indirect evidence; needs live DOM verification.
 *   [CONFIRM]   — not yet verified; interaction will be skipped and a SelectorNotFound
 *                 FrameworkError will be recorded. DO NOT query [CONFIRM] selectors in code.
 */

export const sitesConfig: SiteConfig[] = [
  {
    id: 'go-transit',
    name: 'GO Transit',
    baseUrl: 'https://www.gotransit.com',
    auth: {
      maxLoginAttempts: 1,
      authThrottleMs: 5000,
      dummyUsername: 'dummy@example.com',
      dummyPassword: 'not-a-real-password',
      allowRegistrationSubmit: false,
    },
    pages: [
      {
        id: 'GT-01',
        name: 'Home',
        url: 'https://www.gotransit.com/en',
        scanLevels: ['L1', 'L2'],
        interactions: [
          {
            kind: 'dismissCookieBanner',
            selectors: {
              banner: 'div[data-testid="cookies-banner-container"]',       // [VERIFIED]
              acceptButton: 'button[data-testid="accept-cookies-button"]', // [VERIFIED]
            },
          },
          {
            kind: 'openHeaderNav',
            selectors: {
              navGroupTrigger: '[data-testid="nav-l1-item"] > div[role="group"]', // [VERIFIED] hover target
              navBtn: 'button[data-testid="nav-l1-btn"]',                         // [VERIFIED] aria-controls source
            },
            // NOTE: submenu id is read at runtime from aria-controls (e.g. #tripplanning-L2)
          },
          {
            kind: 'openFooter',
            selectors: {
              footer: 'footer', // [VERIFIED]
            },
          },
        ],
        notes: 'Cookie banner and footer verified. Header nav trigger mechanism pending investigation.',
      },
      {
        id: 'GT-02',
        name: 'Header / Global Navigation',
        scanLevels: ['L2'],
        interactions: [
          {
            kind: 'openHeaderNav',
            selectors: {
              // [CONFIRM] same as GT-01 — pending hover-vs-click investigation
              toggle: '[CONFIRM] button[data-testid="nav-l1-btn"]',
              submenu: '[CONFIRM] #tripplanning-L2',
            },
          },
        ],
        notes: 'Component tested primarily via GT-01. Interaction pending.',
      },
      {
        id: 'GT-03',
        name: 'Footer',
        scanLevels: ['L2'],
        interactions: [
          {
            kind: 'openFooter',
            selectors: {
              // [VERIFIED] count:1, visible:true
              footer: 'footer',
            },
          },
        ],
        notes: 'Footer landmark verified. No accordion buttons present on desktop.',
      },
      {
        id: 'GT-04',
        name: 'Trip Planner / Search',
        url: 'https://www.gotransit.com/en/plan-your-trip',
        scanLevels: ['L1', 'L2'],
        interactions: [
          {
            kind: 'dismissCookieBanner',
            selectors: {
              banner: 'div[data-testid="cookies-banner-container"]',
              acceptButton: 'button[data-testid="accept-cookies-button"]',
            },
          },
          {
            kind: 'tripPlannerOpenAndScan',
            selectors: {
              fromInput: 'input[data-testid="station-search-input"][placeholder="From"]', // [VERIFIED]
              toInput: 'input[data-testid="station-search-input"][placeholder="To"]',   // [VERIFIED]
              container: '[data-testid="algolia-trip-planning"]',                         // [VERIFIED]
              // HARD-BLOCKED — listed for documentation only, never queried to click:
              blockedSubmit: 'button[data-testid="plan-trip-search-btn"]',
              blockedSubmitMobile: 'button[data-testid="plan-trip-search-btn-mobile"]',
            },
          },
        ],
        notes: 'L1 verified. L2 trip-planner selectors need second discovery pass (From/To data-testids).',
      },
      {
        id: 'GT-05',
        name: 'Schedules / Service',
        url: 'https://www.gotransit.com/en/see-schedules',
        scanLevels: ['L1', 'L2'],
        interactions: [
          {
            kind: 'dismissCookieBanner',
            selectors: {
              banner: 'div[data-testid="cookies-banner-container"]',
              acceptButton: 'button[data-testid="accept-cookies-button"]',
            },
          },
          {
            kind: 'schedulesOpenAndScan',
            selectors: {
              departureInput: 'input[data-testid="schedules-station-input"]', // [VERIFIED] role=combobox
              widgetContainer: '[data-testid="schedules-widget-container"]',  // [VERIFIED]
              // HARD-BLOCKED — never click:
              blockedSearch: 'button[data-testid="search-schedules-btn"]',
              blockedDetails: 'button[data-testid="view-details-button"]',
            },
          },
        ],
      },
{
        id: 'GT-06',
        name: 'Service Updates',
        url: 'https://www.gotransit.com/en/service-updates',
        scanLevels: ['L1', 'L2'],
        interactions: [
          {
            kind: 'dismissCookieBanner',
            selectors: {
              banner: 'div[data-testid="cookies-banner-container"]',       // [VERIFIED]
              acceptButton: 'button[data-testid="accept-cookies-button"]', // [VERIFIED]
            },
          },
          {
            kind: 'serviceUpdatesOpenAndScan',
            selectors: {
              // [VERIFIED] via live DOM discovery script (2026-06-30)
              tabTrain:   'button[data-testid="tabs-button-t"]',  // "14 train updates available"
              tabBus:     'button[data-testid="tabs-button-b"]',  // "15 bus updates available"
              tabStation: 'button[data-testid="tabs-button-s"]',  // "57 station updates available"
              tabsContainer: '[data-testid="tabs-container"]',
              accordionBtn: 'button[data-testid="network-status-line-accordion-header-button"]',
              accordionContainer: '[data-testid="network-status-line-accordion-container"]',
              // [HARD-BLOCKED] — never click:
              blockedRefresh:   'button[data-testid="nsb-hero-cta"]',       // live network fetch
              blockedSystemMap: 'button[data-testid="nsb-system-map-cta"]', // navigation
            },
          },
        ],
        notes: 'Tab switching and accordion expansion are client-side only. ' +
               'Refresh and System Map buttons are hard-blocked.',
      },
      {
        id: 'GT-07',
        name: 'Login / Sign-In',
        scanLevels: ['L1', 'L2'],
        interactions: [
          {
            kind: 'loginScanOnly',
            selectors: {
              // [CONFIRM] Login URL unknown (Metrolinx IdP redirect — confirm URL at runtime)
              signInLink: '[CONFIRM] a:has-text("Sign In")',
              username: '[CONFIRM] input[type="email"]',
              password: '[CONFIRM] input[type="password"]',
              submit: '[CONFIRM] button[type="submit"]',
            },
            params: {
              maxLoginAttempts: 1,
              authThrottleMs: 5000,
              dummyUsername: 'dummy@example.com',
              dummyPassword: 'not-a-real-password',
            },
          },
        ],
        notes: 'Via "Sign In" header link (Metrolinx IdP redirect). Confirm URL at runtime.',
      },
      {
        id: 'GT-08',
        name: 'Registration',
        scanLevels: ['L1', 'L2'],
        interactions: [
          {
            kind: 'registrationScanOnly',
            selectors: {
              // [CONFIRM] Registration page URL/selectors not confirmed
              registrationLink: '[CONFIRM] a:has-text("Create an account")',
              form: '[CONFIRM] form',
              submit: '[CONFIRM] button[type="submit"]',
            },
            params: {
              // Hard guardrail — must remain false regardless of selector state
              allowRegistrationSubmit: false,
            },
          },
        ],
        notes: 'SCAN ONLY, NEVER SUBMIT. allowRegistrationSubmit=false enforced in code.',
      },
      {
        id: 'GT-09',
        name: 'On the GO Alerts Sign-Up',
        url: 'https://www.gotransit.com/en/service-updates/sign-up-for-on-the-go-alerts',
        scanLevels: ['L1'], // L2 removed: no stable accordion selector on this page
        interactions: [
          {
            kind: 'dismissCookieBanner',
            selectors: {
              banner: 'div[data-testid="cookies-banner-container"]',       // [VERIFIED]
              acceptButton: 'button[data-testid="accept-cookies-button"]', // [VERIFIED]
            },
          },
          // alertsSignupScanOnly removed (2026-06-30):
          // - No FAQ accordion exists on this page.
          // - Only expandable element is the emergency banner (accordion-toggle).
          // - Emergency banner uses dynamic React IDs (:r0:) in aria-controls,
          //   which produce invalid CSS selectors (#emergency-banner-details-:r0:).
          // - GT-09 is L1-only. L2 deferred until a stable selector is available.
        ],
        notes: 'L1-only. Email/SMS signup is account-gated (out of scope). ' +
          'Emergency banner dynamic IDs break CSS selector scoping. ' +
          'No FAQ accordion present on this page.',
      },
      {
        id: 'GT-10',
        name: 'Form Validation/Error States',
        scanLevels: ['L2'],
        interactions: [
          {
            kind: 'triggerFormValidationErrors',
            selectors: {
              // [CONFIRM] Applies to GT-07/GT-08/GT-09 flows — not yet verified
              requiredInputs: '[CONFIRM] input[required]',
              submit: '[CONFIRM] button[type="submit"]',
              errorSummary: '[CONFIRM] [aria-live], [role="alert"]',
              fieldError: '[CONFIRM] .error, [data-error], [aria-invalid="true"]',
            },
            params: {
              attemptSubmitToRevealErrors: true,
            },
          },
        ],
        notes: 'Triggered via safe dummy input on GT-07, GT-08, GT-09. Never submit registration.',
      },
    ],
  },
];