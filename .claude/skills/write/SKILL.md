# Code Writing Skill

This skill activates automatically when the conversation involves generating new code, implementing features, or creating components.

## Activation Triggers

Engage this skill when:

- User asks to "create", "add", or "implement"
- User needs new functionality
- User describes a feature to build
- User asks for code generation
- User wants to add a new component/service/route

## Behavior

When activated, I will:

1. **Understand Requirements**
   - Clarify what needs to be built
   - Identify the type of code needed
   - Determine scope and boundaries

2. **Research Patterns**
   - Find similar code in the repo
   - Extract patterns to follow
   - Note naming conventions

3. **Plan Structure**
   - Determine file locations
   - Plan exports and imports
   - Consider dependencies

4. **Write Production Code**
   - Follow existing patterns exactly
   - Include proper TypeScript types
   - Handle errors appropriately
   - Add necessary exports

5. **Verify Quality**
   - Run `bun run check` to catch lint errors
   - Run `bun run check-types` to verify TypeScript
   - Ensure it integrates properly

## Code Patterns

**oRPC Procedure**

```typescript
import { publicProcedure } from './base'
import { z } from 'zod'

export const myRouter = {
  // GET with path param
  get: publicProcedure
    .route({ method: "GET", path: "/items/{id}" })
    .input(z.object({ id: z.string() }))
    .handler(async ({ input }) => {
      // Access via input.id
    }),

  create: publicProcedure
    .input(z.object({ name: z.string() }))
    .handler(async ({ input, context }) => {
      // implementation
    }),
}
```

**oRPC Path Syntax**

```typescript
// WRONG (Express-style)
path: "/items/:id"

// CORRECT (oRPC-style)
path: "/items/{id}"
```

**React Component**

```typescript
interface Props {
  className?: string
  children?: React.ReactNode
}

export function MyComponent({ className, children }: Props) {
  return (
    <div className={className}>
      {children}
    </div>
  )
}
```

**Drizzle Schema**

```typescript
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const myTable = pgTable('my_table', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

**TanStack Router Route**

```typescript
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/path')({
  component: RouteComponent,
  loader: async () => {
    // data loading
  }
})

function RouteComponent() {
  const data = Route.useLoaderData()
  return <div>{/* UI */}</div>
}
```

## File Locations

- API Routes: `packages/api/src/`
- DB Schema: `packages/db/src/schema/`
- Visualization: `packages/tree-viz/src/`
- App Routes: `apps/web/src/routes/`
- Crawler: `apps/crawler/src/`

## Post-Change Checklist

After writing code, ALWAYS:

1. Run `bun run check` - catches unused vars/imports
2. Run `bun run check-types` - catches type errors
3. Fix any issues before considering the task complete

Common fixes:

- **Unused import**: Remove it
- **Unused variable**: Prefix with `_` or remove
- **Unused parameter**: Prefix with `_` (e.g., `_ctx: Context`)

## Output Style

When this skill is active, I:

- Generate complete, working code
- Follow repo patterns exactly
- Include all necessary imports
- Handle errors appropriately
- Explain key decisions
- Run verification checks after changes
