import _Ajv2020 from 'ajv/dist/2020.js';
const Ajv = (_Ajv2020 as any).default || _Ajv2020;
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { capabilitySchema } from '@acr/schema';
import type { CapabilityManifest } from '@acr/schema';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  manifest?: CapabilityManifest;
}

export interface ValidationError {
  path: string;
  message: string;
  suggestion?: string;
}

export interface ValidationWarning {
  path: string;
  message: string;
}

const ajv = new Ajv({ allErrors: true, strict: false });
const validateSchema = ajv.compile(capabilitySchema);

/**
 * Validate a capability directory.
 * Checks the manifest against the JSON Schema AND validates
 * the file structure (index.txt, summary.md, standard.md, etc.)
 */
export function validateCapability(capabilityDir: string): ValidationResult {
  const dir = resolve(capabilityDir);
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // 1. Check capability.yaml exists
  const manifestPath = join(dir, 'capability.yaml');
  if (!existsSync(manifestPath)) {
    errors.push({
      path: manifestPath,
      message: 'capability.yaml not found',
      suggestion: 'Run `acr migrate` to generate a manifest from an existing SKILL.md',
    });
    return { valid: false, errors, warnings };
  }

  // 2. Parse YAML
  let manifest: CapabilityManifest;
  try {
    const raw = readFileSync(manifestPath, 'utf-8');
    manifest = parseYaml(raw) as CapabilityManifest;
  } catch (err) {
    errors.push({
      path: manifestPath,
      message: `Failed to parse YAML: ${(err as Error).message}`,
      suggestion: 'Check for YAML syntax errors (indentation, colons, quotes)',
    });
    return { valid: false, errors, warnings };
  }

  // 3. Validate against JSON Schema
  const schemaValid = validateSchema(manifest);
  if (!schemaValid && validateSchema.errors) {
    for (const err of validateSchema.errors) {
      errors.push({
        path: `capability.yaml${err.instancePath}`,
        message: err.message || 'Schema validation error',
        suggestion: getSuggestion(err),
      });
    }
  }

  // 4. Validate file structure
  const requiredFiles = ['index.txt', 'summary.md'];

  // standard.md required for type: capability, not for capability-set
  if (manifest.type === 'capability') {
    requiredFiles.push('standard.md');
  }

  for (const file of requiredFiles) {
    if (!existsSync(join(dir, file))) {
      errors.push({
        path: file,
        message: `Required file missing: ${file}`,
        suggestion: `Create ${file} — run \`acr migrate\` to auto-generate`,
      });
    }
  }

  // 5. Check optional files
  if (manifest.budget?.deep && manifest.budget.deep > 0) {
    if (!existsSync(join(dir, 'deep.md'))) {
      warnings.push({
        path: 'deep.md',
        message: 'Budget declares deep resolution but deep.md is missing',
      });
    }
  }

  // 6. Budget sanity checks
  if (manifest.budget) {
    if (manifest.budget.summary >= (manifest.budget.standard || 0) && manifest.type === 'capability' && (manifest.budget.standard || 0) > 0) {
      warnings.push({
        path: 'capability.yaml/budget',
        message: `Summary budget (${manifest.budget.summary}) >= standard budget (${manifest.budget.standard}). Summary should be smaller.`,
      });
    }
    if (manifest.budget.deep && manifest.budget.deep <= (manifest.budget.standard || 0)) {
      warnings.push({
        path: 'capability.yaml/budget',
        message: `Deep budget (${manifest.budget.deep}) <= standard budget (${manifest.budget.standard}). Deep should be larger.`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    manifest: errors.length === 0 ? manifest : undefined,
  };
}

function getSuggestion(err: { keyword?: string; params?: Record<string, unknown> }): string | undefined {
  switch (err.keyword) {
    case 'required':
      return `Add the required field: ${err.params?.missingProperty}`;
    case 'enum':
      return `Allowed values: ${(err.params?.allowedValues as string[])?.join(', ')}`;
    case 'pattern':
      return 'Check the naming convention — use lowercase with hyphens';
    case 'type':
      return `Expected type: ${err.params?.type}`;
    case 'additionalProperties':
      return `Unknown field: ${err.params?.additionalProperty}. Remove it or check for typos.`;
    default:
      return undefined;
  }
}
