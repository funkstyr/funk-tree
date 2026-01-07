# CLAUDE.md

## Commands

```bash
# Development
bun run dev              # All apps (web :3001, server :3000)
bun run dev:web          # Web only
bun run dev:server       # Server only

# Build & Check
bun run build            # Build all
bun run check-types      # TypeScript (per-package via turbo)
bun run check            # oxlint + oxfmt
bun run check:type-aware # oxlint with type information (alpha)

# Database
bun run db:start         # Docker PostgreSQL
bun run db:stop          # Stop PostgreSQL
bun run db:down          # Remove PostgreSQL container
bun run db:push          # Push schema
bun run db:studio        # Drizzle Studio
bun run db:generate      # Generate migrations
bun run db:migrate       # Run migrations

# Crawler
bun run crawl            # Run WikiTree crawler
bun run crawl:migrate    # Migrate crawler data
bun run crawl:status     # Check crawl status

# Testing
bun run test             # Run all tests
bun run test:watch       # Watch mode
bun run test:coverage    # Coverage report
```

## Post-Change Verification

After changes, run: `bun run check && bun run check-types`

| Lint Issue         | Fix                       |
| ------------------ | ------------------------- |
| Unused imports     | Remove                    |
| Unused vars        | Prefix with `_` or remove |
| Non-null assertion | Use `?.` or fallback      |

### Dev Server Verification (Major Changes)

After major code changes (new packages, schema changes, router modifications):

```bash
# Quick check - build and verify no import errors
bun run build

# Full verification - start dev servers
bun run dev:server &
bun run dev:web &
# Check both are running, then Ctrl+C to stop
```

## Architecture

Turborepo monorepo with bun workspaces. Packages use `@funk-tree/*` prefix.

### Apps

| App            | Description               | Port |
| -------------- | ------------------------- | ---- |
| `apps/server`  | Hono + oRPC + Better Auth | 3000 |
| `apps/web`     | TanStack Start (SSR)      | 3001 |
| `apps/crawler` | WikiTree data crawler     | -    |

### Packages

| Package               | Purpose                                         |
| --------------------- | ----------------------------------------------- |
| `@funk-tree/api`      | oRPC router and procedures                      |
| `@funk-tree/db`       | Drizzle ORM, schema (persons, relationships)    |
| `@funk-tree/auth`     | Better Auth integration                         |
| `@funk-tree/env`      | Environment variable validation (Zod)           |
| `@funk-tree/config`   | Shared TypeScript & build config                |
| `@funk-tree/tree-viz` | PixiJS family tree visualization                |
| `@funk-tree/map-viz`  | Migration map visualization (react-simple-maps) |

### Database Schema

Key tables in `@funk-tree/db`:

- `persons` - Individual family members (WikiTree ID, name, dates, etc.)
- `relationships` - Parent-child and spouse connections
- `locations` - Places associated with persons

### WikiTree Integration

The crawler fetches data from WikiTree API. Key concepts:

- WikiTree IDs (e.g., `Funck-6` for Heinrich Funck)
- Person profiles with genealogy data
- Relationship links (parents, children, spouses)

## Environment Variables

Required in `apps/server/.env`:

- `DATABASE_URL` - PostgreSQL connection
- `DATABASE_MODE` - `postgres` | `pglite` | `pglite-memory`
- `CORS_ORIGIN` - Web app origin

Required in `apps/web/.env`:

- `VITE_SERVER_URL` - Server URL for API calls

## Type Safety

- Never use `as unknown as X` without justification
- Use type guards or Zod validation instead of casts
- Validate JSONB at boundaries with Zod schemas
- Prefix unused parameters with `_` (e.g., `_context`)

### oRPC Patterns

```typescript
// Path parameters use {id} syntax, NOT :id
path: "/persons/{id}"
input: z.object({ id: z.string() })

// GET input must be an object
input: z.object({ wikiTreeId: z.string() })  // Correct
input: z.string()  // Wrong for GET
```

## PixiJS Tree Visualization

The `@funk-tree/tree-viz` package provides interactive family tree rendering:

- Canvas-based rendering with PixiJS 8
- Pan and zoom controls
- Person nodes with expandable details
- Relationship lines (parent-child, spouse)

Key files:

- `packages/tree-viz/src/` - Core visualization logic

## Testing

Vitest is used for testing across all packages. Tests run through Turborepo.

### Running Tests

```bash
bun run test             # All packages
bun run test:watch       # Watch mode
bun run test:coverage    # With coverage report

# Single package (from package directory)
cd packages/tree-viz && bun run test
```

### Test Configuration

Packages use a shared config factory from `@funk-tree/config`:

```typescript
// packages/your-pkg/vitest.config.ts
import { createServerConfig } from "@funk-tree/config/vitest";

export default createServerConfig({
  name: "your-pkg",
  coverageExclude: ["src/react/**"], // Optional: exclude from coverage
});
```

### Test File Conventions

- Place test files next to source: `module.ts` → `module.test.ts`
- Use descriptive `describe` blocks matching the function/class name
- Test edge cases: empty inputs, null values, large datasets

```typescript
import { describe, it, expect } from "vitest";

describe("functionName", () => {
  it("handles normal case", () => {
    expect(functionName(input)).toEqual(expected);
  });

  it("handles empty input", () => {
    expect(functionName([])).toEqual([]);
  });
});
```

### Coverage Requirements

- Core algorithms should have >80% coverage
- React components and PixiJS rendering are excluded from coverage
- Focus tests on pure functions and business logic

## Troubleshooting

### Database Password Auth Failed

URL-encode special chars in `DATABASE_URL` (`=` → `%3D`, etc.)

### Module Not Found

Check exports in package.json and index.ts

### Port In Use

```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <pid> /F

# Unix
lsof -i :3000
kill <pid>
```

### Turbo Binary Missing

Run `bun install` after clearing `node_modules/.bun`

## Feature Planning Approach

**Always audit before building.** Before designing new features:

1. Search for similar implementations in the codebase
2. Check if infrastructure already exists
3. Look for partial implementations or TODOs

**Think in iterations:**

| Phase           | Focus                    | Characteristics                  |
| --------------- | ------------------------ | -------------------------------- |
| **MVP**         | Minimum valuable feature | Reuses existing code, ships fast |
| **Enhancement** | Next atomic feature      | Builds on MVP, one capability    |
| **Full**        | Complete vision          | All features, edge cases         |

Ask: **What's the smallest change that delivers value?**

## Genealogy Domain Notes

### WikiTree Data Model

- Persons have unique WikiTree IDs (e.g., `Funck-6`)
- Birth/death dates may be approximate or unknown
- Locations include place names and coordinates when available
- Relationships: parent-child, spouse

### Heinrich Funck Lineage

The project focuses on descendants of Heinrich Funck (c. 1697-1760):

- Arrived Philadelphia ~1717 from German Palatinate
- Mennonite bishop in Franconia Conference
- 10 children with wife Anne Meyer
- WikiTree profile: `Funck-6`
