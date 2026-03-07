---
name: code-review
description: Comprehensive code review and audit framework. Use for analyzing codebases, identifying technical debt, dead code, security vulnerabilities, architecture issues, and generating prioritized cleanup reports.
---

# Code Review Framework

Standardized process for comprehensive codebase audits.

## Audit Process

### Phase 1: Discovery
```bash
# Get codebase stats
find src -name "*.ts" -o -name "*.tsx" | wc -l  # File count
find src -name "*.ts" -o -name "*.tsx" | xargs wc -l | tail -1  # Line count

# Largest files (likely bloated)
find src -name "*.ts" -o -name "*.tsx" | xargs wc -l | sort -rn | head -20

# Directory structure
find src -type d | head -30
```

### Phase 2: Dead Code Analysis
```bash
# Unused exports (requires ts-prune)
npx ts-prune | grep -v "used in module"

# Find empty files
find src -name "*.ts" -o -name "*.tsx" | xargs -I {} sh -c 'if [ ! -s "{}" ]; then echo "{}"; fi'

# WIP/abandoned files
find src -name "*-new.*" -o -name "*-old.*" -o -name "*.bak" -o -name "*-copy.*"

# Commented code blocks (rough check)
grep -r "// " --include="*.ts" --include="*.tsx" | grep -E "(function|const|let|class)" | head -20
```

### Phase 3: Dependency Audit
```bash
# Security vulnerabilities
npm audit

# Unused dependencies
npx depcheck

# Outdated packages
npm outdated
```

### Phase 4: Code Quality
```bash
# TypeScript any usage
grep -r ": any" --include="*.ts" --include="*.tsx" | wc -l

# Console statements in production
grep -r "console\." --include="*.ts" --include="*.tsx" | wc -l

# TODO/FIXME items
grep -rn "TODO\|FIXME" --include="*.ts" --include="*.tsx"

# Long functions (>50 lines)
# Manual review of largest files
```

### Phase 5: Architecture Review

Check for:
- **God objects** — Classes/services >500 lines with many methods
- **Circular dependencies** — `npx madge --circular src/`
- **Duplicate patterns** — Similar components doing same thing
- **Inconsistent patterns** — Different approaches to same problem
- **Missing abstractions** — Repeated code that should be extracted

### Phase 6: Test Coverage
```bash
# Run coverage
npm test -- --coverage

# Files without tests
find src -name "*.ts" -o -name "*.tsx" | while read f; do
  test_file=$(echo $f | sed 's/\.tsx\?/.test&/')
  if [ ! -f "$test_file" ] && [ ! -f "$(dirname $f)/__tests__/$(basename $f .tsx).test.tsx" ]; then
    echo "No test: $f"
  fi
done
```

## Report Template

```markdown
# Code Audit Report: [Project Name]

**Date:** YYYY-MM-DD
**Branch:** [branch]
**Size:** ~X lines across Y files

## Executive Summary
Overall Health Score: XX/100

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Dead Code | X | X | X | X |
| Security | X | X | X | X |
| Architecture | X | X | X | X |
| Dependencies | X | X | X | X |

## Findings

### 1. Dead Code
[Details with file:line references]

### 2. Security Issues
[npm audit results, env leaks, etc.]

### 3. Architecture Issues
[God objects, circular deps, etc.]

### 4. Code Quality
[any types, console statements, etc.]

### 5. Dependencies
[Unused, outdated, vulnerable]

### 6. Test Coverage
[Gaps, weak tests]

## Recommendations

### Immediate (Do Now)
- [ ] Fix security vulnerabilities
- [ ] Delete empty/dead files

### Short-term (This Sprint)
- [ ] Refactor god objects
- [ ] Remove unused deps

### Long-term (Backlog)
- [ ] Consolidate duplicate patterns
- [ ] Improve test coverage
```

## Severity Definitions

- **Critical** — Security vulnerabilities, data loss risk, production blockers
- **High** — Significant tech debt, maintenance burden, performance issues  
- **Medium** — Code quality issues, inconsistencies, missing best practices
- **Low** — Style issues, minor improvements, nice-to-haves

## Quick Health Check

Run this for a fast assessment:
```bash
echo "=== Quick Health Check ===" && \
echo "Files: $(find src -name '*.ts' -o -name '*.tsx' | wc -l)" && \
echo "Lines: $(find src -name '*.ts' -o -name '*.tsx' | xargs wc -l | tail -1)" && \
echo "Any types: $(grep -r ': any' --include='*.ts' --include='*.tsx' | wc -l)" && \
echo "Console statements: $(grep -r 'console\.' --include='*.ts' --include='*.tsx' | wc -l)" && \
echo "TODOs: $(grep -r 'TODO\|FIXME' --include='*.ts' --include='*.tsx' | wc -l)" && \
npm audit 2>/dev/null | grep -E "vulnerabilities|moderate|high|critical" | head -3
```
