# Funk Tree Web App Plan

## Overview

Build a web application using **TanStack Start** to visualize the Funk family genealogy data stored in the PgLite/PostgreSQL database. The app will provide tree visualization and search capabilities.

## Tech Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Framework | TanStack Start | Full-stack React framework with SSR, server functions, type-safe routing |
| Database | Drizzle ORM + PgLite/PostgreSQL | Already in use by crawler; seamless integration |
| Visualization | `react-d3-tree` or `family-chart` | Purpose-built for hierarchical family data |
| Styling | Tailwind CSS + shadcn/ui | Already configured in existing web app |
| State | TanStack Query | Built-in support, SWR caching for genealogy data |

## Database Schema Reference

The existing schema provides:
- **persons**: Core genealogy data (name, dates, locations, parent refs)
- **relationships**: Bidirectional links (parent/child/spouse)
- **locations**: Geocoded location cache

Current data: ~7,000+ persons with full relationship mapping.

---

## Architecture

### Option A: Migrate Existing Web App to TanStack Start

Replace the current Vite + TanStack Router setup with TanStack Start for server functions.

**Pros:**
- Retains existing auth, components, and styling
- Incremental migration possible

**Cons:**
- Migration overhead; potential breaking changes

### Option B: New TanStack Start App (Recommended)

Create a fresh `apps/tree-viewer` using TanStack Start CLI.

**Pros:**
- Clean architecture from the start
- Can copy over reusable components from `apps/web`
- No migration conflicts

**Cons:**
- Some duplicate setup initially

---

## Core Features

### Phase 1: Foundation

1. **Project Setup**
   - Initialize TanStack Start project: `npm create @tanstack/start@latest`
   - Configure Drizzle ORM connection to shared `@funk-tree/db` package
   - Set up Tailwind CSS + shadcn/ui

2. **Server Functions**
   ```typescript
   // Example: Get person by WikiTree ID
   const getPerson = createServerFn({ method: 'GET' })
     .validator((wikiId: string) => wikiId)
     .handler(async ({ data: wikiId }) => {
       return db.select().from(persons).where(eq(persons.wikiId, wikiId)).get();
     });

   // Example: Get descendants tree
   const getDescendants = createServerFn({ method: 'GET' })
     .validator((z) => z.object({ wikiId: z.string(), depth: z.number().default(3) }))
     .handler(async ({ data }) => {
       // Recursive CTE query for descendants
     });
   ```

3. **Routes Structure**
   ```
   app/routes/
   ├── __root.tsx          # Layout, navigation
   ├── index.tsx           # Landing page
   ├── tree/
   │   ├── index.tsx       # Tree viewer (start from Heinrich Funck)
   │   └── $wikiId.tsx     # Tree rooted at specific person
   └── search/
       └── index.tsx       # Person search
   ```

### Phase 2: Tree Visualization

1. **Library Choice: `family-chart`**

   Better suited for genealogy than generic tree libraries:
   - Handles spouse relationships (not just parent-child)
   - Supports both ancestors and descendants view
   - Built-in zoom/pan/navigation
   - TypeScript support

   Alternative: `react-d3-tree` if simpler hierarchy is acceptable.

2. **Data Transformation**

   Transform database records to visualization format:
   ```typescript
   interface FamilyNode {
     id: string;
     data: {
       name: string;
       birthDate?: string;
       deathDate?: string;
       birthLocation?: string;
       gender: 'M' | 'F' | 'U';
     };
     rels: {
       father?: string;
       mother?: string;
       spouses?: string[];
       children?: string[];
     };
   }
   ```

3. **Tree Features**
   - Click node to expand/collapse branches
   - Click node to view person details
   - Zoom and pan controls
   - Ancestor/descendant toggle
   - Generation highlighting

### Phase 3: Search Functionality

1. **Search Types**
   - **Name search**: Full-text search on first/middle/last names
   - **Location search**: Filter by birth/death location
   - **Date range**: Filter by birth/death year ranges

2. **Server Function**
   ```typescript
   const searchPersons = createServerFn({ method: 'GET' })
     .validator((z) => z.object({
       query: z.string().optional(),
       location: z.string().optional(),
       birthYearFrom: z.number().optional(),
       birthYearTo: z.number().optional(),
       limit: z.number().default(50),
       offset: z.number().default(0),
     }))
     .handler(async ({ data }) => {
       // Build dynamic query with filters
     });
   ```

