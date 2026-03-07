/**
 * ACR LOD Content Linter
 *
 * Validates content quality across resolution levels:
 *   - index.txt: should be concise (< 100 tokens)
 *   - summary.md: should be moderate (< budget.summary tokens)
 *   - standard.md: should be within budget.standard
 *   - deep.md: optional, should be within budget.deep
 *   - Each level should INCLUDE content from lower levels
 *   - Triggers should have at least one pattern
 *   - Budget declarations should be realistic vs actual content
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { countTokens } from './tokenizer.js';
import type { CapabilityManifest } from '@acr/schema';

export interface LintResult {
  capability: string;
  errors: LintIssue[];
  warnings: LintIssue[];
  info: LintIssue[];
}

export interface LintIssue {
  level: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  file?: string;
  actual?: number;
  expected?: number;
}

export function lintCapability(
  capabilityDir: string,
  manifest: CapabilityManifest,
): LintResult {
  const result: LintResult = {
    capability: manifest.name,
    errors: [],
    warnings: [],
    info: [],
  };

  // ── File existence checks ──
  const indexPath = join(capabilityDir, 'index.txt');
  const summaryPath = join(capabilityDir, 'summary.md');
  const standardPath = join(capabilityDir, 'standard.md');
  const deepPath = join(capabilityDir, 'deep.md');

  if (!existsSync(indexPath)) {
    result.errors.push({
      level: 'error',
      code: 'MISSING_INDEX',
      message: 'Missing index.txt — required for cold-start awareness',
      file: 'index.txt',
    });
  }

  if (!existsSync(summaryPath)) {
    result.warnings.push({
      level: 'warning',
      code: 'MISSING_SUMMARY',
      message: 'Missing summary.md — limits LOD demotion options',
      file: 'summary.md',
    });
  }

  if (!existsSync(standardPath)) {
    result.errors.push({
      level: 'error',
      code: 'MISSING_STANDARD',
      message: 'Missing standard.md — required for active use',
      file: 'standard.md',
    });
  }

  // ── Budget vs actual content ──
  const files: Record<string, { path: string; exists: boolean; content?: string; tokens?: number }> = {
    index: { path: indexPath, exists: existsSync(indexPath) },
    summary: { path: summaryPath, exists: existsSync(summaryPath) },
    standard: { path: standardPath, exists: existsSync(standardPath) },
    deep: { path: deepPath, exists: existsSync(deepPath) },
  };

  for (const [level, file] of Object.entries(files)) {
    if (!file.exists) continue;
    file.content = readFileSync(file.path, 'utf-8');
    file.tokens = countTokens(file.content);
  }

  // Check budget accuracy
  if (files.index.tokens !== undefined) {
    const declared = manifest.budget.index;
    const actual = files.index.tokens;
    const drift = Math.abs(actual - declared) / Math.max(declared, 1);

    if (drift > 0.5) {
      result.warnings.push({
        level: 'warning',
        code: 'BUDGET_DRIFT_INDEX',
        message: `index.txt budget drift: declared ${declared} tokens, actual ${actual} (${(drift * 100).toFixed(0)}% off)`,
        file: 'index.txt',
        actual,
        expected: declared,
      });
    }
  }

  if (files.summary.tokens !== undefined) {
    const declared = manifest.budget.summary;
    const actual = files.summary.tokens;
    const drift = Math.abs(actual - declared) / Math.max(declared, 1);

    if (drift > 0.5) {
      result.warnings.push({
        level: 'warning',
        code: 'BUDGET_DRIFT_SUMMARY',
        message: `summary.md budget drift: declared ${declared} tokens, actual ${actual} (${(drift * 100).toFixed(0)}% off)`,
        file: 'summary.md',
        actual,
        expected: declared,
      });
    }
  }

  if (files.standard.tokens !== undefined) {
    const declared = manifest.budget.standard;
    const actual = files.standard.tokens;
    const drift = Math.abs(actual - declared) / Math.max(declared, 1);

    if (drift > 0.5) {
      result.warnings.push({
        level: 'warning',
        code: 'BUDGET_DRIFT_STANDARD',
        message: `standard.md budget drift: declared ${declared} tokens, actual ${actual} (${(drift * 100).toFixed(0)}% off)`,
        file: 'standard.md',
        actual,
        expected: declared,
      });
    }

    if (actual > declared * 1.5) {
      result.errors.push({
        level: 'error',
        code: 'BUDGET_EXCEEDED_STANDARD',
        message: `standard.md exceeds budget by >50%: ${actual} tokens vs ${declared} declared`,
        file: 'standard.md',
        actual,
        expected: declared,
      });
    }
  }

  // ── Index quality ──
  if (files.index.tokens !== undefined) {
    if (files.index.tokens > 100) {
      result.warnings.push({
        level: 'warning',
        code: 'INDEX_TOO_LONG',
        message: `index.txt is ${files.index.tokens} tokens — should be under 100 for cold-start efficiency`,
        file: 'index.txt',
        actual: files.index.tokens,
        expected: 100,
      });
    }

    if (files.index.tokens < 5) {
      result.warnings.push({
        level: 'warning',
        code: 'INDEX_TOO_SHORT',
        message: 'index.txt is very short — may not provide enough context for capability selection',
        file: 'index.txt',
        actual: files.index.tokens,
      });
    }
  }

  // ── Content hierarchy ──
  if (files.summary.tokens !== undefined && files.index.tokens !== undefined) {
    if (files.summary.tokens < files.index.tokens) {
      result.warnings.push({
        level: 'warning',
        code: 'HIERARCHY_INVERSION',
        message: `summary.md (${files.summary.tokens} tok) is shorter than index.txt (${files.index.tokens} tok) — summary should include index content`,
      });
    }
  }

  if (files.standard.tokens !== undefined && files.summary.tokens !== undefined) {
    if (files.standard.tokens < files.summary.tokens) {
      result.warnings.push({
        level: 'warning',
        code: 'HIERARCHY_INVERSION',
        message: `standard.md (${files.standard.tokens} tok) is shorter than summary.md (${files.summary.tokens} tok) — standard should include summary content`,
      });
    }
  }

  // ── Trigger quality ──
  if (manifest.activation?.triggers) {
    const patterns = manifest.activation.triggers.filter(t => t.type === 'pattern');
    const semantic = manifest.activation.triggers.filter(t => t.type === 'semantic');

    if (patterns.length === 0 && semantic.length === 0) {
      result.warnings.push({
        level: 'warning',
        code: 'NO_TRIGGERS',
        message: 'No activation triggers defined — capability can only be mounted explicitly',
      });
    }

    // Check for overly broad patterns
    for (const p of patterns) {
      if (p.condition && p.condition.length < 3) {
        result.warnings.push({
          level: 'warning',
          code: 'TRIGGER_TOO_BROAD',
          message: `Pattern trigger "${p.condition}" is very short and may cause false positives`,
        });
      }
    }
  } else {
    result.info.push({
      level: 'info',
      code: 'NO_ACTIVATION',
      message: 'No activation section — capability must be mounted explicitly',
    });
  }

  // ── Provides tags ──
  if (!manifest.provides || manifest.provides.length === 0) {
    result.warnings.push({
      level: 'warning',
      code: 'NO_PROVIDES',
      message: 'No provides tags — limits dependency resolution and search',
    });
  }

  // ── Description quality ──
  if (manifest.description.length < 20) {
    result.warnings.push({
      level: 'warning',
      code: 'DESCRIPTION_SHORT',
      message: 'Description is very short — may limit semantic trigger matching',
    });
  }

  // ── Content structure recommendations ──
  if (files.standard.content) {
    const content = files.standard.content;
    const recommendedSections = [
      { pattern: /##\s*(overview|about|what)/i, name: 'Overview' },
      { pattern: /##\s*(command|pattern|usage|reference|api)/i, name: 'Commands/Patterns' },
      { pattern: /##\s*(example|snippet|demo)/i, name: 'Examples' },
    ];

    const missingSections = recommendedSections
      .filter(s => !s.pattern.test(content))
      .map(s => s.name);

    if (missingSections.length > 0 && files.standard.tokens! > 200) {
      result.info.push({
        level: 'info',
        code: 'RECOMMENDED_SECTIONS',
        message: `standard.md could benefit from: ${missingSections.join(', ')} sections`,
        file: 'standard.md',
      });
    }
  }

  // ── Semantic consistency: summary should be self-contained ──
  if (files.summary.content && files.index.content) {
    // Check if the summary mentions the capability name
    const nameTokens = manifest.name.toLowerCase().split(/[-_.]/);
    const summaryLower = files.summary.content.toLowerCase();
    const hasName = nameTokens.some(t => t.length > 2 && summaryLower.includes(t));
    if (!hasName) {
      result.warnings.push({
        level: 'warning',
        code: 'SUMMARY_NO_NAME',
        message: 'summary.md does not mention the capability name — may confuse agents when loaded standalone',
        file: 'summary.md',
      });
    }
  }

  // ── Semantic consistency: standard should include summary concepts ──
  if (files.standard.content && files.summary.content) {
    // Extract key terms from summary (words > 5 chars, non-stopwords)
    const stopwords = new Set(['should', 'would', 'could', 'about', 'these', 'those',
      'their', 'which', 'there', 'where', 'when', 'other', 'after', 'before']);
    const summaryTerms = files.summary.content
      .toLowerCase()
      .match(/\b[a-z]{5,}\b/g)
      ?.filter(w => !stopwords.has(w)) ?? [];
    const uniqueTerms = [...new Set(summaryTerms)];
    const standardLower = files.standard.content.toLowerCase();

    const missingTerms = uniqueTerms.filter(t => !standardLower.includes(t));
    const coverageRatio = uniqueTerms.length > 0
      ? (uniqueTerms.length - missingTerms.length) / uniqueTerms.length
      : 1;

    if (coverageRatio < 0.5 && uniqueTerms.length > 5) {
      result.warnings.push({
        level: 'warning',
        code: 'LOD_CONTENT_DIVERGENCE',
        message: `standard.md only covers ${(coverageRatio * 100).toFixed(0)}% of summary.md key terms — LOD levels may have divergent content`,
        file: 'standard.md',
      });
    }
  }

  return result;
}

/**
 * Format lint results for console output.
 */
export function formatLintResults(results: LintResult[]): string {
  const lines: string[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;
  let totalInfo = 0;

  for (const result of results) {
    const hasIssues = result.errors.length + result.warnings.length + result.info.length > 0;

    if (hasIssues) {
      lines.push(`\n📋 ${result.capability}`);

      for (const issue of result.errors) {
        lines.push(`  ❌ ${issue.code}: ${issue.message}`);
        totalErrors++;
      }
      for (const issue of result.warnings) {
        lines.push(`  ⚠️  ${issue.code}: ${issue.message}`);
        totalWarnings++;
      }
      for (const issue of result.info) {
        lines.push(`  ℹ️  ${issue.code}: ${issue.message}`);
        totalInfo++;
      }
    } else {
      lines.push(`  ✅ ${result.capability} — clean`);
    }
  }

  lines.push('');
  lines.push(`${results.length} capabilities linted. ${totalErrors} errors, ${totalWarnings} warnings, ${totalInfo} info.`);

  return lines.join('\n');
}
