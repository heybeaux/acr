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

  // Generate index
  const indexTxt = `${inferredName}: ${truncate(inferredDesc, 80)}`;

  // Generate summary
  const summaryMd = generateSummary(inferredName, inferredDesc, body);

  // Generate capability.yaml
  const capabilityYaml = `name: ${inferredName}
type: capability
version: 0.1.0
description: "${escapeYaml(truncate(inferredDesc, 200))}"

provides:
  - ${inferredName}
  # TODO: Add more specific provides tags

requires:
  tools: []
    # TODO: Declare required MCP tools
  capabilities: []
  context: []

budget:
  index: ${Math.min(countTokens(indexTxt), 50)}
  summary: ${Math.min(countTokens(summaryMd), 500)}
  standard: ${estimatedTokens}
  # deep: ${Math.ceil(estimatedTokens * 2)}  # Uncomment and create deep.md if needed

activation:
  triggers:
    - type: pattern
      match: "${inferredName.replace(/-/g, '[ -]')}"
  trigger_logic: OR
  co_activates: []
  conflicts: []

# permissions:
#   tools: {}
#   data: {}

behavioral:
  core: |
    # TODO: Extract the core behavioral instructions from standard.md
    # This should be the irreducible "how to do the thing" essence.
    See standard.md for full instructions.
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

function escapeYaml(text: string): string {
  return text.replace(/"/g, '\\"');
}

// Token counting now uses imported countTokens from tokenizer.ts (tiktoken-based)
