# Best Practices Adoption Plan

**Source**: `bun-poc` monorepo (mature reference)
**Target**: `funk-tree` monorepo
**Date**: 2026-01-07

---

## Executive Summary

This document audits the `funk-tree` repo against the mature `bun-poc` repo and provides a prioritized plan to adopt TypeScript and Claude best practices.

---

## Audit Findings

### Current State Comparison

| Aspect                    | funk-tree         | bun-poc                          | Gap      |
| ------------------------- | ----------------- | -------------------------------- | -------- |
| **TypeScript Config**     | Basic strict mode | Full strict + incremental builds | Medium   |
| **Linting**               | Oxlint (basic)    | Oxlint (type-aware rules)        | Medium   |
| **Formatting**            | Oxfmt             | Oxfmt                            | None     |
| **Testing**               | None configured   | Vitest + Playwright              | Critical |
| **CI/CD**                 | None              | GitHub Actions (full pipeline)   | Critical |
| **Git Hooks**             | None              | Husky + lint-staged              | High     |
| **CLAUDE.md**             | None              | Comprehensive documentation      | Critical |
| **Claude Commands**       | None              | 7 custom commands                | High     |
| **Claude Skills**         | None              | 10+ specialized skills           | Medium   |
| **Package Catalog**       | Partial           | Comprehensive (80+ deps)         | Low      |
| **Vitest Config Factory** | None              | Shared via @bts/vitest           | High     |
| **tsdown Config**         | Per-package       | Shared via @bts/tsdown           | Low      |

---

## Detailed Gap Analysis

### 1. CLAUDE.md Documentation (Critical)

**funk-tree**: No CLAUDE.md file exists.

**bun-poc**: Comprehensive 500+ line CLAUDE.md with:

- Command reference
- Post-change verification steps
- Architecture patterns (oRPC, route protection, type safety)
- Troubleshooting guide
- Testing patterns
- Error mapping strategies

**Impact**: Without CLAUDE.md, Claude lacks context about project conventions, leading to inconsistent code generation.

---

### 2. TypeScript Configuration (Medium)

