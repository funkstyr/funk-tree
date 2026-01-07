# Type Safety Skill

This skill activates when reviewing code for type safety, fixing type errors, or implementing type-safe patterns.

## Activation Triggers

Engage this skill when:

- User asks about "type safety" or "type assertions"
- User mentions `as unknown as` or double casting
- User is dealing with type errors or type mismatches
- User asks about type guards or runtime validation
- User is working with JSONB columns or API boundaries
- User asks about Zod schemas for validation

## Core Principles

1. **Never use `as unknown as X`** without documented justification
2. **Validate at boundaries** - API responses, JSONB columns, external data
3. **Type guards over assertions** - Runtime validation with type narrowing
4. **Parse, don't validate** - Use Zod for runtime type safety

## Anti-Patterns to Flag

### Double Cast (Critical)

```typescript
// BAD - Complete type system bypass
const data = rawData as unknown as Person;

// GOOD - Type guard
if (isPerson(rawData)) {
  console.log(rawData.name);
}
```

### Unvalidated JSONB (Critical)

```typescript
// BAD - Trust database blindly
const children = row.children as PersonChild[];

// GOOD - Zod validation
const ChildrenSchema = z.array(PersonChildSchema).catch([]);
const children = ChildrenSchema.parse(row.children);
```

### Explicit Any (High)

```typescript
// BAD - Loses all type safety
function process(data: any) {}

// GOOD - Use unknown with narrowing
function process(data: unknown) {
  if (isPerson(data)) {
    // data is typed as Person
  }
}
```

## Recommended Patterns

### Type Guards

```typescript
function isPerson(value: unknown): value is Person {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "name" in value
  );
}
```

### Zod Schema Validation

```typescript
import { z } from "zod";

const PersonSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  birthDate: z.string().optional(),
});

type Person = z.infer<typeof PersonSchema>;

// Parse at boundaries
const person = PersonSchema.parse(apiResponse);

// Safe parse for graceful handling
const result = PersonSchema.safeParse(data);
if (result.success) {
  console.log(result.data);
}
```

## Review Checklist

When reviewing code for type safety:

- [ ] No `as unknown as` without documented justification
- [ ] Type guards used instead of type assertions
- [ ] Zod validation at API/database boundaries
- [ ] JSONB columns validated with schemas
- [ ] No `any` in new code (use `unknown` + narrowing)
- [ ] Array access validated (check `.length` or destructuring)

## Output Style

When this skill is active, I:

- Identify unsafe type patterns and explain why they're problematic
- Provide type-safe alternatives with complete examples
- Explain the runtime behavior difference
