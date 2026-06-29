// config/sites.config.ts
import type { SiteConfig } from '../src/contracts/config.types';

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
              banner: '[CONFIRM] [data-testid="cookie-banner"]',
              acceptButton: '[CONFIRM] button:has-text("Accept")',
              rejectButton: '[CONFIRM] button:has-text("Reject")',
            },
          },
          { kind: 'openHeaderNav', selectors: { toggle: '[CONFIRM] button[aria-label="Menu"]' } },
          { kind: 'openFooter', selectors: { footer: '[CONFIRM] footer' } },
        ],
        notes:
          'Primary place to validate global header + footer components. All selectors above are placeholders until confirmed.',
      },
      {
        id: 'GT-02',
        name: 'Header / Global Navigation',
        // Component tested primarily via GT-01; keep as L2-only logical entry
        scanLevels: ['L2'],
        interactions: [{ kind: 'openHeaderNav', selectors: { toggle: '[CONFIRM] button[aria-label="Menu"]' } }],
        notes: 'Component on all pages; primary test via GT-01.',
      },
      {
        id: 'GT-03',
        name: 'Footer',
        scanLevels: ['L2'],
        interactions: [{ kind: 'openFooter', selectors: { footer: '[CONFIRM] footer' } }],
        notes: 'Component on all pages; primary test via GT-01.',
      },
      {
        id: 'GT-04',
        name: 'Trip Planner / Search',
        url: 'https://www.gotransit.com/en/plan-your-trip',
        scanLevels: ['L1', 'L2'],
        interactions: [
          { kind: 'dismissCookieBanner', selectors: { banner: '[CONFIRM] [data-testid="cookie-banner"]' } },
          {
            kind: 'tripPlannerOpenAndScan',
            selectors: {
              form: '[CONFIRM] [data-testid="trip-form"]',
              fromInput: '[CONFIRM] input[name="from"]',
              toInput: '[CONFIRM] input[name="to"]',
              dateInput: '[CONFIRM] input[name="date"]',
              submit: '[CONFIRM] button[type="submit"]',
              resultsRegion: '[CONFIRM] [data-testid="trip-results"]',
            },
            params: {
              safeFrom: 'Union Station',
              safeTo: 'Port Credit',
            },
          },
        ],
      },
      {
        id: 'GT-05',
        name: 'Schedules / Service',
        url: 'https://www.gotransit.com/en/see-schedules',
        scanLevels: ['L1', 'L2'],
        interactions: [
          { kind: 'dismissCookieBanner', selectors: { banner: '[CONFIRM] [data-testid="cookie-banner"]' } },
          {
            kind: 'schedulesOpenAndScan',
            selectors: {
              schedulesRoot: '[CONFIRM] main',
              routeDropdown: '[CONFIRM] [data-testid="route-select"]',
              results: '[CONFIRM] [data-testid="schedule-results"]',
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
          { kind: 'dismissCookieBanner', selectors: { banner: '[CONFIRM] [data-testid="cookie-banner"]' } },
          {
            kind: 'serviceUpdatesOpenAndScan',
            selectors: {
              updatesList: '[CONFIRM] [data-testid="service-updates-list"]',
              filterControl: '[CONFIRM] [data-testid="service-updates-filter"]',
            },
          },
        ],
      },
      {
        id: 'GT-07',
        name: 'Login / Sign-In',
        // runtime-confirmed due to redirect (Metrolinx IdP)
        scanLevels: ['L1', 'L2'],
        interactions: [
          {
            kind: 'loginScanOnly',
            selectors: {
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
        notes: 'Via "Sign In" header link (Metrolinx IdP redirect; confirm URL at runtime).',
      },
      {
        id: 'GT-08',
        name: 'Registration',
        // linked from Sign-In page — scan only
        scanLevels: ['L1', 'L2'],
        interactions: [
          {
            kind: 'registrationScanOnly',
            selectors: {
              registrationLink: '[CONFIRM] a:has-text("Create an account")',
              form: '[CONFIRM] form',
              submit: '[CONFIRM] button[type="submit"]',
            },
            params: {
              allowRegistrationSubmit: false,
            },
          },
        ],
        notes: 'Linked from Sign-In page — SCAN ONLY, NEVER SUBMIT.',
      },
      {
        id: 'GT-09',
        name: 'On the GO Alerts Sign-Up',
        url: 'https://www.gotransit.com/en/service-updates/sign-up-for-on-the-go-alerts',
        scanLevels: ['L1', 'L2'],
        interactions: [
          { kind: 'dismissCookieBanner', selectors: { banner: '[CONFIRM] [data-testid="cookie-banner"]' } },
          {
            kind: 'alertsSignupScanOnly',
            selectors: {
              form: '[CONFIRM] form',
              email: '[CONFIRM] input[type="email"]',
              submit: '[CONFIRM] button[type="submit"]',
            },
            params: {
              allowSubmit: false,
            },
          },
        ],
      },
      {
        id: 'GT-10',
        name: 'Form Validation/Error States',
        scanLevels: ['L2'],
        interactions: [
          {
            kind: 'triggerFormValidationErrors',
            selectors: {
              // Applies to GT-07/GT-08/GT-09 flows; placeholders until confirmed
              requiredInputs: '[CONFIRM] input[required]',
              submit: '[CONFIRM] button[type="submit"]',
              errorSummary: '[CONFIRM] [aria-live], [role="alert"]',
              fieldError: '[CONFIRM] .error, [data-error], [aria-invalid="true"]',
            },
            params: {
              // safe dummy input strategy — never submit registration
              attemptSubmitToRevealErrors: true,
            },
          },
        ],
        notes:
          'Triggered via safe dummy input on GT-07, GT-08, GT-09. Never submit registration; login attempts limited to 1.',
      },
    ],
  },
];