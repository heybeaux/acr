---
name: ci-verify
description: >
  CI/CD verification pipeline for AI-built code. Independently verifies build,
  lint, tests, spec compliance, and live endpoint behavior before deploy.
  Never trust the build agent's self-report.
tags: [ci, cd, verification, testing, deploy, quality-gate]
---

# CI Verify

A verification pipeline that independently validates AI-built work before deployment. Designed to catch the #1 failure mode of AI agents: claiming work is done when it isn't.

## Core Principles

1. **Never trust the build agent's self-report** — Always verify independently
2. **Test against the running server, not just the code** — "It compiles" ≠ "It works"
3. **Every spec requirement gets a PASS/FAIL** — No hand-waving
4. **Curl > Code Reading** — Actually hit the endpoints
5. **Report before deploy** — Human reviews the report, then approves deploy
6. **Atomic verification** — Each check is independent, so partial failures are clear
7. **Context-window friendly** — Break verification into small, focused checks

## Input

- **Project path** — Root directory of the project to verify
- **Spec/requirements** — The original task description, ticket, or spec doc
- **Base URL** (if running) — URL of the running server for integration/smoke tests
- **Project type** — `nestjs`, `nextjs`, `prisma`, `generic` (auto-detected if not specified)

## Pipeline

Run stages sequentially. A CRITICAL failure in Build halts the pipeline. All other stages run regardless of prior failures.

### Stage 1: Build

```bash
# Detect and run the build command
npm run build    # or yarn build, pnpm build, cargo build, go build, etc.
```

- Capture full stdout/stderr
- Result: **PASS** (exit 0, no errors) / **FAIL** (non-zero exit or error output)
- On FAIL: extract error messages, file paths, line numbers

### Stage 2: Lint & Type Check

```bash
# TypeScript projects
npx tsc --noEmit 2>&1
npx eslint . --ext .ts,.tsx 2>&1

# Python projects
ruff check . 2>&1
mypy . 2>&1

# Go projects
go vet ./... 2>&1
golangci-lint run 2>&1
```

- Capture all warnings and errors
- Result: **PASS** (0 errors) / **WARN** (warnings only) / **FAIL** (errors)

### Stage 3: Unit Tests

```bash
# Detect and run test suite
npm test 2>&1          # or jest, vitest, pytest, go test, cargo test
```

- Capture test count: passed, failed, skipped
- Result: **PASS** (all pass) / **FAIL** (any failure) / **SKIP** (no tests found)
- List each failing test name and error

### Stage 4: Spec Verification

This is the critical stage. For each requirement in the spec:

1. **Read the requirement** — Extract the specific acceptance criteria
2. **Locate implementation** — Find the relevant code (grep, file reads)
3. **Verify behavior** — Run the code or hit the endpoint
4. **Score it**:
   - **PASS** — Requirement fully met, verified by test or curl
   - **PARTIAL** — Partially implemented, some aspects missing
   - **FAIL** — Not implemented or broken

For each requirement, document:
```
REQ-N: [requirement text]
Status: PASS | PARTIAL | FAIL
Evidence: [what you checked — curl output, test result, code snippet]
Notes: [what's missing or broken, if any]
```

#### Verification methods by type:
- **API endpoints**: `curl -s -w "\n%{http_code}" URL` — check status code AND response body
- **UI components**: Check file exists, check imports, check route registration
- **Database changes**: Check migration files, check Prisma schema, run `prisma validate`
- **Business logic**: Read the implementation, check edge cases, run unit tests
- **Auth/permissions**: Curl with and without auth tokens, verify 401/403

### Stage 5: Integration Tests

With the server running:

```bash
# Use the verify-endpoints helper
./skills/ci-verify/scripts/verify-endpoints.sh $BASE_URL endpoints.txt

# Or manually curl key flows
curl -s -X POST $BASE_URL/auth/login -H "Content-Type: application/json" -d '{"email":"test@test.com","password":"test"}' | jq .
```

- Test actual request/response cycles
- Test multi-step flows (create → read → update → delete)
- Test error cases (invalid input, auth failures)
- Result: **PASS** / **FAIL** per endpoint/flow

### Stage 6: Smoke Test (Post-Deploy)

After deployment to staging/prod:

```bash
# Health check
curl -s -o /dev/null -w "%{http_code}" $PROD_URL/health

# Key endpoints respond
./skills/ci-verify/scripts/verify-endpoints.sh $PROD_URL critical-endpoints.txt
```

- Verify the deployment actually worked
- Check key user flows still work
- Result: **PASS** / **FAIL**

## Usage

```
# After a build agent completes work:

1. Read the original spec/task
2. Read this skill (ci-verify)
3. Load the appropriate checklist from refs/ (nestjs, nextjs, prisma, deploy)
4. Run each pipeline stage in order
5. Generate the verification report (use templates/report.md)
6. If ALL stages PASS → ready for deploy
7. If ANY stage FAIL → list what needs fixing, do NOT deploy
```

### Quick Start (copy-paste for agents)

```
Read /Users/clawdbot/clawd/skills/ci-verify/SKILL.md

Verify the work in [PROJECT_PATH] against this spec:
[PASTE SPEC HERE]

The server is running at [BASE_URL].
Run the full ci-verify pipeline and generate a report.
```

## Reference Checklists

Load the relevant checklist for your project type:

- `refs/nestjs-checklist.md` — NestJS API verification
- `refs/nextjs-checklist.md` — Next.js app verification
- `refs/prisma-checklist.md` — Prisma/database changes
- `refs/deploy-checklist.md` — Deployment verification

## Report Format

Use `templates/report.md` as the output template. Every verification run produces a report that includes:

- Pipeline stage results (PASS/FAIL per stage)
- Spec requirement results (PASS/FAIL/PARTIAL per requirement)
- Curl outputs and evidence
- Summary verdict: DEPLOY / DO NOT DEPLOY
- Fix list (if any failures)

## Multi-Agent Pattern

For complex projects, split verification across sub-agents:

1. **Build Agent** completes the work
2. **Verify Agent** (separate context) runs ci-verify pipeline
3. **Verify Agent** produces report
4. **Main Agent** reviews report, decides deploy or fix cycle

The verify agent should NEVER be the same agent that built the code. Fresh eyes catch more bugs.

## Scripts

- `scripts/verify-endpoints.sh` — Curl-based endpoint verification
  - Usage: `./scripts/verify-endpoints.sh <base_url> <endpoints_file>`
  - Endpoints file format: `METHOD /path EXPECTED_STATUS [BODY_JSON]`
