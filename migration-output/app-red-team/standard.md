---
name: app-red-team
description: >
  Comprehensive red team / critique of an application codebase. Runs 7 specialist
  reviewers to find broken functionality, security flaws, architecture issues,
  performance problems, and more. Triggers on: red team, critique, audit app,
  review codebase, find bugs, what's broken, code review, security audit.
tags: [review, security, architecture, quality, debugging, audit]
---

# App Red Team

A structured adversarial review of any application codebase. Seven specialist reviewers examine the code independently, then findings are consolidated into a severity-sorted report.

**Priority**: CRITICAL findings (broken/failing functionality) surface first.

## Input

Accept a **target path** — the root directory of the repo or app to review.
If not provided, use the current working directory.

## Workflow

### Phase 1: Reconnaissance

1. Read the target directory structure (2-3 levels deep)
2. Identify `package.json`, `Cargo.toml`, `go.mod`, `requirements.txt`, `Gemfile`, `pom.xml`, or similar
3. Determine the stack: framework (NestJS, Next.js, Express, Django, Rails, etc.), language, database, ORM
4. Identify entry points: `src/main.ts`, `src/index.ts`, `app/`, `pages/`, `routes/`, etc.
5. Check for existing tests, CI config, Docker files, env files
6. Note the project structure pattern (monorepo, modular, flat, etc.)

Record findings as:
```
STACK: [language] / [framework] / [database] / [ORM]
STRUCTURE: [pattern]
ENTRY: [main entry points]
TEST_FRAMEWORK: [jest/vitest/pytest/etc.]
CI: [github-actions/gitlab-ci/none/etc.]
```

### Phase 2: Review (run all 7 reviewers)

Execute each reviewer against the codebase. For each finding, record:

```
[SEVERITY] [Reviewer] — [Title]
File: [path:line] (if applicable)
Issue: [what's wrong]
Impact: [what breaks or could break]
Fix: [specific actionable recommendation]
```

Severity levels:
- **CRITICAL** — Currently broken or failing. App crashes, data loss, auth bypass, feature doesn't work. Fix immediately.
- **HIGH** — Will break soon or under real conditions. Security holes, race conditions, missing error handling on critical paths.
- **MEDIUM** — Degrades quality, maintainability, or performance noticeably. Should fix this sprint.
- **LOW** — Improvement opportunity. Tech debt, style, minor optimizations.

#### Reviewer 1: Security Auditor
Examine authentication, authorization, input validation, secrets management, dependency vulnerabilities, OWASP Top 10 exposure.
Reference: `references/security-checklist.md`

Focus areas:
- Auth flows: token handling, session management, password hashing
- Input validation: SQL injection, XSS, command injection, path traversal
- Secrets: hardcoded keys, .env in repo, exposed API keys
- Dependencies: known CVEs, outdated packages with security patches
- CORS, CSP, rate limiting, HTTPS enforcement
- File upload handling, deserialization, SSRF

#### Reviewer 2: Architecture Critic
Examine module boundaries, dependency graphs, separation of concerns, scalability patterns.
Reference: `references/architecture-checklist.md`

Focus areas:
- Circular dependencies between modules
- God files (>500 lines doing too many things)
- Tight coupling between layers (controller calling DB directly)
- Missing abstractions or over-abstraction
- State management patterns
- Scalability bottlenecks (single points of failure, shared mutable state)

#### Reviewer 3: QA / Reliability Engineer
**This is the highest-priority reviewer.** Find what's currently broken.
Reference: `references/reliability-checklist.md`

Focus areas:
- Run existing tests if possible (`npm test`, `pytest`, etc.) — report failures
- Find uncaught exceptions, unhandled promise rejections
- Identify missing error handling (try/catch, .catch(), error boundaries)
- Race conditions in async code
- Edge cases: empty arrays, null/undefined, boundary values
- Broken imports, missing files, typos in references
- Features that are half-implemented or commented out
- Database migrations that don't match models
- API endpoints that return wrong status codes or shapes

