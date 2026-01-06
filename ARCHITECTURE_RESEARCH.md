# Funk Tree Architecture Research & Migration Plan

## Current State

- **Progress file**: 5.2MB (15k+ profiles in queue)
- **Exported data**: 788KB
- **Format**: JSON files for storage and progress tracking

---

## JSON File Limitations

### No Hard Limits, But Practical Concerns

| File Size | Impact |
|-----------|--------|
| **<10MB** | Generally fine for most use cases |
| **10-50MB** | Noticeable slowdown in parsing; memory usage ~4x file size |
| **50-100MB** | Browser may freeze; 400MB+ RAM usage |
| **100MB+** | Risk of crashes; memory can be 7-10x file size |

### Key Issues

1. **Memory explosion**: A 100MB JSON file can consume 400MB+ RAM when parsed
2. **Blocking parse**: `JSON.parse()` blocks the main thread
3. **Browser limits**: Chrome tabs limited to ~220-430MB; files >48MB risk crashes
4. **No partial loading**: Must load entire file to read any data

### Verdict

With 15k+ profiles and growing, you'll likely hit **10-50MB** soon. JSON will work but becomes painful for:
- Web app loading times
- Memory usage during crawling
- Inability to query without loading everything

---

## SQLite: The Better Alternative

### Why SQLite Works

| Feature | Value |
|---------|-------|
| **Max DB size** | 281 TB (practical: 17 TB) |
| **Max rows** | Effectively unlimited for genealogy |
| **Concurrency** | Unlimited readers, 1 writer |
| **Query speed** | Instant lookups with indexes |
| **Memory** | Only loads what you query |

### Browser Support

SQLite can run in browsers via WebAssembly:

| Library | Use Case |
|---------|----------|
| **sql.js** | Simple, loads DB into memory |
| **sql.js-httpvfs** | Static hosting, fetches only needed pages via HTTP Range requests |
| **SQLite WASM (official)** | Production-grade, OPFS persistence |

**Key insight**: With `sql.js-httpvfs`, you can host a 670MB database on GitHub Pages and queries fetch only ~54KB across 49 HTTP requests.

### Recommended Schema

```sql
-- Core person data
CREATE TABLE persons (
    id INTEGER PRIMARY KEY,
    wiki_id TEXT UNIQUE NOT NULL,
    name TEXT,
    first_name TEXT,
    middle_name TEXT,
    last_name_birth TEXT,
    last_name_current TEXT,
    suffix TEXT,
    gender TEXT,
    birth_date TEXT,
    death_date TEXT,
    birth_location TEXT,
    death_location TEXT,
    is_living INTEGER DEFAULT 0,
    generation INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Relationships (normalized)
CREATE TABLE relationships (
    id INTEGER PRIMARY KEY,
    person_id INTEGER NOT NULL,
    related_person_id INTEGER NOT NULL,
    relationship_type TEXT NOT NULL, -- 'parent', 'child', 'spouse'
    FOREIGN KEY (person_id) REFERENCES persons(id),
    FOREIGN KEY (related_person_id) REFERENCES persons(id),
    UNIQUE(person_id, related_person_id, relationship_type)
);

-- Crawl queue
CREATE TABLE crawl_queue (
    id INTEGER PRIMARY KEY,
    wiki_id TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'error'
    priority INTEGER DEFAULT 0,
    source_person_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0
);

-- Crawl metadata
CREATE TABLE crawl_metadata (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_persons_wiki_id ON persons(wiki_id);
CREATE INDEX idx_persons_birth_location ON persons(birth_location);
CREATE INDEX idx_queue_status ON crawl_queue(status);
CREATE INDEX idx_relationships_person ON relationships(person_id);
```

---

## Option A: Keep Python + Add SQLite

### Pros
- Minimal changes to existing code
- Python's `sqlite3` is built-in
- Quick to implement

