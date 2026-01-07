# Client-Side PGLite: Browser-Based Database Plan

## Overview

Run the genealogy database entirely in the browser using PGLite (PostgreSQL compiled to WebAssembly). This enables a single static deployment with no server required for data queries.

## Research Findings

### PGLite Browser Capabilities

| Feature       | Details                                    |
| ------------- | ------------------------------------------ |
| Bundle size   | ~3MB gzipped                               |
| Persistence   | IndexedDB via `idb://` prefix              |
| Data export   | `dumpDataDir()` → gzipped tarball          |
| Data import   | `loadDataDir` option on startup            |
| Query support | Full PostgreSQL SQL, extensions (pgvector) |
| Drizzle ORM   | Fully supported via `drizzle-orm/pglite`   |

### Current Data Size

```
PGLite data directory: 46MB (uncompressed)
Estimated gzipped: ~10-15MB
```

With ~12,000 persons crawled, this is reasonable for client-side loading.

### Existing Infrastructure

The project already has browser-ready PGLite code:

```typescript
// packages/db/src/pglite.ts
export function createBrowserDb(dbName: string = "funk-tree") {
  const client = new PGlite(`idb://${dbName}`, {
    relaxedDurability: true,
  });
  return drizzle(client, { schema });
}
```

---

## Architecture Options

### Option A: Static Data Bundle (Recommended for MVP)

```
Build Time:
  PGLite DB (crawler) → dumpDataDir() → funk-tree.tar.gz → /public/data/

Runtime:
  Browser loads → fetch(/data/funk-tree.tar.gz) → loadDataDir → IndexedDB
                                                       ↓
                                              Local Drizzle queries
```

**Pros:**

- Simplest implementation
- Works with any static hosting (Vercel, Netlify, GitHub Pages)
- No server needed after build
- Offline-capable once loaded

**Cons:**

- Data updates require rebuild + redeploy
- Initial load downloads full dataset (~10-15MB)
- No real-time sync

### Option B: ElectricSQL Sync

```
Server (PostgreSQL + Electric) ←→ Shapes API ←→ Browser PGLite (IndexedDB)
```

**Pros:**

- Real-time sync from server
- Partial replication (sync only needed data)
- Incremental updates

**Cons:**

- Requires running Electric sync service
- More complex infrastructure
- Currently alpha, no local writes/conflict resolution

### Option C: Hybrid (Static + API Fallback)

```
Browser:
  1. Try load from IndexedDB
  2. If stale/missing → fetch static bundle OR call API
  3. Cache to IndexedDB
```

**Pros:**

- Best of both worlds
- Graceful degradation

**Cons:**

- More complex client logic

---

## Recommended Approach: Option A (Static Bundle)

For a genealogy viewer with relatively static data, the static bundle approach is ideal:

1. Data changes infrequently (periodic crawls)
2. Full dataset is needed for tree navigation
3. Eliminates server costs and complexity
4. Perfect for offline family tree browsing

---

## Implementation Plan

### Phase 1: Data Export Pipeline

#### 1.1 Create export command

**Create:** `apps/crawler/src/export.ts`

```typescript
import { PGlite } from "@electric-sql/pglite";
import { writeFile } from "fs/promises";

export async function exportDatabase(dataDir: string, outputPath: string) {
  const client = new PGlite(dataDir);

  // Wait for ready
  await client.waitReady;

  // Dump to gzipped tarball
  const dump = await client.dumpDataDir("gzip");

  // Write to file
  await writeFile(outputPath, Buffer.from(await dump.arrayBuffer()));

  console.log(`Exported database to ${outputPath}`);
  console.log(`Size: ${(dump.size / 1024 / 1024).toFixed(2)} MB`);

  await client.close();
}
```

#### 1.2 Add export script

**Modify:** `apps/crawler/package.json`

```json
"export": "bun run src/index.ts export"
```

**Modify:** `package.json` (root)

```json
"crawl:export": "turbo -F @funk-tree/crawler export"
```

**Modify:** `turbo.json`

```json
"export": { "cache": false }
```

#### 1.3 Add to crawler index.ts

```typescript
case "export": {
  const { exportDatabase } = await import("./export");
  const outputPath = process.argv[3] || "../../apps/web/public/data/funk-tree.tar.gz";
  await exportDatabase(DATA_DIR, outputPath);
  break;
}
```

---

### Phase 2: Browser Database Client

#### 2.1 Create browser database loader

**Create:** `packages/db/src/browser.ts`

```typescript
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema";

const DB_NAME = "funk-tree";
const DATA_URL = "/data/funk-tree.tar.gz";
const VERSION_KEY = "funk-tree-db-version";

export type BrowserDatabase = ReturnType<typeof drizzle<typeof schema>>;

