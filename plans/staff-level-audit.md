# Staff-Level TypeScript Expert Audit

**Date**: 2026-01-07
**Scope**: Full codebase audit after tree-viz and map-viz feature implementations
**Focus**: Production readiness, type safety, architecture, and developer experience

---

## Executive Summary

The funk-tree monorepo demonstrates solid architectural foundations with modern tooling choices (oRPC, Drizzle, PixiJS v8, TanStack). The two major features (tree-viz and map-viz) are well-implemented. However, several gaps exist between current state and production-ready code that warrant attention.

| Category                 | Status           | Priority |
| ------------------------ | ---------------- | -------- |
| **Type Safety**          | Good             | Medium   |
| **Testing**              | Critical Gap     | P0       |
| **Error Handling**       | Incomplete       | P1       |
| **Performance**          | Solid Foundation | P2       |
| **Developer Experience** | Good, Gaps Exist | P1       |
| **CI/CD**                | Not Configured   | P0       |

---

## Detailed Findings

### 1. Testing Infrastructure (Critical Gap)

**Current State**: Testing infrastructure exists (vitest workspace, configs) but **minimal tests**.

```
vitest.workspace.ts ✓
packages/*/vitest.config.ts ✓
Actual test files: 2 (crawler only - 284 lines total)
```

**Existing Tests** (`apps/crawler/src/`):

- `utils.test.ts` (148 lines) - buildFullName, extractIds, parseWikiTreeDate
- `wikitree-api.test.ts` (136 lines) - API integration with fetch mocking

**Impact**:

- No regression protection for tree layout algorithm
- No validation of API endpoint behavior
- Database queries untested

**Recommendation** - High Priority Tests to Add:

| Package    | Test Priority | What to Test                                                                   |
| ---------- | ------------- | ------------------------------------------------------------------------------ |
| `tree-viz` | Critical      | `computeLayout()` - generation assignment, spouse grouping, bounds calculation |
| `tree-viz` | Critical      | `buildTreeState()` - parent/child/spouse linking                               |
| `api`      | High          | `getDescendants`, `getAncestors` - recursive CTE correctness                   |
| `api`      | High          | `getMapData` - year filtering, location aggregation                            |
| `db`       | Medium        | Schema type exports, constraint validation                                     |

**Example Test Structure**:

```typescript
// packages/tree-viz/src/core/layout/__tests__/generation-layout.test.ts
describe("computeLayout", () => {
  it("assigns correct generations from root", () => {
    const persons = [
      { id: "A", name: "Root", fatherWikiId: null, motherWikiId: null },
      { id: "B", name: "Child", fatherWikiId: "A", motherWikiId: null },
    ];
    const tree = buildTreeState(persons, "A");
    const layout = computeLayout(tree, DEFAULT_CONFIG);

    const rootGen = layout.generations.get(0);
    const childGen = layout.generations.get(1);

    expect(rootGen).toContain("A");
    expect(childGen).toContain("B");
  });

  it("places spouses at same generation", () => { /* ... */ });
  it("handles disconnected nodes gracefully", () => { /* ... */ });
});
```

---

### 2. CI/CD Pipeline (Not Configured)

**Current State**: No GitHub Actions or CI pipeline exists.

**Recommendation**: Add `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run check

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run check-types

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run build

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run test --coverage

  ci-success:
    needs: [lint, typecheck, build, test]
    runs-on: ubuntu-latest
    steps:
      - run: echo "All checks passed"
```

---

### 3. Error Handling Gaps

#### 3.1 API Error Consistency

**Issue**: API handlers don't use consistent error types or HTTP status codes.

**Current** (`packages/api/src/routers/genealogy.ts:12-14`):

```typescript
if (!person[0]) {
  return null;  // Returns null, not an error
}
```

**Recommendation**: Create standardized error handling:

```typescript
// packages/api/src/errors.ts
import { ORPCError } from "@orpc/server";

export const NotFoundError = (resource: string, id: string) =>
  new ORPCError("NOT_FOUND", { message: `${resource} '${id}' not found` });

export const ValidationError = (details: string) =>
  new ORPCError("BAD_REQUEST", { message: details });

// Usage in handler:
if (!person[0]) {
  throw NotFoundError("Person", input.wikiId);
}
```