### Cons
- No shared types with web frontend
- Separate toolchains for crawler vs web app
- Manual JSON export step for web visualization

### Implementation Steps

1. **Create migration script** (`migrate_to_sqlite.py`)
   - Read existing `progress.json`
   - Create SQLite schema
   - Import persons, queue, visited set

2. **Update `wikitree_crawler.py`**
   - Replace JSON read/write with SQLite operations
   - Use transactions for periodic saves
   - Queue management via SQL queries

3. **Create export script** (`export_for_web.py`)
   - Query SQLite for visualization data
   - Export optimized JSON or generate static SQLite for web

### Python Crawler Changes

```python
import sqlite3

class WikiTreeCrawler:
    def __init__(self, db_path="wikitree_data/funk_tree.db"):
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute('PRAGMA journal_mode=WAL')
        self._init_schema()

    def _init_schema(self):
        # Create tables if not exist
        ...

    def _save_person(self, profile):
        self.conn.execute('''
            INSERT OR REPLACE INTO persons
            (wiki_id, name, birth_date, birth_location, ...)
            VALUES (?, ?, ?, ?, ...)
        ''', (...))

    def _add_to_queue(self, wiki_id, source_person_id=None):
        self.conn.execute('''
            INSERT OR IGNORE INTO crawl_queue (wiki_id, source_person_id)
            VALUES (?, ?)
        ''', (wiki_id, source_person_id))

    def _get_next_from_queue(self):
        row = self.conn.execute('''
            SELECT wiki_id FROM crawl_queue
            WHERE status = 'pending'
            ORDER BY priority DESC, created_at ASC
            LIMIT 1
        ''').fetchone()
        return row['wiki_id'] if row else None
```

### File Structure (Python Route)

```
funk-tree/
├── wikitree_crawler.py      # Updated to use SQLite
├── migrate_to_sqlite.py     # One-time migration script
├── export_for_web.py        # Export for visualization
├── geocode_locations.py     # Geocode birth locations
├── wikitree_data/
│   ├── funk_tree.db         # SQLite database
│   └── progress.json        # Legacy (archived)
└── web/                     # Static web visualization
    ├── index.html
    ├── funk_tree.db         # Exported for web (or JSON)
    └── js/
        └── app.js           # Uses sql.js-httpvfs
```

---

## Option B: TypeScript Monorepo with Bun + Turborepo

### Pros
- Shared types between crawler and web app
- Modern tooling, fast builds
- Single language across stack
- Better for long-term web app development
- Bun runs TypeScript natively (no compile step for dev)

### Cons
- Migration effort from Python
- Learning curve if unfamiliar with monorepo tooling
- Bun ecosystem still maturing

### Monorepo Structure

```
funk-tree/
├── apps/
│   ├── crawler/              # WikiTree crawler CLI
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── wikitree-api.ts
│   │   │   └── db.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                  # Visualization web app
│       ├── src/
│       │   ├── App.tsx
│       │   ├── components/
│       │   │   ├── FamilyTree.tsx
│       │   │   └── MigrationMap.tsx
│       │   └── lib/
│       │       └── db.ts     # sql.js-httpvfs client
│       ├── package.json
│       └── vite.config.ts
│
├── packages/
│   ├── types/                # Shared TypeScript types
│   │   ├── src/
│   │   │   ├── person.ts
│   │   │   ├── relationship.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── db/                   # Shared database utilities
│   │   ├── src/
│   │   │   ├── schema.ts
│   │   │   ├── migrations.ts
│   │   │   └── queries.ts
│   │   └── package.json
│   │
│   └── config/               # Shared configs
│       ├── tsconfig.base.json
│       └── eslint.config.js
│
├── data/                     # Database files
│   └── funk_tree.db
│
├── package.json              # Root workspace
├── turbo.json                # Turborepo config
├── bun.lockb
└── bunfig.toml
```

### Setup Steps