3. **Search UI**
   - Search bar with autocomplete suggestions
   - Filter panel (collapsible)
   - Results list with pagination
   - Click result to navigate to tree view

---

## Data Queries

### Get Person with Relations
```sql
SELECT p.*,
       father.name as father_name,
       mother.name as mother_name
FROM persons p
LEFT JOIN persons father ON p.father_wiki_id = father.wiki_id
LEFT JOIN persons mother ON p.mother_wiki_id = mother.wiki_id
WHERE p.wiki_id = $1;
```

### Get Descendants (Recursive CTE)
```sql
WITH RECURSIVE descendants AS (
  -- Base case: starting person
  SELECT id, wiki_id, name, father_wiki_id, mother_wiki_id, 0 as depth
  FROM persons WHERE wiki_id = $1

  UNION ALL

  -- Recursive: children of current level
  SELECT p.id, p.wiki_id, p.name, p.father_wiki_id, p.mother_wiki_id, d.depth + 1
  FROM persons p
  JOIN descendants d ON (p.father_wiki_id = d.wiki_id OR p.mother_wiki_id = d.wiki_id)
  WHERE d.depth < $2  -- max depth parameter
)
SELECT * FROM descendants;
```

### Full-Text Search
```sql
SELECT * FROM persons
WHERE
  name ILIKE '%' || $1 || '%'
  OR first_name ILIKE '%' || $1 || '%'
  OR last_name_birth ILIKE '%' || $1 || '%'
ORDER BY
  CASE WHEN name ILIKE $1 || '%' THEN 0 ELSE 1 END,
  name
LIMIT $2 OFFSET $3;
```

---

## File Structure (New App)

```
apps/tree-viewer/
├── app/
│   ├── routes/
│   │   ├── __root.tsx
│   │   ├── index.tsx
│   │   ├── tree/
│   │   │   ├── index.tsx
│   │   │   └── $wikiId.tsx
│   │   └── search.tsx
│   ├── components/
│   │   ├── family-tree.tsx      # Tree visualization wrapper
│   │   ├── person-card.tsx      # Person details popup
│   │   ├── search-bar.tsx       # Search input with autocomplete
│   │   └── search-filters.tsx   # Advanced filter panel
│   ├── server/
│   │   ├── persons.ts           # Person-related server functions
│   │   ├── search.ts            # Search server functions
│   │   └── tree.ts              # Tree data server functions
│   └── lib/
│       ├── db.ts                # Database connection
│       └── tree-transform.ts    # Data transformation utilities
├── app.config.ts
├── package.json
└── tsconfig.json
```

---

## Implementation Steps

### Step 1: Initialize Project
- Create new TanStack Start app with CLI
- Configure monorepo integration (reference `@funk-tree/db`)
- Set up Tailwind + shadcn/ui
- Verify database connection

### Step 2: Build Data Layer
- Create server functions for person queries
- Implement recursive tree queries
- Add search functionality
- Test with existing data

### Step 3: Build Tree View
- Integrate `family-chart` or `react-d3-tree`
- Create data transformation layer
- Implement node interactions (click, expand, details)
- Add zoom/pan controls

### Step 4: Build Search Page
- Create search input with debounced queries
- Build filter panel
- Implement results list with pagination
- Link results to tree view

### Step 5: Polish & Deploy
- Add loading states and error handling
- Optimize queries for large datasets
- Add route-based code splitting
- Deploy configuration

---

## Visualization Library Comparison

| Feature | react-d3-tree | family-chart |
|---------|---------------|--------------|
| Spouse support | No (hierarchy only) | Yes |
| Ancestor + Descendant view | Manual | Built-in |
| React integration | Native | Wrapper needed |
| Customization | High | High |
| Bundle size | ~50KB | ~80KB |
| TypeScript | Yes | Yes |
| Best for | Org charts, file trees | Family trees |

**Recommendation**: Start with `family-chart` for its genealogy-specific features. Fall back to `react-d3-tree` if integration issues arise.

---

## References

- [TanStack Start Docs](https://tanstack.com/start/latest/docs/framework/react/overview)
- [TanStack Start + Drizzle Example](https://github.com/aaronksaunders/tanstack-start-drizzle-app)
- [family-chart](https://github.com/donatso/family-chart)
- [react-d3-tree](https://github.com/bkrem/react-d3-tree)
- [TanStack Start Quick Start](https://tanstack.com/start/latest/docs/framework/react/quick-start)
- [TanStack Start Build from Scratch](https://tanstack.com/start/latest/docs/framework/react/build-from-scratch)
