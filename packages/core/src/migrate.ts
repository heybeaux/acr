import { readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { countTokens } from './tokenizer.js';

export interface MigrationResult {
  capabilityYaml: string;
  indexTxt: string;
  summaryMd: string;
  standardMd: string;
  name: string;
}

// ── Trigger extraction helpers ──

interface ExtractedTriggers {
  patterns: string[];
  conflicts: string[];
}

/**
 * Extract trigger patterns from SKILL.md "Use when:" and conflict signals
 * from "NOT for:" sections in the description or body.
 */
function extractTriggers(name: string, description: string, body: string): ExtractedTriggers {
  const fullText = `${description}\n${body}`;
  const patterns: string[] = [];
  const conflicts: string[] = [];

  // Always include the name as a base pattern
  patterns.push(name.replace(/-/g, '[ -]'));

  // Extract "Use when:" patterns
  const useWhenMatch = fullText.match(/use\s+when[:\s]*\(?\d*\)?\s*([\s\S]*?)(?=\.\s*NOT\s+for|NOT\s+for|\n\n|\n#|$)/i);
  if (useWhenMatch) {
    const useWhenText = useWhenMatch[1];
    // Extract quoted commands/phrases
    const quotedPhrases = useWhenText.match(/["'`/]([^"'`]+)["'`]/g);
    if (quotedPhrases) {
      for (const phrase of quotedPhrases) {
        const clean = phrase.replace(/^["'`/]+|["'`]+$/g, '').trim();
        if (clean.length > 1 && clean.length < 60) {
          patterns.push(clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        }
      }
    }
    // Extract "user says /command" patterns
    const cmdMatches = useWhenText.match(/(?:user\s+says?\s+|asks?\s+to\s+)([/\w][\w -]+)/gi);
    if (cmdMatches) {
      for (const cmd of cmdMatches) {
        const clean = cmd.replace(/^(?:user\s+says?\s+|asks?\s+to\s+)/i, '').trim();
        if (clean.length > 1) {
          patterns.push(clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        }
      }
    }
    // Extract labeled action phrases like "batch-processing tickets labeled factory-ready"
    const actionPhrases = useWhenText.match(/(?:labeled|tagged|marked)\s+([\w-]+)/gi);
    if (actionPhrases) {
      for (const phrase of actionPhrases) {
        const label = phrase.replace(/^(?:labeled|tagged|marked)\s+/i, '').trim();
        if (label.length > 2) {
          patterns.push(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        }
      }
    }
  }

  // Extract "NOT for:" conflict signals
  const notForMatch = fullText.match(/NOT\s+for[:\s]*([\s\S]*?)(?=\n\n|\n#|$)/i);
  if (notForMatch) {
    const notForText = notForMatch[1];
    // Extract key concept phrases
    const phrases = notForText.match(/(?:^|\(\d+\)\s*)([\w][\w\s-]+?)(?=[,;.()\n])/gm);
    if (phrases) {
      for (const phrase of phrases) {
        const clean = phrase.replace(/^\(\d+\)\s*/, '').trim().toLowerCase();
        if (clean.length > 3 && clean.length < 40) {
          conflicts.push(clean);
        }
      }
    }
  }

  // Deduplicate patterns
  const uniquePatterns = [...new Set(patterns)];

  return { patterns: uniquePatterns, conflicts };
}

// ── Provides tag extraction ──

/**
 * Extract semantic provides tags from description and body content.
 */
function extractProvidesTags(name: string, description: string, body: string): string[] {
  const tags = new Set<string>([name]);
  const fullText = `${description}\n${body}`.toLowerCase();

  // Common capability domains to check for
  const domainPatterns: Array<[RegExp, string]> = [
    [/pull[- ]?request/i, 'pull-request-management'],
    [/code[- ]?review/i, 'code-review'],
    [/ci[/ ]cd|continuous integration|ci monitoring|ci run/i, 'ci-monitoring'],
    [/issue[- ]?track|github issues|issue management/i, 'issue-tracking'],
    [/deploy|deployment/i, 'deployment'],
    [/test|testing|unit test|e2e/i, 'testing'],
    [/migrat/i, 'migration'],
    [/generat/i, 'code-generation'],
    [/scaffold/i, 'scaffolding'],
    [/lint|format/i, 'code-quality'],
    [/auth|authenticat|authoriz/i, 'authentication'],
    [/api[- ]?(endpoint|route|design)/i, 'api-design'],
    [/database|schema|model/i, 'database-operations'],
    [/webhook/i, 'webhook-handling'],
    [/billing|payment|subscription|invoice/i, 'billing'],
    [/email|notification|alert/i, 'notifications'],
    [/monitor|observ|metric|log/i, 'monitoring'],
    [/security|vulnerab|audit/i, 'security-audit'],
    [/search|query|filter/i, 'search'],
    [/cache|caching/i, 'caching'],
    [/queue|job|worker|background/i, 'background-jobs'],
    [/file[- ]?upload|storage|s3|blob/i, 'file-storage'],
    [/websocket|realtime|real-time|sse/i, 'realtime'],
    [/crud|create.*read.*update|resource management/i, 'crud-operations'],
    [/rls|row.level|access.control|permission/i, 'access-control'],
    [/memory|recall|embedding|vector/i, 'memory-management'],
    [/prompt|llm|model|ai agent/i, 'ai-operations'],
    [/markdown|document|docs/i, 'documentation'],
    [/git|version control|branch/i, 'version-control'],
  ];

  for (const [pattern, tag] of domainPatterns) {
    if (pattern.test(fullText)) {
      tags.add(tag);
    }
  }

  // Extract key noun phrases from description (simple heuristic)
  const descWords = description.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3);

  // Compound terms from description
  const compoundTerms = description.toLowerCase().match(/[a-z]+-[a-z]+/g);
  if (compoundTerms) {
    for (const term of compoundTerms) {
      if (term.length > 5 && !term.startsWith('non-')) {
        tags.add(term);
      }
    }
  }

  return [...tags].slice(0, 10); // Cap at 10 tags
}

// ── Behavioral core extraction ──

/**
 * Extract core behavioral instructions from the body content.
 * Looks for Quick Start, Usage, Commands sections, or falls back to first substantive paragraph.
 */
function extractBehavioralCore(body: string, maxTokens: number = 150): string {
  const lines = body.split('\n');

  // Strategy 1: Look for Quick Start / Usage / Commands sections
  const prioritySections = [
    /^#{1,3}\s*(quick\s*start|getting\s*started|usage|tldr|tl;dr)/i,
    /^#{1,3}\s*(commands?|cli|basic\s*usage|how\s*to)/i,
    /^#{1,3}\s*(core|essential|key\s*commands?)/i,
  ];

  for (const sectionPattern of prioritySections) {
    const startIdx = lines.findIndex(l => sectionPattern.test(l));
    if (startIdx >= 0) {
      const sectionContent = extractSection(lines, startIdx);
      if (sectionContent.length > 20) {
        const trimmed = trimToTokenBudget(sectionContent, maxTokens);
        if (trimmed.length > 20) return trimmed;
      }
    }
  }

  // Strategy 2: Look for code blocks with commands
  const codeBlocks: string[] = [];
  let inCodeBlock = false;
  let currentBlock: string[] = [];

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        const block = currentBlock.join('\n').trim();
        if (block.length > 5) codeBlocks.push(block);
        currentBlock = [];
      }
      inCodeBlock = !inCodeBlock;
    } else if (inCodeBlock) {
      currentBlock.push(line);
    }
  }

  // Strategy 3: Extract first substantive content (non-heading, non-empty)
  const substantive: string[] = [];
  let collecting = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!collecting) {
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('```') && !trimmed.startsWith('---')) {
        collecting = true;
        substantive.push(trimmed);
      }
    } else {
      if (!trimmed || trimmed.startsWith('#')) break;
      substantive.push(trimmed);
    }
  }

  // Combine: first paragraph + first code block
  let core = substantive.join('\n');
  if (codeBlocks.length > 0 && countTokens(core) < maxTokens / 2) {
    core += '\n\n```\n' + codeBlocks[0] + '\n```';
  }

  if (core.length < 10) {
    return 'See standard.md for full instructions.';
  }

  return trimToTokenBudget(core, maxTokens);
}

function extractSection(lines: string[], startIdx: number): string {
  const headingLevel = (lines[startIdx].match(/^(#+)/) || ['', '#'])[1].length;
  const result: string[] = [];

  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#+)\s/);
    if (headingMatch && headingMatch[1].length <= headingLevel) break;
    result.push(line);
  }

  return result.join('\n').trim();
}

function trimToTokenBudget(text: string, maxTokens: number): string {
  if (countTokens(text) <= maxTokens) return text;

  const lines = text.split('\n');
  const result: string[] = [];
  let tokens = 0;

  for (const line of lines) {
    const lineTokens = countTokens(line);
    if (tokens + lineTokens > maxTokens) break;
    result.push(line);
    tokens += lineTokens;
  }

  return result.join('\n');
}

/**
 * Generate an ACR capability scaffold from an existing SKILL.md file.
 */
export function migrateSkill(skillPath: string): MigrationResult {
  const content = readFileSync(skillPath, 'utf-8');
  const dir = dirname(skillPath);
  const dirName = basename(dir);

  // Parse frontmatter
  const { name, description, body } = parseFrontmatter(content);
  const inferredName = name || dirName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const inferredDesc = description || extractFirstParagraph(body) || `${inferredName} capability`;

  // Accurate token budget via tiktoken
  const estimatedTokens = countTokens(body);

  // Generate index (break at word boundary)
  const indexTxt = `${inferredName}: ${truncateAtWord(inferredDesc, 80)}`;

  // Generate summary
  const summaryMd = generateSummary(inferredName, inferredDesc, body);

  // Extract smart triggers from "Use when:" / "NOT for:" sections
  const triggers = extractTriggers(inferredName, inferredDesc, body);

  // Extract semantic provides tags from description + body
  const providesTags = extractProvidesTags(inferredName, inferredDesc, body);

  // Extract behavioral core from Quick Start / Usage / first paragraph
  const behavioralCore = extractBehavioralCore(body);

  // Format triggers YAML
  const triggersYaml = triggers.patterns
    .map(p => `    - type: pattern\n      match: "${escapeYaml(p)}"`)
    .join('\n');

  // Format conflicts YAML
  const conflictsYaml = triggers.conflicts.length > 0
    ? triggers.conflicts.map(c => `    - ${c}`).join('\n')
    : '  []';

  // Format provides YAML
  const providesYaml = providesTags.map(t => `  - ${t}`).join('\n');

  // Format behavioral core (indent for YAML block scalar)
  const behavioralCoreYaml = behavioralCore
    .split('\n')
    .map(l => `    ${l}`)
    .join('\n');

  // Generate capability.yaml
  const capabilityYaml = `name: ${inferredName}
type: capability
version: 0.1.0
description: "${escapeYaml(truncateAtWord(inferredDesc, 200))}"

provides:
${providesYaml}

requires:
  tools: []
    # TODO: Declare required MCP tools
  capabilities: []
  context: []

budget:
  index: ${Math.min(countTokens(indexTxt), 50)}
  summary: ${Math.min(countTokens(summaryMd), 500)}
  standard: ${estimatedTokens}
  # deep: ${Math.ceil(estimatedTokens * 2)}  # Uncomment and create deep.md for extended reference docs

activation:
  triggers:
${triggersYaml}
  trigger_logic: OR
  co_activates: []
  conflicts:
${conflictsYaml}

# permissions:
#   tools: {}
#   data: {}

behavioral:
  core: |
${behavioralCoreYaml}
  overlays: []

# state_schema:
#   version: 1
#   max_size_tokens: 200
#   fields: []

# verification:
#   checklist: []
#   completion_signal: task_complete
`;

  return {
    capabilityYaml,
    indexTxt,
    summaryMd,
    standardMd: content, // Original SKILL.md becomes standard.md
    name: inferredName,
  };
}

function parseFrontmatter(content: string): {
  name: string;
  description: string;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { name: '', description: '', body: content };
  }

  const frontmatter = match[1];
  const body = match[2];

  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);

  // Handle YAML block scalars (> or |) for description
  let description = '';
  const descBlockMatch = frontmatter.match(/^description:\s*[>|]-?\s*\n([\s\S]*?)(?=^\S|\z)/m);
  if (descBlockMatch) {
    // Block scalar — join indented lines
    description = descBlockMatch[1]
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .join(' ');
  } else {
    const descMatch = frontmatter.match(/^description:\s*"?([^"\n]+)"?$/m);
    description = descMatch?.[1]?.trim() || '';
  }

  return {
    name: nameMatch?.[1]?.trim() || '',
    description,
    body,
  };
}

function extractFirstParagraph(text: string): string {
  const lines = text.split('\n');
  const paragraphLines: string[] = [];
  let started = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!started) {
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('```')) {
        started = true;
        paragraphLines.push(trimmed);
      }
    } else {
      if (!trimmed) break;
      paragraphLines.push(trimmed);
    }
  }

  return paragraphLines.join(' ');
}

function generateSummary(name: string, description: string, body: string): string {
  // Extract headings for structure overview
  const headings = body
    .split('\n')
    .filter(l => l.match(/^#{1,3}\s/))
    .map(l => l.replace(/^#+\s*/, '').trim())
    .slice(0, 8);

  const sections = headings.length > 0
    ? `\n\n**Key sections:** ${headings.join(', ')}`
    : '';

  return `# ${name}\n\n${description}${sections}\n\n**Provides:** ${name}\n`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

/** Truncate at word boundary to avoid mid-word cuts */
function truncateAtWord(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen - 3);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLen * 0.6) {
    return truncated.slice(0, lastSpace) + '...';
  }
  return truncated + '...';
}

function escapeYaml(text: string): string {
  return text.replace(/"/g, '\\"');
}

// Token counting now uses imported countTokens from tokenizer.ts (tiktoken-based)