```bash
# 1. Create monorepo
bunx create-turbo@latest funk-tree
cd funk-tree

# 2. Configure Bun workspaces (package.json)
{
  "name": "funk-tree",
  "private": true,
  "workspaces": ["apps/*", "packages/*"]
}

# 3. Create shared types package
mkdir -p packages/types/src
cd packages/types
bun init

# 4. Create crawler app
mkdir -p apps/crawler/src
cd apps/crawler
bun init
bun add better-sqlite3 @types/better-sqlite3

# 5. Create web app
cd apps/web
bun create vite . --template react-ts
bun add sql.js-httpvfs

# 6. Install all dependencies
cd ../..
bun install

# 7. Run development
turbo dev
```

### Key TypeScript Files

**packages/types/src/person.ts**
```typescript
export interface Person {
  id: number;
  wikiId: string;
  name: string;
  firstName?: string;
  middleName?: string;
  lastNameBirth?: string;
  lastNameCurrent?: string;
  suffix?: string;
  gender?: 'Male' | 'Female' | 'Unknown';
  birthDate?: string;
  deathDate?: string;
  birthLocation?: string;
  deathLocation?: string;
  isLiving?: boolean;
  generation?: number;
}

export interface Relationship {
  id: number;
  personId: number;
  relatedPersonId: number;
  type: 'parent' | 'child' | 'spouse';
}

export interface QueueItem {
  id: number;
  wikiId: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  priority: number;
  createdAt: Date;
}
```

**apps/crawler/src/db.ts**
```typescript
import Database from 'better-sqlite3';
import type { Person, QueueItem } from '@funk-tree/types';

export class CrawlerDB {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  savePerson(person: Person): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO persons
      (wiki_id, name, first_name, birth_date, birth_location, ...)
      VALUES (?, ?, ?, ?, ?, ...)
    `);
    stmt.run(person.wikiId, person.name, ...);
  }

  getNextFromQueue(): QueueItem | null {
    return this.db.prepare(`
      SELECT * FROM crawl_queue
      WHERE status = 'pending'
      ORDER BY priority DESC
      LIMIT 1
    `).get() as QueueItem | null;
  }
}
```

### Deployment Options

| Platform | Best For | Setup |
|----------|----------|-------|
| **GitHub Pages** | Free static hosting | Build → push `dist/` |
| **Cloudflare Pages** | Edge performance, free tier | Connect repo, auto-deploy |
| **Vercel** | Next.js optimized | Connect repo, zero-config |

For a static SQLite-powered site, **Cloudflare Pages** or **GitHub Pages** with `sql.js-httpvfs` is ideal.

---

## Database Options with Drizzle ORM

Both database options below use **Drizzle ORM** for type-safe queries and schema management.

### Why Drizzle?

- **Type-safe**: Full TypeScript inference from schema
- **Lightweight**: ~7KB bundle, no code generation step
- **SQL-like**: Familiar syntax, not a heavy abstraction
- **Multi-dialect**: Supports PostgreSQL, SQLite, MySQL
- **Migrations**: Built-in migration generation via `drizzle-kit`

---

### Database Option 1: SQLite (better-sqlite3 / libsql)

Best for: Maximum compatibility, smaller bundle, simpler setup

**Installation:**
```bash
bun add drizzle-orm better-sqlite3
bun add -D drizzle-kit @types/better-sqlite3
```

**Drizzle Schema (packages/db/src/schema.sqlite.ts):**
```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const persons = sqliteTable('persons', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  wikiId: text('wiki_id').unique().notNull(),
  name: text('name'),
  firstName: text('first_name'),
  middleName: text('middle_name'),
  lastNameBirth: text('last_name_birth'),
  lastNameCurrent: text('last_name_current'),
  suffix: text('suffix'),
  gender: text('gender'),
  birthDate: text('birth_date'),
  deathDate: text('death_date'),
  birthLocation: text('birth_location'),
  deathLocation: text('death_location'),
  isLiving: integer('is_living', { mode: 'boolean' }).default(false),
  generation: integer('generation'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export const relationships = sqliteTable('relationships', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  personId: integer('person_id').notNull().references(() => persons.id),
  relatedPersonId: integer('related_person_id').notNull().references(() => persons.id),
  relationshipType: text('relationship_type').notNull(), // 'parent', 'child', 'spouse'
});

export const crawlQueue = sqliteTable('crawl_queue', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  wikiId: text('wiki_id').unique().notNull(),
  status: text('status').default('pending'), // 'pending', 'processing', 'completed', 'error'
  priority: integer('priority').default(0),
  sourcePersonId: integer('source_person_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  processedAt: integer('processed_at', { mode: 'timestamp' }),
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').default(0),
});

export const locations = sqliteTable('locations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  rawLocation: text('raw_location').unique().notNull(),
  latitude: integer('latitude'), // Store as integer (multiply by 1e6)
  longitude: integer('longitude'),
  normalizedName: text('normalized_name'),
  country: text('country'),
  geocodedAt: integer('geocoded_at', { mode: 'timestamp' }),
});
```

**Database Client (apps/crawler/src/db.ts):**
```typescript
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@funk-tree/db/schema.sqlite';