let dbInstance: BrowserDatabase | null = null;
let dbPromise: Promise<BrowserDatabase> | null = null;

/**
 * Get or initialize the browser database.
 * - First visit: Downloads data bundle, loads into IndexedDB
 * - Subsequent visits: Loads from IndexedDB cache
 */
export async function getBrowserDb(): Promise<BrowserDatabase> {
  if (dbInstance) return dbInstance;
  if (dbPromise) return dbPromise;

  dbPromise = initBrowserDb();
  dbInstance = await dbPromise;
  return dbInstance;
}

async function initBrowserDb(): Promise<BrowserDatabase> {
  // Check if we have cached data and it's current version
  const cachedVersion = localStorage.getItem(VERSION_KEY);
  const currentVersion = import.meta.env.VITE_DB_VERSION || "1";

  let client: PGlite;

  if (cachedVersion === currentVersion) {
    // Load from IndexedDB cache
    console.log("[DB] Loading from IndexedDB cache...");
    client = new PGlite(`idb://${DB_NAME}`, {
      relaxedDurability: true,
    });
  } else {
    // Download fresh data
    console.log("[DB] Downloading data bundle...");
    const response = await fetch(DATA_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch database: ${response.status}`);
    }

    const dataBlob = await response.blob();
    console.log(`[DB] Downloaded ${(dataBlob.size / 1024 / 1024).toFixed(2)} MB`);

    // Clear old IndexedDB if exists
    if (cachedVersion) {
      await deleteIndexedDB(`idb://${DB_NAME}`);
    }

    // Load data into PGLite with IndexedDB persistence
    client = new PGlite(`idb://${DB_NAME}`, {
      relaxedDurability: true,
      loadDataDir: dataBlob,
    });

    // Mark version after successful load
    localStorage.setItem(VERSION_KEY, currentVersion);
    console.log("[DB] Data loaded and cached");
  }

  await client.waitReady;
  return drizzle(client, { schema });
}

async function deleteIndexedDB(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name.replace("idb://", ""));
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export { schema };
```

#### 2.2 Export from package

**Modify:** `packages/db/package.json` exports

```json
"exports": {
  ".": "./src/index.ts",
  "./schema": "./src/schema/index.ts",
  "./pglite": "./src/pglite.ts",
  "./browser": "./src/browser.ts"
}
```

---

### Phase 3: Web App Integration

#### 3.1 Create local query hooks

**Create:** `apps/web/src/hooks/useLocalDb.ts`

```typescript
import { useEffect, useState } from "react";
import { getBrowserDb, type BrowserDatabase } from "@funk-tree/db/browser";

export function useLocalDb() {
  const [db, setDb] = useState<BrowserDatabase | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState<string>("Initializing...");

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setProgress("Loading database...");
        const database = await getBrowserDb();
        if (!cancelled) {
          setDb(database);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsLoading(false);
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  return { db, isLoading, error, progress };
}
```

#### 3.2 Create local genealogy queries

**Create:** `apps/web/src/lib/local-queries.ts`

```typescript
import { eq, or, sql, and, ilike } from "drizzle-orm";
import { persons, relationships, locations } from "@funk-tree/db/schema";
import type { BrowserDatabase } from "@funk-tree/db/browser";

export async function getPersonLocal(db: BrowserDatabase, wikiId: string) {
  const person = await db.select().from(persons).where(eq(persons.wikiId, wikiId)).limit(1);
  if (!person[0]) return null;

  const [father, mother] = await Promise.all([
    person[0].fatherWikiId
      ? db.select().from(persons).where(eq(persons.wikiId, person[0].fatherWikiId)).limit(1)
      : Promise.resolve([]),
    person[0].motherWikiId
      ? db.select().from(persons).where(eq(persons.wikiId, person[0].motherWikiId)).limit(1)
      : Promise.resolve([]),
  ]);

  const children = await db
    .select()
    .from(persons)
    .where(or(eq(persons.fatherWikiId, wikiId), eq(persons.motherWikiId, wikiId)));

  return {
    ...person[0],
    father: father[0] || null,
    mother: mother[0] || null,
    children,
  };
}

export async function getDescendantsLocal(db: BrowserDatabase, wikiId: string, depth: number = 3) {
  const result = await db.execute(sql`
    WITH RECURSIVE descendants AS (
      SELECT *, 0 as tree_depth FROM persons WHERE wiki_id = ${wikiId}
      UNION ALL
      SELECT p.*, d.tree_depth + 1
      FROM persons p
      INNER JOIN descendants d ON (p.father_wiki_id = d.wiki_id OR p.mother_wiki_id = d.wiki_id)
      WHERE d.tree_depth < ${depth}
    )
    SELECT * FROM descendants ORDER BY tree_depth, name
  `);
  return result.rows;
}

// ... similar for getAncestors, searchPersons, getMapData, etc.
```

#### 3.3 Update routes to use local DB

**Option A: Replace oRPC entirely**

```typescript
// apps/web/src/routes/tree/index.tsx
import { useLocalDb } from "@/hooks/useLocalDb";
import { getDescendantsLocal } from "@/lib/local-queries";

function TreePage() {
  const { db, isLoading: dbLoading } = useLocalDb();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!db) return;
    getDescendantsLocal(db, ROOT_WIKI_ID, 4).then(setData);
  }, [db]);

  // ... render
}
```

**Option B: Create unified data layer (recommended)**

```typescript
// apps/web/src/lib/data-provider.tsx
const DataContext = createContext<{
  getDescendants: (wikiId: string, depth: number) => Promise<Person[]>;
  // ... other methods
}>(null);

