---
description: Run tests or create test files
argument-hint: <what to test or "run">
allowed-tools: Glob, Grep, Read, Write, Edit, Bash
---

# Testing Command

You are working on tests for: **$ARGUMENTS**

## Context

This monorepo uses Vitest for testing:

- Test files: `**/*.test.ts`
- Config: `vitest.workspace.ts` at root
- Per-package configs in each package

## Commands

```bash
# Run all tests
bun run test

# Watch mode
bun run test:watch

# With coverage
bun run test:coverage

# Specific package
bun run --cwd packages/db test
```

## Test Patterns

### Basic Test

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('myFunction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should do something', () => {
    const result = myFunction('input')
    expect(result).toBe('expected')
  })
})
```

### Mocking (Bun-compatible)

```typescript
// Define mock OUTSIDE vi.mock()
const mockApiMethod = vi.fn()

vi.mock('@funk-tree/api', () => ({
  createClient: vi.fn().mockReturnValue({
    api: { method: mockApiMethod }
  })
}))

describe('test', () => {
  beforeEach(() => vi.clearAllMocks())

  it('works', () => {
    mockApiMethod.mockResolvedValue({ data: {} })
    // Use mockApiMethod directly
  })
})
```

## Actions

If `$ARGUMENTS` is:

- **"run"**: Run all tests
- **A file path**: Create or update tests for that file
- **A description**: Create appropriate test file

## Begin Testing

Analyze what's needed and either run tests or create test files following the patterns above.
