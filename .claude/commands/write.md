---
description: Generate code following repo patterns
argument-hint: <description of what to create>
allowed-tools: Glob, Grep, Read, Write, Edit, Bash
---

# Code Generation Command

You are creating: **$ARGUMENTS**

## Context

This TypeScript monorepo follows specific patterns:

### Backend (Hono + oRPC)

- oRPC procedures in `packages/api/src/`
- Drizzle ORM for database queries
- Zod for schema validation

### Frontend (React)

- TanStack Start for SSR
- TanStack Router for routing
- oRPC client for data fetching
- TailwindCSS for styling

### Database (Drizzle)

- Schema in `packages/db/src/schema/`
- Migrations via `bun run db:generate`

### Visualization (PixiJS)

- Tree rendering in `packages/tree-viz/src/`

## Generation Process

1. **Understand Requirements**
   - Parse what needs to be created
   - Identify the type of code (API, component, schema, etc.)
   - Determine which packages are involved

2. **Find Patterns**
   - Search for similar existing code
   - Extract patterns to follow
   - Note naming conventions

3. **Plan Structure**
   - Determine file locations
   - Plan exports and imports
   - Consider dependencies

4. **Generate Code**
   - Follow existing patterns exactly
   - Include proper TypeScript types
   - Add necessary imports
   - Include exports in index files

5. **Verify**
   - Run type checking: `bun run check-types`
   - Run linting: `bun run check`

## Code Patterns

### oRPC Procedure

```typescript
import { publicProcedure } from './base'
import { z } from 'zod'

export const myRouter = {
  myAction: publicProcedure
    .input(z.object({ /* schema */ }))
    .handler(async ({ input, context }) => {
      // implementation
    })
}
```

### React Component

```typescript
interface MyComponentProps {
  className?: string
  children?: React.ReactNode
}

export function MyComponent({ className, children }: MyComponentProps) {
  return (
    <div className={className}>
      {children}
    </div>
  )
}
```

### Drizzle Schema

```typescript
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const myTable = pgTable('my_table', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

## Output

1. Show the generated code
2. Explain key decisions
3. List files created/modified
4. Provide next steps (run commands, add to exports, etc.)

## Begin Generation

Analyze the request, find relevant patterns, and generate production-quality code.