export function DataProvider({ children, mode = "local" }: Props) {
  const { db } = useLocalDb();
  const { orpc } = useRouteContext();

  const api = useMemo(() => {
    if (mode === "local" && db) {
      return {
        getDescendants: (wikiId, depth) => getDescendantsLocal(db, wikiId, depth),
        // ...
      };
    }
    // Fallback to server API
    return {
      getDescendants: (wikiId, depth) => orpc.genealogy.getDescendants.query({ wikiId, depth }),
      // ...
    };
  }, [mode, db, orpc]);

  return <DataContext.Provider value={api}>{children}</DataContext.Provider>;
}
```

---

### Phase 4: Build Pipeline

#### 4.1 Add data export to build

**Modify:** `apps/web/package.json`

```json
"scripts": {
  "prebuild": "cd ../crawler && bun run export",
  "build": "vite build"
}
```

Or create a combined build script:

```json
// package.json (root)
"build:static": "bun run crawl:export && bun run build"
```

#### 4.2 Add version environment variable

**Create/modify:** `apps/web/.env`

```
VITE_DB_VERSION=2025-01-07
```

Update this when data changes to force re-download.

---

## Migration Path

### Step 1: Parallel Implementation

- Keep existing server/oRPC working
- Add client-side as opt-in via query param or toggle

### Step 2: Testing

- Compare query results between server and local
- Performance benchmarking
- Offline testing

### Step 3: Default to Local

- Make client-side the default
- Keep server as fallback for edge cases

### Step 4: Remove Server (Optional)

- Deploy as fully static site
- Remove server infrastructure

---

## Performance Considerations

### Initial Load

- ~10-15MB download on first visit
- Show loading progress bar
- Data cached in IndexedDB for future visits

### Query Performance

- PGLite queries run in WASM (~10-100ms for complex queries)
- Recursive CTEs work but are slower than native Postgres
- Consider pre-computing common queries during export

### Memory Usage

- PGLite uses ~50-100MB RAM for 46MB database
- Acceptable for modern browsers
- May need pagination for very large result sets

---

## Offline Support

With client-side PGLite + service worker:

```typescript
// Service worker caches:
// - Application shell (JS, CSS)
// - Database bundle (funk-tree.tar.gz)
// - Map tiles (if using offline maps)

// Result: Full offline genealogy browsing
```

---

## Files to Create/Modify

### Create

| File                                | Purpose                     |
| ----------------------------------- | --------------------------- |
| `apps/crawler/src/export.ts`        | Database export command     |
| `packages/db/src/browser.ts`        | Browser database loader     |
| `apps/web/src/hooks/useLocalDb.ts`  | React hook for local DB     |
| `apps/web/src/lib/local-queries.ts` | Local query implementations |
| `apps/web/public/data/.gitkeep`     | Data directory              |

### Modify

| File                        | Change             |
| --------------------------- | ------------------ |
| `apps/crawler/src/index.ts` | Add export command |
| `apps/crawler/package.json` | Add export script  |
| `packages/db/package.json`  | Add browser export |
| `package.json` (root)       | Add crawl:export   |
| `turbo.json`                | Add export task    |

---

## Open Questions

1. **Version strategy**: How to handle data updates?
   - Option: Date-based version in filename (`funk-tree-2025-01-07.tar.gz`)
   - Option: Content hash

2. **Partial loading**: Download full dataset or lazy-load branches?
   - For 46MB, full load is acceptable
   - Could optimize later with shapes/sync

3. **Write support**: Should users be able to add notes/bookmarks?
   - Store in separate IndexedDB
   - Sync to server if authenticated

---

## References

- [PGLite Documentation](https://pglite.dev/)
- [PGLite GitHub](https://github.com/electric-sql/pglite)
- [Drizzle ORM PGLite Driver](https://orm.drizzle.team/docs/get-started-postgresql#pglite)
- [ElectricSQL Sync](https://electric-sql.com/docs/guides/shapes)
