// src/runner/selector-utils.ts
import type { FrameworkError } from '../contracts/scan-result.types';

export function hasUnresolvedSelector(selectors?: Record<string, string>): boolean {
  if (!selectors) return false;
  return Object.values(selectors).some((s) => s.includes('[CONFIRM]'));
}

export function selectorNotFoundError(args: {
  siteId: string;
  pageId: string;
  pageUrl: string;
  interactionKind?: string | undefined;        // ← add | undefined
  message: string;
  selectors?: Record<string, string> | undefined;   // ← add | undefined
}): FrameworkError  {
  return {
    type: 'SelectorNotFound',
    message: args.message,
    pageId: args.pageId,
    pageUrl: args.pageUrl,
    interactionKind: args.interactionKind,
    timestamp: new Date().toISOString(),
    details: {
      siteId: args.siteId,
      selectors: args.selectors,
    },
  };
}