#### Reviewer 4: Performance Engineer
Examine runtime performance, memory usage, query efficiency, bundle size.
Reference: `references/performance-checklist.md`

Focus areas:
- N+1 query patterns (ORM eager/lazy loading)
- Missing database indexes on queried columns
- Unbounded queries (no LIMIT/pagination)
- Memory leaks (event listeners not cleaned up, growing caches)
- Synchronous blocking on main thread
- Bundle size (unnecessary imports, missing tree-shaking)
- Missing caching where beneficial
- Unoptimized images, assets

#### Reviewer 5: DevOps / Infrastructure Reviewer
Examine deployment pipeline, configuration, monitoring, operational readiness.
Reference: `references/devops-checklist.md`

Focus areas:
- CI/CD: missing steps (lint, test, build, deploy), flaky tests
- Environment config: hardcoded values, missing validation, env drift
- Docker: bloated images, running as root, no health checks
- Logging: missing structured logs, no request tracing, PII in logs
- Monitoring: no health endpoints, no alerting, no error tracking
- Secrets management in deployment
- Database backup/migration strategy
- Rollback plan

#### Reviewer 6: UX / API Design Reviewer
Examine API consistency, validation, error responses, user-facing flows.
Reference: `references/api-design-checklist.md`

Focus areas:
- Inconsistent API naming or response shapes
- Missing input validation or unhelpful error messages
- Broken user flows (signup, login, checkout, etc.)
- Missing loading/error/empty states in UI
- Accessibility issues (missing alt text, no keyboard nav)
- API versioning strategy
- Pagination inconsistencies
- Missing or wrong HTTP status codes

#### Reviewer 7: Code Quality Analyst
Examine maintainability, test coverage, duplication, dead code, tech debt.
Reference: `references/code-quality-checklist.md`

Focus areas:
- Dead code (unused exports, unreachable branches, commented-out code)
- Duplication (copy-pasted logic, repeated patterns that should be abstracted)
- Naming (misleading names, inconsistent conventions)
- Test coverage gaps (untested critical paths, tests that don't assert)
- Type safety (any types, missing null checks, loose typing)
- TODO/FIXME/HACK comments indicating known debt
- Overly complex functions (high cyclomatic complexity)
- Missing documentation on public APIs

### Phase 3: Consolidate

1. Collect all findings from all reviewers
2. Deduplicate (same root cause found by multiple reviewers → merge, keep highest severity)
3. Sort by severity: CRITICAL → HIGH → MEDIUM → LOW
4. Within each severity, group by reviewer

### Phase 4: Report

Output the final report in this format:

```markdown
# 🔴 Red Team Report: [Project Name]

**Target**: [path]
**Stack**: [detected stack]
**Date**: [date]
**Reviewers**: 7 | **Total Findings**: [N]

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | X     |
| HIGH     | X     |
| MEDIUM   | X     |
| LOW      | X     |

## 🚨 CRITICAL Findings (Broken/Failing)

### [C1] [Title] — [Reviewer]
**File**: `path/to/file.ts:42`
**Issue**: [description]
**Impact**: [what's broken]
**Fix**: [specific steps]

...

## ⚠️ HIGH Findings

### [H1] [Title] — [Reviewer]
...

## 🟡 MEDIUM Findings

### [M1] [Title] — [Reviewer]
...

## 🔵 LOW Findings

### [L1] [Title] — [Reviewer]
...

## Recommended Fix Order

1. [C1] — [one-line summary]
2. [C2] — [one-line summary]
...
```

## Guidelines

- Be specific. File paths, line numbers, code snippets.
- Be actionable. Every finding needs a fix recommendation.
- Be honest. If something works fine, don't invent issues.
- Prioritize broken things. The user wants to know what's failing RIGHT NOW.
- Adapt to the stack. Don't check for React issues in a Python backend.
- Read actual code, don't guess from file names alone.
- When in doubt, check the tests — they reveal intent and failures.