const sqlite = new Database('./data/funk_tree.db');
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

// Type-safe queries
export async function getNextFromQueue() {
  return db.query.crawlQueue.findFirst({
    where: eq(schema.crawlQueue.status, 'pending'),
    orderBy: [desc(schema.crawlQueue.priority), asc(schema.crawlQueue.createdAt)],
  });
}

export async function savePerson(person: typeof schema.persons.$inferInsert) {
  return db.insert(schema.persons)
    .values(person)
    .onConflictDoUpdate({
      target: schema.persons.wikiId,
      set: { ...person, updatedAt: sql`(unixepoch())` },
    });
}
```

**Browser Client (sql.js-httpvfs):**
```typescript
// apps/web/src/lib/db.ts
import { createDbWorker } from 'sql.js-httpvfs';

const workerUrl = new URL('sql.js-httpvfs/dist/sqlite.worker.js', import.meta.url);
const wasmUrl = new URL('sql.js-httpvfs/dist/sql-wasm.wasm', import.meta.url);

export async function initDb() {
  const worker = await createDbWorker(
    [{ from: 'inline', config: { serverMode: 'full', url: '/funk_tree.db', requestChunkSize: 4096 } }],
    workerUrl.toString(),
    wasmUrl.toString()
  );
  return worker.db;
}
```

---

### Database Option 2: PGLite (PostgreSQL in WASM)

Best for: Full PostgreSQL features, advanced queries, future extensibility (pgvector, PostGIS)

**What is PGLite?**
- Full PostgreSQL compiled to WebAssembly
- Runs in browsers, Node.js, Bun, Deno
- ~2.6MB gzipped bundle
- Single-connection (no concurrent writes)
- Supports PostgreSQL extensions

**SQLite vs PGLite Comparison:**

| Feature | SQLite | PGLite |
|---------|--------|--------|
| **Bundle size** | ~800KB | ~2.6MB |
| **SQL dialect** | SQLite (limited) | Full PostgreSQL |
| **Date handling** | Manual (unix timestamps) | Native DATE/TIMESTAMP |
| **Extensions** | None | pgvector, PostGIS, etc. |
| **Browser persistence** | sql.js-httpvfs (read-only) | IndexedDB, OPFS (read/write) |
| **Concurrent connections** | Multiple readers | Single connection |
| **Maturity** | Very mature | Newer (but production-ready) |

**Installation:**
```bash
bun add drizzle-orm @electric-sql/pglite
bun add -D drizzle-kit
```

**Drizzle Schema (packages/db/src/schema.pglite.ts):**
```typescript
import { pgTable, uuid, text, integer, boolean, timestamp, real } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const persons = pgTable('persons', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  wikiId: text('wiki_id').unique().notNull(),
  name: text('name'),
  firstName: text('first_name'),
  middleName: text('middle_name'),
  lastNameBirth: text('last_name_birth'),
  lastNameCurrent: text('last_name_current'),
  suffix: text('suffix'),
  gender: text('gender'),
  birthDate: text('birth_date'), // Keep as text for partial dates like "1750"
  deathDate: text('death_date'),
  birthLocation: text('birth_location'),
  deathLocation: text('death_location'),
  isLiving: boolean('is_living').default(false),
  generation: integer('generation'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const relationships = pgTable('relationships', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  personId: integer('person_id').notNull().references(() => persons.id),
  relatedPersonId: integer('related_person_id').notNull().references(() => persons.id),
  relationshipType: text('relationship_type').notNull(),
});

export const crawlQueue = pgTable('crawl_queue', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  wikiId: text('wiki_id').unique().notNull(),
  status: text('status').default('pending'),
  priority: integer('priority').default(0),
  sourcePersonId: integer('source_person_id'),
  createdAt: timestamp('created_at').defaultNow(),
  processedAt: timestamp('processed_at'),
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').default(0),
});

