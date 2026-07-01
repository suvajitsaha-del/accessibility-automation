// src/runner/selector-utils.ts
// Detects [CONFIRM] placeholders
import type { FrameworkError } from '../contracts/scan-result.types';

export function hasUnresolvedSelector(selectors?: Record<string, string>): boolean {
  if (!selectors) return false;
  return Object.values(selectors).some((s) => s.includes('[CONFIRM]'));
}

export function selectorNotFoundError(args: {
  siteId: string;
  pageId: string;
  pageUrl: string;
  interactionKind?: string;
  message: string;
  selectors?: Record<string, string>;
}): FrameworkError {
  return {
    type: 'SelectorNotFound',
    message: args.message,
    pageId: args.pageId,
    pageUrl: args.pageUrl,
    // exactOptionalPropertyTypes: omit key entirely when undefined
    ...(args.interactionKind !== undefined ? { interactionKind: args.interactionKind } : {}),
    timestamp: new Date().toISOString(),
    details: {
      siteId: args.siteId,
      ...(args.selectors !== undefined ? { selectors: args.selectors } : {}),
    },
  };
}