#### 3.2 Database Error Handling

**Issue**: Raw SQL queries can fail silently or throw unhandled errors.

**Location**: `packages/api/src/routers/genealogy.ts:67-93` (recursive CTEs)

**Recommendation**: Wrap database operations:

```typescript
async function executeWithErrorHandling<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.error(`Database error in ${context}:`, error);
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "Database operation failed"
    });
  }
}
```

---

### 4. Type Safety Improvements

#### 4.1 Unsafe Cast in FamilyTree

**Location**: `packages/tree-viz/src/react/FamilyTree.tsx:159`

```typescript
onPersonSelect?.(null as unknown as Person);  // Unsafe cast
```

**Fix**:

```typescript
// Option 1: Make callback accept null
onPersonSelect?: (person: Person | null) => void;

// Option 2: Guard the call
if (selectedNodeId) {
  onPersonSelect?.(null);
}
```

#### 4.2 Non-null Assertions in Layout

**Location**: `packages/tree-viz/src/core/layout/generation-layout.ts:47, 113-114`

```typescript
const [id, gen] = queue.shift()!;  // Could fail on empty queue
const nodeA = nodes.get(a)!;        // Assumes node exists
```

**Recommendation**: Add guards or use early returns:

```typescript
const item = queue.shift();
if (!item) continue;
const [id, gen] = item;

const nodeA = nodes.get(a);
const nodeB = nodes.get(b);
if (!nodeA || !nodeB) return 0;
```

#### 4.3 JSONB Type Safety

**Issue**: No Zod validation for complex query return types.

**Current**: Raw `db.execute(sql\`...\`)` returns untyped rows.

**Recommendation**: Add return type validation:

```typescript
// packages/api/src/routers/genealogy.ts
import { z } from "zod";

const DescendantRow = z.object({
  id: z.number(),
  wiki_id: z.string(),
  name: z.string().nullable(),
  tree_depth: z.number(),
  // ... other fields
});

export const getDescendants = publicProcedure
  .input(...)
  .handler(async ({ input }) => {
    const result = await db.execute(sql`...`);
    return z.array(DescendantRow).parse(result.rows);
  });
```

---

### 5. Performance Considerations

#### 5.1 Layout Computation Blocking

**Issue**: `computeLayout()` runs synchronously on main thread.

**Current Plan**: Web Worker implementation is documented but not implemented.

**Recommendation**: Implement for trees >1000 nodes:

```typescript
// packages/tree-viz/src/hooks/useLayoutWorker.ts (exists, needs integration)
const { computeLayout: computeInWorker } = useLayoutWorker();

// In FamilyTree.tsx, use conditional:
const layoutFn = persons.length > 1000 ? computeInWorker : computeLayout;
```

#### 5.2 Map Component Re-renders

**Location**: `packages/map-viz/src/react/MigrationMap.tsx`

**Issue**: `getMarkerRadius` recreated on each render unnecessarily.

**Current**:

```typescript
const getMarkerRadius = useCallback((count: number): number => {
  return Math.max(4, Math.min(20, Math.sqrt(count) * 3));
}, []);  // Empty deps, could be a plain function
```

**Fix**: Move outside component or use `useMemo`:

```typescript
// Outside component
const getMarkerRadius = (count: number) =>
  Math.max(4, Math.min(20, Math.sqrt(count) * 3));
```

#### 5.3 Incomplete Layout Centering

**Location**: `packages/tree-viz/src/core/layout/generation-layout.ts:196`

```typescript
// TODO: Second pass - center parents above their children
```

This TODO affects visual quality for complex trees. Consider implementing.

---

### 6. API Design Improvements

#### 6.1 Pagination Pattern Inconsistency

**Issue**: `searchPersons` has pagination, but `getDescendants`/`getAncestors` don't.

**Impact**: Large trees could return excessive data.

**Recommendation**: Add cursor-based pagination or streaming for recursive queries.

#### 6.2 Missing API Input Validation

