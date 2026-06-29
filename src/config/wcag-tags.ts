// src/config/wcag-tags.ts
/**
 * WCAG → axe-core tag set mapping.
 * SINGLE SOURCE OF TRUTH — imported by a11y.config.ts and any scanner utility.
 * Do NOT copy these arrays into individual test files.
 *
 * Tag definitions verified against:
 *   Deque axe-core API documentation
 *   https://www.deque.com/axe/core-documentation/api-documentation/
 *   Section: "Axe-core Tags"
 *
 * WCAG 2.2 new criteria verified against:
 *   W3C WCAG 2.2 Recommendation (12 December 2024)
 *   https://www.w3.org/TR/WCAG22/#new-features-in-wcag-2-2
 */

/**
 * Supported WCAG conformance levels for this framework.
 * Switchable via config/a11y.config.ts → wcagVersion.
 */
export type WcagVersion = 'wcag21aa' | 'wcag22aa';

/**
 * axe-core tag arrays per WCAG version.
 *
 * WCAG 2.1 AA tag set:
 *   wcag2a   — WCAG 2.0 Level A rules
 *   wcag2aa  — WCAG 2.0 Level AA rules
 *   wcag21a  — WCAG 2.1 Level A additions (e.g., 1.3.4 Orientation, 2.1.4 Character Key Shortcuts)
 *   wcag21aa — WCAG 2.1 Level AA additions (e.g., 1.3.5 Input Purpose, 1.4.10 Reflow,
 *              1.4.11 Non-text Contrast, 1.4.12 Text Spacing, 1.4.13 Content on Hover,
 *              4.1.3 Status Messages)
 *
 * WCAG 2.2 AA tag set (superset of 2.1):
 *   All of the above, plus:
 *   wcag22aa — WCAG 2.2 additions including:
 *              2.4.11 Focus Not Obscured (Minimum) (AA)
 *              2.5.7  Dragging Movements (AA)
 *              2.5.8  Target Size (Minimum) (AA)
 *              3.2.6  Consistent Help (A — tagged wcag22aa in axe-core)
 *              3.3.7  Redundant Entry (A — tagged wcag22aa in axe-core)
 *              3.3.8  Accessible Authentication (Minimum) (AA)
 *
 * NOTE on "wcag22a": This tag does NOT currently exist as a distinct tag in axe-core.
 * The WCAG 2.2 Level A new criteria (3.2.6, 3.3.7) are tagged wcag22aa in axe-core,
 * not wcag22a. Verify with axe.getRules() after each axe-core upgrade.
 *
 * NOTE on "best-practice": Included optionally via BEST_PRACTICE_TAG.
 * Never mix best-practice into compliance-reporting totals.
 */
export const WCAG_TAG_SETS: Record<WcagVersion, string[]> = {
  wcag21aa: [
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
  ],
  wcag22aa: [
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
    'wcag22aa',
  ],
} as const;

/**
 * Advisory-only tag. Add to tag arrays when best-practice findings are desired.
 * Results tagged ONLY with best-practice must be reported in a SEPARATE advisory
 * section and must NEVER be counted in compliance violation totals.
 */
export const BEST_PRACTICE_TAG = 'best-practice' as const;

/**
 * Tags explicitly excluded from all standard scans.
 * Experimental rules have elevated false-positive rates.
 * Section 508 / TTv5 / EN-301-549 are out of scope for Ontario transit context.
 */
export const EXCLUDED_TAGS = [
  'wcag2aaa',
  'experimental',
  'section508',
  'TTv5',
  'EN-301-549',
] as const;

/**
 * Helper: get the axe runOptions.runOnly configuration for a given WCAG version.
 * Pass the result directly to AxeBuilder.withTags() or axe.run() options.
 *
 * @param version - The WCAG version key from WcagVersion
 * @param includeBestPractice - Whether to append 'best-practice' tag (advisory only)
 */
export function getAxeTagsForVersion(
  version: WcagVersion,
  includeBestPractice = false
): string[] {
  const tags = [...WCAG_TAG_SETS[version]];
  if (includeBestPractice) {
    tags.push(BEST_PRACTICE_TAG);
  }
  return tags;
}