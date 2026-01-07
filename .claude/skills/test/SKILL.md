# Testing Skill

This skill activates when writing tests, debugging test failures, or setting up test infrastructure.

## Activation Triggers

Engage this skill when:

- User asks to "test" or "write tests"
- User mentions Vitest
- User has failing tests
- User wants to add test coverage
- User asks about mocking or test setup

## Test Framework

This repo uses **Vitest** for testing:

- Config: `vitest.workspace.ts` at root
- Per-package configs via `vitest.config.ts`
- Coverage: `@vitest/coverage-v8`

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

### Basic Test Structure

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

  it('should handle errors', () => {
    expect(() => myFunction(null)).toThrow('Invalid input')
  })
})
```

### Mocking (Bun-Compatible Pattern)

**IMPORTANT**: `vi.mocked()` does NOT work with Bun. Define mock functions OUTSIDE `vi.mock()`:

```typescript
// CORRECT: Define mock outside vi.mock()
const mockApiMethod = vi.fn()

vi.mock('@funk-tree/api', () => ({
  createClient: vi.fn().mockReturnValue({
    api: { method: mockApiMethod }
  })
}))

describe('test', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should handle success', async () => {
    mockApiMethod.mockResolvedValue({ data: { id: 1 } })
    // Use mockApiMethod directly
  })

  it('should handle error', async () => {
    mockApiMethod.mockRejectedValue(new Error('API Error'))
    // Test error handling
  })
})
```

```typescript
// WRONG: vi.mocked() doesn't work with Bun
vi.mock('@funk-tree/api', () => ({
  createClient: vi.fn()
}))

it('test', async () => {
  const { createClient } = await import('@funk-tree/api')
  vi.mocked(createClient).mockReturnValue(...)  // FAILS
})
```

### Async Testing

```typescript
it('should fetch data', async () => {
  const result = await fetchPerson('Funck-6')
  expect(result).toMatchObject({
    id: expect.any(String),
    name: expect.stringContaining('Funck'),
  })
})
```

### Testing Database Operations

```typescript
import { db } from '@funk-tree/db'

describe('person queries', () => {
  it('should find person by WikiTree ID', async () => {
    const person = await db.query.persons.findFirst({
      where: eq(persons.wikiTreeId, 'Funck-6')
    })
    expect(person).toBeDefined()
    expect(person?.name).toBe('Heinrich Funck')
  })
})
```

## Key Testing Patterns

| Pattern                              | Status                 |
| ------------------------------------ | ---------------------- |
| Define mock outside `vi.mock()`      | Works                  |
| Use `vi.mocked()`                    | Does NOT work with Bun |
| `vi.clearAllMocks()` in `beforeEach` | Required               |
| Mock nested objects via reference    | Works                  |

## Test File Conventions

- Test files: `*.test.ts` or `*.spec.ts`
- Located alongside source: `src/myModule.test.ts`
- Or in `__tests__` directory

## Coverage

Coverage is configured per-package. Reports include:

- `text` - Terminal output
- `json` - Machine-readable
- `html` - Browser viewable (`coverage/index.html`)

## Output Style

When this skill is active, I:

- Write complete, runnable test files
- Use proper Bun-compatible mocking patterns
- Include both success and error test cases
- Explain test structure decisions
- Suggest additional test cases