**funk-tree** (`packages/config/tsconfig.base.json`):

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "types": ["bun"]
  }
}
```

**bun-poc** (additional settings):

```json
{
  "compilerOptions": {
    "incremental": true,
    "tsBuildInfoFile": "node_modules/.cache/tsbuildinfo.json",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

**Missing**:

- `incremental` builds (faster type-checking)
- `tsBuildInfoFile` for caching
- `forceConsistentCasingInFileNames` (cross-platform safety)

---

### 3. Oxlint Type-Aware Rules (Medium)

**funk-tree** (`.oxlintrc.json`):

- Basic rules enabled
- No type-aware linting

**bun-poc** (additional rules):

```json
{
  "rules": {
    "typescript/no-floating-promises": "error",
    "typescript/no-misused-promises": "error",
    "typescript/await-thenable": "error",
    "typescript/no-non-null-assertion": "warn",
    "typescript/no-explicit-any": "error",
    "typescript/restrict-template-expressions": "error"
  }
}
```

**Missing**:

- Type-aware linting rules catch promise handling bugs
- `check:type-aware` script for deeper analysis
- Test file overrides (relaxed rules in `*.test.ts`)

---

### 4. Testing Setup (Critical)

**funk-tree**: No testing framework configured.

**bun-poc**:

- Vitest 4.x with workspace support
- Shared config factory (`@bts/vitest`)
- Coverage reporting with merge tool
- E2E testing with Playwright
- Evalite for LLM evaluations

**Missing**:

- `vitest.workspace.ts` at root
- Shared vitest config package
- Per-package `vitest.config.ts`
- Test scripts in package.json
- Coverage tooling

---

### 5. CI/CD Pipeline (Critical)

**funk-tree**: No CI/CD configured.

**bun-poc** (`.github/workflows/ci.yml`):

- Lint job (oxlint)
- Format check job (oxfmt --check)
- Build job (turbo build)
- Type-check job (tsc --noEmit)
- Test job (vitest with coverage)
- Concurrency control
- Turbo remote caching

**Missing**:

- Entire GitHub Actions setup
- Branch protection enforcement
- Automated quality gates

---

### 6. Git Hooks (High)

**funk-tree**: No git hooks.

**bun-poc**:

- Husky for hook management
- lint-staged for staged file processing
- Non-blocking pre-commit (warns but allows commit)

**Missing**:

- `.husky/` directory
- `.lintstagedrc.mjs` configuration
- Pre-commit hook script

---

### 7. Claude Commands & Skills (High)

**funk-tree**: Only `.claude/settings.local.json` with permissions.

**bun-poc** (`.claude/commands/`):
| Command | Purpose |
|---------|---------|
| `/research` | Feature planning with MVP focus |
| `/find` | Multi-pronged code search |
| `/understand` | Deep code analysis |
| `/write` | Code generation with verification |
| `/test` | Testing workflows |
| `/review` | Code review |
| `/debug-apis` | C# API debugging |

**bun-poc** (`.claude/skills/`):

- `write/` - Code generation patterns
- `understand/` - Code comprehension
- `find/` - Search strategies
- `research/` - Planning methodology
- `review/` - Review guidelines
- `test/` - Testing approach
- `type-safety/` - Type system best practices
- `troubleshoot/` - Debugging patterns

---

### 8. Turbo Configuration (Low)

**funk-tree** (`turbo.json`):

- Basic task configuration
- No concurrency tuning
- No remote caching

**bun-poc**:

```json
{
  "ui": "tui",
  "concurrency": 250,
  "globalDependencies": ["**/.env.*local", ".env", "bun.lock"],
  "remoteCache": { "enabled": true }
}
```

**Missing**:

- TUI mode for better UX
- Higher concurrency
- Remote cache configuration
- Global env tracking

---

## Implementation Plan

### Phase 1: Foundation (Critical)

#### 1.1 Create CLAUDE.md

Create comprehensive documentation for Claude at repo root:

```markdown
# CLAUDE.md Structure
1. Quick Reference (commands, scripts)
2. Architecture Overview
3. Post-Change Verification Steps
4. Coding Conventions
5. Type Safety Guidelines
6. Troubleshooting
```

**Files to create**:

- `CLAUDE.md` (root)

#### 1.2 Add Testing Infrastructure

**Files to create**:

- `packages/config/vitest.config.base.ts` - Shared vitest config
- `vitest.workspace.ts` - Workspace configuration
- Per-package `vitest.config.ts` files

**Scripts to add** (root `package.json`):

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

**Dependencies to add**:

```json
{
  "vitest": "^4.0.15",
  "@vitest/coverage-v8": "^4.0.15"
}
```

#### 1.3 Set Up CI/CD

**Files to create**:

- `.github/workflows/ci.yml`

**Jobs**:

1. `lint` - Run oxlint
2. `format` - Check oxfmt
3. `build` - Turbo build
4. `typecheck` - TypeScript check
5. `test` - Vitest with coverage
6. `ci-success` - Gate for PR merge

---

### Phase 2: Developer Experience (High)

#### 2.1 Add Git Hooks

**Dependencies to add**:

```json
{
  "husky": "^9.1.7",
  "lint-staged": "^15.4.3"
}
```

**Files to create**:

- `.husky/pre-commit`
- `.lintstagedrc.mjs`

**Pre-commit hook** (non-blocking):

```bash
#!/bin/sh
bunx lint-staged || echo "Lint warnings (non-blocking)"
exit 0
```

#### 2.2 Add Claude Commands

**Files to create**:

- `.claude/commands/research.md`
- `.claude/commands/find.md`
- `.claude/commands/understand.md`
- `.claude/commands/write.md`
- `.claude/commands/test.md`

#### 2.3 Enhance TypeScript Config

**Update** `packages/config/tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "incremental": true,
    "tsBuildInfoFile": "node_modules/.cache/tsbuildinfo.json",
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

---

### Phase 3: Code Quality (Medium)

#### 3.1 Add Type-Aware Linting

**Update** `.oxlintrc.json`:

```json
{
  "rules": {
    "typescript/no-floating-promises": "error",
    "typescript/no-misused-promises": "error",
    "typescript/await-thenable": "error",
    "typescript/no-explicit-any": "error"
  },
  "overrides": [
    {
      "files": ["*.test.ts", "*.spec.ts"],
      "rules": {
        "typescript/no-non-null-assertion": "off"
      }
    }
  ]
}
```

**Add script** (root `package.json`):

```json
{
  "check:type-aware": "oxlint --tsconfig tsconfig.json"
}
```

#### 3.2 Add Claude Skills

**Files to create**:

- `.claude/skills/type-safety/index.md`
- `.claude/skills/write/index.md`
- `.claude/skills/test/index.md`

---

### Phase 4: Optimization (Low)

#### 4.1 Enhance Turbo Config

**Update** `turbo.json`:

```json
{
  "ui": "tui",
  "concurrency": 250,
  "globalDependencies": ["**/.env.*local", ".env", "bun.lock"]
}
```

#### 4.2 Consolidate Dependency Catalog

Review and expand the workspace catalog in root `package.json` to include all shared dependencies with centralized versioning.

---

## Priority Matrix

| Priority | Item                  | Effort | Impact |
| -------- | --------------------- | ------ | ------ |
| P0       | CLAUDE.md             | Low    | High   |
| P0       | CI/CD Pipeline        | Medium | High   |
| P0       | Testing Setup         | Medium | High   |
| P1       | Git Hooks             | Low    | Medium |
| P1       | Claude Commands       | Medium | Medium |
| P1       | TypeScript Config     | Low    | Medium |
| P2       | Type-Aware Linting    | Low    | Medium |
| P2       | Claude Skills         | Medium | Medium |
| P3       | Turbo Optimization    | Low    | Low    |
| P3       | Catalog Consolidation | Low    | Low    |

---

## Verification Checklist

After implementation, verify:

- [ ] `bun run check` passes (oxlint)
- [ ] `bun run check-types` passes (TypeScript)
- [ ] `bun run test` runs tests
- [ ] CI pipeline runs on push
- [ ] Pre-commit hook triggers on commit
- [ ] CLAUDE.md is referenced by Claude
- [ ] Custom commands work (`/research`, `/find`, etc.)

---

## Files to Create Summary

```
funk-tree/
├── CLAUDE.md                           # NEW - Critical
├── vitest.workspace.ts                 # NEW
├── .github/
│   └── workflows/
│       └── ci.yml                      # NEW
├── .husky/
│   └── pre-commit                      # NEW
├── .lintstagedrc.mjs                   # NEW
├── .claude/
│   ├── commands/
│   │   ├── research.md                 # NEW
│   │   ├── find.md                     # NEW
│   │   ├── understand.md               # NEW
│   │   ├── write.md                    # NEW
│   │   └── test.md                     # NEW
│   └── skills/
│       ├── type-safety/
│       │   └── index.md                # NEW
│       ├── write/
│       │   └── index.md                # NEW
│       └── test/
│           └── index.md                # NEW
├── packages/
│   └── config/
│       └── vitest.config.base.ts       # NEW
└── apps/
    ├── web/
    │   └── vitest.config.ts            # NEW
    ├── server/
    │   └── vitest.config.ts            # NEW
    └── crawler/
        └── vitest.config.ts            # NEW
```

---

## Dependencies to Add

```json
{
  "devDependencies": {
    "vitest": "^4.0.15",
    "@vitest/coverage-v8": "^4.0.15",
    "husky": "^9.1.7",
    "lint-staged": "^15.4.3"
  }
}
```

---

## Next Steps

1. Review and approve this plan
2. Start with Phase 1 (CLAUDE.md, Testing, CI/CD)
3. Iterate through remaining phases
4. Validate each phase with verification checklist
