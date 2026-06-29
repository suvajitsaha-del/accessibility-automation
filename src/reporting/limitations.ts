// src/reporting/limitations.ts

export const LIMITATIONS_MD = `
## LIMITATIONS (Automated Accessibility Testing)

This report is generated from automated rules (axe-core) executed in a browser automation context.
Automated testing is valuable for quickly detecting many common accessibility issues, but it does **not**
verify full conformance with WCAG or AODA.

- **Automation coverage is partial**: automated tools typically cover only a subset of WCAG requirements
  (commonly cited ranges are roughly **~30%–57%** depending on the site, patterns, and interpretation).
- **Manual testing is still required** to evaluate:
  - meaningful alternative text quality and appropriateness
  - keyboard-only operation, focus order, and focus management (especially in modals/menus)
  - visible focus indicators
  - correct labels, instructions, and error recovery for forms
  - reading order, headings structure, and content clarity
  - color contrast in all states (including hover/disabled) and non-text contrast
  - dynamic updates and announcements (ARIA live regions)
  - zoom/reflow, responsive breakpoints, and target size on touch devices
- **Not a full audit**: results should be treated as a starting point for investigation and remediation,
  not a certification of compliance.

### L2 / Component-State Scans Note
Some component/state (L2) checks may be **skipped or limited** when selectors or state triggers require
explicit confirmation against the live DOM. This avoids brittle assumptions and prevents production-impacting actions.
### Cookie/Consent Handling Note
Cookie/consent banners may be suppressed using a cookie-seeding approach to reduce UI blocking during automated scans.
In this POC, the cookie name/value and banner selector were treated as **candidates** based on public filter-list rules and
should be verified against the live DOM. If the banner remains present, scans still proceed (L1 is acceptable with the banner present)
### Incomplete Results (Not Confirmed)
Items listed under "Incomplete / Needs Manual Review" are **not confirmed failures**. They indicate rules that require
human review or additional context to determine whether they are actual accessibility issues.
`.trim();