**Issue**: Some string inputs aren't validated for minimum length.

**Example** (`packages/api/src/routers/genealogy.ts:153`):

```typescript
query: z.string().optional(),  // Could be empty string ""
```

**Fix**:

```typescript
query: z.string().min(1).optional(),
```

---

### 7. Developer Experience Enhancements

#### 7.1 Git Hooks Configured but Too Permissive

**Current State**: Husky and lint-staged ARE configured:

- `.husky/pre-commit` exists (runs `bunx lint-staged`)
- `.lintstagedrc.mjs` runs `oxlint --fix || true` and `oxfmt`

**Issue**: The `|| true` pattern and final `exit 0` means all failures pass silently.

**Recommendation**: Make linting errors block commits while keeping formatting non-blocking:

```javascript
// .lintstagedrc.mjs - updated
export default {
  "*.{ts,tsx,js,jsx}": ["oxlint --fix"],  // Remove || true to fail on errors
  "*.{ts,tsx,js,jsx,json,md,css}": ["oxfmt --write || true"],  // Format is non-blocking
};
```

#### 7.2 Catalog Deviation

**Issue**: `@orpc/tanstack-query` is hardcoded in `apps/web/package.json` instead of using the workspace catalog.

**Fix**: Add to root `package.json` catalog:

```json
"@orpc/tanstack-query": "^1.12.2"
```

Then update `apps/web/package.json` to use `"@orpc/tanstack-query": "catalog:"`.

#### 7.3 Missing Path Aliases in Some Packages

**Issue**: Some packages use relative imports that could benefit from aliases.

**Current** (`apps/web/src/routes/map/index.tsx`):

```typescript
import { Skeleton } from "@/components/ui/skeleton";
import { useLocalDb } from "@/hooks/use-local-db";
```

Web app has aliases, but packages like `tree-viz` use relative paths.

#### 7.3 Debug Overlay in Production

**Location**: Plan mentions debug overlay for tree-viz but implementation not found in current code.

**Recommendation**: Add conditional debug overlay:

```typescript
{import.meta.env.DEV && (
  <div className="absolute top-2 left-2 ...">
    <div>Nodes: {visibleNodes.length}</div>
    <div>Scale: {viewport.scale.toFixed(2)}</div>
  </div>
)}
```

---

### 8. Database Schema Enhancements

#### 8.1 Missing Indexes

**Current indexes** (`packages/db/src/schema/genealogy.ts`):

- `idx_persons_wiki_id`
- `idx_persons_birth_location`
- `idx_persons_last_name`

**Missing** (based on query patterns):

```typescript
// Add to persons table indexes:
index("idx_persons_father_wiki_id").on(table.fatherWikiId),
index("idx_persons_mother_wiki_id").on(table.motherWikiId),

// For map queries:
index("idx_locations_coords").on(table.latitude, table.longitude),
```

#### 8.2 Foreign Key Consideration

**Issue**: `fatherWikiId` and `motherWikiId` are text references, not proper foreign keys.

**Trade-off**:

- Current approach: Flexible for incremental crawling (can reference un-crawled profiles)
- FK approach: Ensures referential integrity but requires ordered imports

**Recommendation**: Keep current approach but add validation at application level.

---

### 9. Security Considerations

#### 9.1 SQL Injection Protection

**Status**: ✅ Good - All queries use Drizzle's parameterized templates.

```typescript
// Safe pattern used throughout:
sql`WHERE wiki_id = ${input.wikiId}`
```

#### 9.2 Input Sanitization

**Status**: ⚠️ Zod handles type validation but no XSS sanitization for display names.

**Recommendation**: Sanitize user-facing data before storage or display:

```typescript
import { sanitize } from "isomorphic-dompurify";
const safeName = sanitize(name, { ALLOWED_TAGS: [] });
```

---

### 10. Documentation Gaps

#### 10.1 CLAUDE.md Updates Needed

Current CLAUDE.md is comprehensive but should add:

1. **Testing section** once tests are added
2. **Error handling patterns** once standardized
3. **Feature flags** if any are added for gradual rollout

#### 10.2 API Documentation