export const locations = pgTable('locations', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  rawLocation: text('raw_location').unique().notNull(),
  latitude: real('latitude'),
  longitude: real('longitude'),
  normalizedName: text('normalized_name'),
  country: text('country'),
  geocodedAt: timestamp('geocoded_at'),
});
```

**Database Client - Node/Bun (apps/crawler/src/db.ts):**
```typescript
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '@funk-tree/db/schema.pglite';

// File-based persistence (Node.js/Bun)
const client = new PGlite('./data/funk_tree');
export const db = drizzle(client, { schema });

// Run migrations
import { migrate } from 'drizzle-orm/pglite/migrator';
await migrate(db, { migrationsFolder: './drizzle' });
```

**Database Client - Browser (apps/web/src/lib/db.ts):**
```typescript
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '@funk-tree/db/schema.pglite';

// IndexedDB persistence (Browser)
const client = new PGlite('idb://funk-tree', {
  relaxedDurability: true, // Async flush for better performance
});

export const db = drizzle(client, { schema });

// For read-only static hosting, load from fetch
export async function loadStaticDb(url: string) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  // PGLite can load from a tarball of the data directory
  const client = new PGlite({ loadDataDir: buffer });
  return drizzle(client, { schema });
}
```

**Vite Configuration for PGLite:**
```typescript
// apps/web/vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    exclude: ['@electric-sql/pglite'],
  },
  build: {
    target: 'esnext', // Required for top-level await
  },
});
```

---

### Shared Types (works with both databases)

**packages/types/src/index.ts:**
```typescript
// Infer types from either schema
import type { persons, relationships, crawlQueue, locations } from '@funk-tree/db/schema';

export type Person = typeof persons.$inferSelect;
export type NewPerson = typeof persons.$inferInsert;

export type Relationship = typeof relationships.$inferSelect;
export type NewRelationship = typeof relationships.$inferInsert;

export type QueueItem = typeof crawlQueue.$inferSelect;
export type NewQueueItem = typeof crawlQueue.$inferInsert;

export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;

