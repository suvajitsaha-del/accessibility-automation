// config/accessibility.config.ts
import { EXCLUDED_TAGS } from '../src/config/wcag-tags';
import type { AccessibilityConfig } from '../src/contracts/config.types';

/**
 * Accessibility concern only.
 * LOCKED naming:
 *   - wcagVersion values: "wcag21aa" | "wcag22aa"
 *   - includeBestPractices default false (advisory only)
 */
export const accessibilityConfig: AccessibilityConfig = {
  wcagVersion: 'wcag21aa',
  includeBestPractices: false,

  disabledRules: [],
  enabledRules: [],

  excludedTags: [...EXCLUDED_TAGS],

  /**
   * Optional impact->severity customization.
   * Keep minimal; default normalization is usually sufficient.
   */
  impactToSeverity: {
    critical: 'critical',
    serious: 'serious',
    moderate: 'moderate',
    minor: 'minor',
  },
};