// config/report.config.ts
// Output format toggles
import type { ReportConfig } from '../src/contracts/config.types';

export const reportConfig: ReportConfig = {
  outputDir: 'reports',
  writeJson: true,
  writeHtml: true,
  writeMarkdownSummary: true,

  // Keep stable report structure; may be empty if includeBestPractices=false
  includeBestPracticeSection: true,
};