// Domain types (database-agnostic)
export type RelationshipType = 'parent' | 'child' | 'spouse';
export type QueueStatus = 'pending' | 'processing' | 'completed' | 'error';
export type Gender = 'Male' | 'Female' | 'Unknown';
```

---

### Which Database to Choose?

| Use Case | Recommendation |
|----------|----------------|
| **Simple genealogy app** | SQLite - smaller, simpler |
| **Need advanced date queries** | PGLite - native PostgreSQL dates |
| **Future vector search (AI)** | PGLite - pgvector extension |
| **Geographic queries** | PGLite - PostGIS potential |
| **Maximum browser compatibility** | SQLite - sql.js more mature |
| **Read-only static hosting** | SQLite - sql.js-httpvfs |
| **Read/write in browser** | PGLite - IndexedDB persistence |

**For the Funk Tree project**: Start with **SQLite** for the crawler (simpler, faster), and evaluate **PGLite** for the web app if you need read/write capabilities or advanced PostgreSQL features.

---

### Updated Monorepo Structure (with Drizzle)

```
funk-tree/
├── apps/
│   ├── crawler/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── wikitree-api.ts
│   │   │   └── db.ts              # Uses better-sqlite3 or PGLite
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   │
│   └── web/
│       ├── src/
│       │   ├── App.tsx
│       │   ├── components/
│       │   └── lib/
│       │       └── db.ts          # Browser db client
│       ├── vite.config.ts
│       └── package.json
│
├── packages/
│   ├── db/                        # Shared Drizzle schema
│   │   ├── src/
│   │   │   ├── schema.sqlite.ts   # SQLite schema
│   │   │   ├── schema.pglite.ts   # PGLite schema
│   │   │   └── index.ts           # Re-exports active schema
│   │   ├── drizzle/               # Generated migrations
│   │   └── package.json
│   │
│   ├── types/                     # Shared TypeScript types
│   │   └── src/
│   │       └── index.ts
│   │
│   └── config/
│       └── tsconfig.base.json
│
├── data/
│   ├── funk_tree.db               # SQLite file
│   └── funk_tree/                 # PGLite data directory
│
├── package.json
├── turbo.json
└── bun.lockb
```

---

## Migration Path Recommendation

### Phase 1: SQLite Migration (Do Now)
1. Create `migrate_to_sqlite.py` to import existing data
2. Update `wikitree_crawler.py` to use SQLite
3. Continue crawling with SQLite backend

### Phase 2: Web Visualization (Next)
- **If staying Python**: Create simple HTML/JS viewer using `sql.js-httpvfs`
- **If going TypeScript**: Set up monorepo, port crawler

### Phase 3: Full Web App (Later)
- Interactive family tree visualization
- Migration map with timeline
- Search and filtering
- Host on Cloudflare/Vercel

---

## Migration Map Feature Notes

For the birth location migration visualization, you'll need:

1. **Geocoding**: Convert location strings to lat/long
   - Use OpenStreetMap Nominatim (free, rate-limited)
   - Cache results in a `locations` table

2. **Data structure**:
   ```sql
   CREATE TABLE locations (
       id INTEGER PRIMARY KEY,
       raw_location TEXT UNIQUE,
       latitude REAL,
       longitude REAL,
       normalized_name TEXT,
       country TEXT,
       geocoded_at TIMESTAMP
   );
   ```

3. **Visualization libraries**:
   - **Leaflet.js** - lightweight mapping
   - **D3.js** - custom animations
   - **deck.gl** - high-performance for many points

4. **Animation approach**:
   - Group births by decade
   - Animate points appearing over time
   - Draw lines showing parent→child location changes

---

## Summary: Which Route?

| Factor | Python + SQLite | TS Monorepo |
|--------|-----------------|-------------|
| **Time to migrate** | 1-2 days | 3-5 days |
| **Crawler changes** | Minimal | Full rewrite |
| **Web app quality** | Basic | Production-grade |
| **Type safety** | None | Full |
| **Long-term maintainability** | Moderate | High |
| **Learning curve** | Low | Medium |

### My Recommendation

**Start with Python + SQLite** (Option A) to:
1. Immediately solve the JSON scaling issue
2. Keep the crawler running while you build the web app
3. Learn the data structure before committing to TypeScript

**Then migrate to TypeScript monorepo** (Option B) when:
1. You're ready to build the full web app
2. You want shared types and better tooling
3. The Python crawler has done its job

This gives you the best of both worlds: immediate progress on data collection, with a clear path to a modern web application.