**Recommendation**: Generate OpenAPI spec from oRPC:

```typescript
// packages/api/src/openapi.ts
import { OpenAPIGenerator } from "@orpc/openapi";
import { router } from "./routers";

export const openApiSpec = OpenAPIGenerator.generate(router, {
  info: { title: "funk-tree API", version: "1.0.0" },
});
```

---

## Priority Matrix

| Priority | Enhancement                         | Effort | Impact | Files to Change                                          |
| -------- | ----------------------------------- | ------ | ------ | -------------------------------------------------------- | --- | ------ |
| **P0**   | Add test coverage for tree-viz      | Medium | High   | New files in `packages/*/src/__tests__/`                 |
| **P0**   | Set up CI/CD pipeline               | Low    | High   | `.github/workflows/ci.yml`                               |
| **P1**   | Standardize error handling          | Medium | Medium | `packages/api/src/errors.ts`, all routers                |
| **P1**   | Strengthen git hooks                | Low    | Medium | `.lintstagedrc.mjs` (remove `                            |     | true`) |
| **P1**   | Fix unsafe type casts               | Low    | Medium | `packages/tree-viz/src/react/FamilyTree.tsx`             |
| **P1**   | Add @orpc/tanstack-query to catalog | Low    | Low    | Root `package.json`, `apps/web/package.json`             |
| **P2**   | Add missing DB indexes              | Low    | Medium | `packages/db/src/schema/genealogy.ts`                    |
| **P2**   | Implement layout worker integration | Medium | Medium | `packages/tree-viz/src/react/FamilyTree.tsx`             |
| **P2**   | Complete parent centering in layout | Medium | Low    | `packages/tree-viz/src/core/layout/generation-layout.ts` |
| **P3**   | Add pagination to tree queries      | Medium | Low    | `packages/api/src/routers/genealogy.ts`                  |
| **P3**   | Generate OpenAPI documentation      | Low    | Low    | New `packages/api/src/openapi.ts`                        |

---

## Implementation Order

### Phase 1: Critical Infrastructure (Week 1)

1. Create test files for `tree-viz/core` (layout, transform, spatial)
2. Add GitHub Actions CI pipeline
3. Fix unsafe type casts

### Phase 2: API Hardening (Week 2)

1. Standardize error handling across API
2. Add Zod validation for CTE return types
3. Add missing database indexes

### Phase 3: Developer Experience (Week 3)

1. Configure Husky + lint-staged
2. Add debug overlays
3. Update CLAUDE.md with testing patterns

### Phase 4: Performance & Polish (Week 4)

1. Integrate Web Worker for layout
2. Complete parent centering algorithm
3. Add pagination to recursive queries

---

## Conclusion

The codebase demonstrates thoughtful architecture and modern patterns. The two major features (PixiJS tree visualization and react-simple-maps migration map) are well-implemented with attention to performance (R-Tree culling, viewport management).

The critical gaps are:

1. **Zero test coverage** - This is the highest risk item
2. **No CI/CD** - Changes can break without automated gates

Addressing these two items would bring the codebase to production-ready status. The remaining items are enhancements that improve maintainability and developer experience.

---

## Appendix: File Reference

Key files analyzed in this audit:

| File                                                     | Lines | Purpose             |
| -------------------------------------------------------- | ----- | ------------------- |
| `packages/api/src/routers/genealogy.ts`                  | 381   | Core API endpoints  |
| `packages/db/src/schema/genealogy.ts`                    | 123   | Database schema     |
| `packages/tree-viz/src/react/FamilyTree.tsx`             | 198   | Main tree component |
| `packages/tree-viz/src/core/layout/generation-layout.ts` | 291   | Layout algorithm    |
| `packages/map-viz/src/react/MigrationMap.tsx`            | 155   | Map component       |
| `apps/web/src/routes/map/index.tsx`                      | 224   | Map page            |
| `apps/web/src/hooks/use-local-db.tsx`                    | 93    | Browser DB hook     |
| `packages/config/tsconfig.base.json`                     | 25    | TS config           |
| `.oxlintrc.json`                                         | 156   | Lint rules          |
