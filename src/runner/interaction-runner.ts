// src/runner/interaction-runner.ts
import type { Page } from '@playwright/test';
import type { InteractionKind } from '../contracts/config.types';
import type { FrameworkError } from '../contracts/scan-result.types';
import { serviceUpdatesOpen } from './interactions/service-updates-open';
import { dismissCookieBanner } from './interactions/dismiss-cookie-banner';
import { scanFooter } from './interactions/scan-footer';
import { openHeaderNav } from './interactions/open-header-nav';
import { tripPlannerFill } from './interactions/trip-planner-fill';
import { schedulesFill } from './interactions/schedules-fill';
// import { openEmergencyBanner } from './interactions/emergency-banner-open';

export interface InteractionResult {
  stateLabel: string;
  errors: FrameworkError[];
  shouldScan: boolean;
  scanScope?: string;
  /**
   * Multi-scope: when an interaction produces multiple scannable states
   * (e.g. 4 nav flyouts), all scopes are returned here.
   * If populated, shouldScan is ignored — caller iterates scanScopes instead.
   */
  scanScopes?: Array<{ stateLabel: string; scope: string }>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function unresolvedError(
  kind: InteractionKind,
  pageId: string | undefined,
  pageUrl: string,
  reason: string
): FrameworkError {
  return {
    type: 'SelectorNotFound',
    message: `Interaction "${kind}" skipped: ${reason}`,
    ...(pageId !== undefined ? { pageId } : {}),
    pageUrl,
    interactionKind: kind,
    timestamp: nowIso(),
    details: { status: 'CONFIRM_PENDING' },
  };
}

export async function runInteraction(
  page: Page,
  kind: InteractionKind,
  pageId: string | undefined,
  pageUrl: string
): Promise<InteractionResult> {
  switch (kind) {

    // ── CONFIRMED: verified selectors ────────────────────────────────────────

    case 'dismissCookieBanner': {
      const errors = await dismissCookieBanner(page);
      return { stateLabel: 'cookie-banner-dismissed', errors, shouldScan: false };
    }

    case 'openFooter': {
      const result = await scanFooter(page);
      return {
        stateLabel: 'footer-visible',
        errors: result.errors,
        shouldScan: true,
        scanScope: result.scanScope,
      };
    }

    case 'openHeaderNav': {
      const result = await openHeaderNav(page);
      // Returns multiple scan scopes (one per flyout)
      return {
        stateLabel: 'nav-flyout-open',
        errors: result.errors,
        shouldScan: result.scanScopes.length > 0,
        scanScopes: result.scanScopes,
      };
    }

    case 'tripPlannerOpenAndScan': {
      const result = await tripPlannerFill(page);
      return {
        stateLabel: 'trip-planner-fill',
        errors: result.errors,
        shouldScan: result.scanScopes.length > 0,
        scanScopes: result.scanScopes,
      };
    }

    case 'schedulesOpenAndScan': {
      const result = await schedulesFill(page);
      return {
        stateLabel: 'schedules-fill',
        errors: result.errors,
        shouldScan: result.scanScopes.length > 0,
        scanScopes: result.scanScopes,
      };
    }

    case 'alertsSignupScanOnly':
      return {
        stateLabel: 'alertsSignupScanOnly:removed',
        errors: [{
          type: 'InteractionError',
          message: 'alertsSignupScanOnly removed: GT-09 has no stable L2 accordion. ' +
                   'GT-09 scanned as L1-only. Emergency banner uses dynamic IDs (:r0:) ' +
                   'that produce invalid CSS selectors.',
          ...(pageId !== undefined ? { pageId } : {}),
          pageUrl,
          interactionKind: 'alertsSignupScanOnly',
          timestamp: nowIso(),
          details: { decision: 'L1-only', reason: 'no-stable-l2-selector' },
        }],
        shouldScan: false,
      };

    // ── PENDING [CONFIRM] ────────────────────────────────────────────────────

    case 'serviceUpdatesOpenAndScan': {
      const result = await serviceUpdatesOpen(page);
      return {
        stateLabel: 'service-updates',
        errors: result.errors,
        shouldScan: result.scanScopes.length > 0,
        scanScopes: result.scanScopes,
      };
    }

    case 'loginScanOnly':
      return {
        stateLabel: 'loginScanOnly:[CONFIRM]',
        errors: [unresolvedError(kind, pageId, pageUrl,
          'GT-07 login URL not confirmed (Metrolinx IdP redirect). ' +
          'Requires human counter-sign in docs/safety-review.md §9.1 before enabling.')],
        shouldScan: false,
      };

    case 'registrationScanOnly':
      return {
        stateLabel: 'registrationScanOnly:[CONFIRM]',
        errors: [unresolvedError(kind, pageId, pageUrl,
          'GT-08 registration selectors not confirmed. ' +
          'Hard-blocked: allowRegistrationSubmit=false. ' +
          'Requires human counter-sign in docs/safety-review.md §9.1 before enabling.')],
        shouldScan: false,
      };

    case 'triggerFormValidationErrors':
      return {
        stateLabel: 'triggerFormValidationErrors:[CONFIRM]',
        errors: [unresolvedError(kind, pageId, pageUrl,
          'GT-10 depends on GT-07/08/09 selectors. Confirm those first.')],
        shouldScan: false,
      };

    default: {
      const exhaustiveCheck: never = kind;
      return {
        stateLabel: `unknown:${String(exhaustiveCheck)}`,
        errors: [{
          type: 'InteractionError',
          message: `Unknown interaction kind: ${String(exhaustiveCheck)}`,
          ...(pageId !== undefined ? { pageId } : {}),
          pageUrl,
          interactionKind: String(exhaustiveCheck),
          timestamp: nowIso(),
        }],
        shouldScan: false,
      };
    }
  }
}