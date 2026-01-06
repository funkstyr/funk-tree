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

---

### Starting Point: Better-T-Stack Template

Instead of manually scaffolding the monorepo, use the **better-t-stack** CLI to generate a fully-configured, end-to-end type-safe project:

```bash
bun create better-t-stack@latest funk-tree \
  --frontend tanstack-start \
  --backend hono \
  --runtime bun \
  --api orpc \
  --auth better-auth \
  --payments none \
  --database postgres \
  --orm drizzle \
  --db-setup docker \
  --package-manager bun \
  --git \
  --web-deploy none \
  --server-deploy none \
  --install \
  --addons fumadocs oxlint turborepo \
  --examples ai todo
```

### What This Stack Provides

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Frontend** | TanStack Start | Full-stack React framework with SSR, streaming, server functions |
| **Backend** | Hono | Lightweight, fast web framework for API routes |
| **Runtime** | Bun | Fast JavaScript runtime and package manager |
| **API Layer** | oRPC | Type-safe RPC with OpenAPI compliance |
| **Auth** | Better Auth | Framework-agnostic auth (social login, 2FA, organizations) |
| **Database** | PostgreSQL + Drizzle | Type-safe ORM with migrations |
| **Docs** | Fumadocs | Beautiful documentation site (for the project) |
| **Linting** | oxlint | Fast Rust-based linter |
| **Monorepo** | Turborepo | Build orchestration and caching |

### Stack Component Details

**TanStack Start** - Full-stack React framework:
- Server-side rendering + streaming
- Type-safe server functions (RPC)
- File-based routing via TanStack Router
- Powered by Vite for fast dev experience

**oRPC** - Type-safe API layer:
- End-to-end type safety (inputs, outputs, errors)
- First-class OpenAPI support
- Works with Zod/Valibot for validation
- Native support for Date, File, Blob, BigInt, streaming

**Better Auth** - Authentication:
- Email/password + social providers (GitHub, Google, etc.)
- Built-in rate limiting
- Two-factor authentication
- Multi-tenancy and organizations
- Works with any database

**Fumadocs** - Documentation:
- MDX-based documentation
- Syntax highlighting (Shiki)
- Search integration (Orama, Algolia)
- Great for documenting the genealogy API

---

### Generated Monorepo Structure

```
funk-tree/
├── apps/
│   ├── web/                      # TanStack Start frontend
│   │   ├── app/
│   │   │   ├── routes/           # File-based routing
│   │   │   │   ├── __root.tsx
│   │   │   │   ├── index.tsx
│   │   │   │   └── api/          # API routes
│   │   │   ├── components/
│   │   │   │   ├── FamilyTree.tsx      # Add: Tree visualization
│   │   │   │   └── MigrationMap.tsx    # Add: Map visualization
│   │   │   └── lib/
│   │   │       └── db.ts         # PGLite browser client
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   ├── server/                   # Hono backend
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── router/           # oRPC routes
│   │   │   │   ├── index.ts
│   │   │   │   └── person.ts     # Add: Person CRUD
│   │   │   └── lib/
│   │   │       └── db.ts         # Drizzle client
│   │   └── package.json
│   │
│   ├── docs/                     # Fumadocs site (addon)
│   │   ├── content/
│   │   │   └── docs/
│   │   └── package.json
│   │
│   └── crawler/                  # Add: WikiTree crawler CLI
│       ├── src/
│       │   ├── index.ts
│       │   ├── wikitree-api.ts
│       │   └── crawl.ts
│       └── package.json
│
├── packages/
│   ├── db/                       # Drizzle schema (shared)
│   │   ├── src/
│   │   │   ├── schema.ts         # Person, Relationship, Queue tables
│   │   │   ├── index.ts
│   │   │   └── migrations/
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   │
│   ├── auth/                     # Better Auth config
│   │   ├── src/
│   │   │   ├── auth.ts
│   │   │   └── client.ts
│   │   └── package.json
│   │
│   └── shared/                   # Shared types and utilities
│       ├── src/
│       │   ├── types.ts          # Person, Relationship types
│       │   └── utils.ts
│       └── package.json
│
├── data/                         # Add: Local data directory
│   └── funk_tree/                # PGLite data directory
│
├── docker-compose.yml            # PostgreSQL for development
├── package.json
├── turbo.json
└── bun.lockb
```

---

### Post-Scaffold Setup Steps

After running the better-t-stack command:

```bash
cd funk-tree

# 1. Add the crawler app
mkdir -p apps/crawler/src
cat > apps/crawler/package.json << 'EOF'
{
  "name": "@funk-tree/crawler",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "bun run src/index.ts",
    "crawl": "bun run src/index.ts"
  },
  "dependencies": {
    "@funk-tree/db": "workspace:*",
    "@electric-sql/pglite": "latest"
  }
}
EOF

# 2. Update packages/db/src/schema.ts with genealogy tables
# (See Drizzle schema in "Database Options" section below)

# 3. Add PGLite for local file-based development
bun add -D @electric-sql/pglite --filter @funk-tree/crawler
bun add -D @electric-sql/pglite --filter @funk-tree/web

# 4. Start the dev environment
bun run dev
```

---

### Development vs Production Database

| Environment | Database | Notes |
|-------------|----------|-------|
| **Development** | PGLite (file-based) | No Docker needed, instant setup |
| **Production** | PostgreSQL (Docker/cloud) | Full Postgres features |
| **Browser** | PGLite (IndexedDB) | Client-side persistence |

The beauty of Drizzle + PostgreSQL dialect: same schema works with both PGLite and full PostgreSQL.

```typescript
// packages/db/src/client.ts
import { drizzle } from 'drizzle-orm/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { PGlite } from '@electric-sql/pglite';
import * as schema from './schema';

export function createDb(mode: 'local' | 'docker') {
  if (mode === 'local') {
    // File-based PGLite for development
    const client = new PGlite('./data/funk_tree');
    return drizzle(client, { schema });
  } else {
    // Docker PostgreSQL for production-like environment
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    return drizzlePg(pool, { schema });
  }
}
```

---

### oRPC API Routes for Genealogy

**apps/server/src/router/person.ts:**
```typescript
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { db } from '../lib/db';
import { persons, relationships } from '@funk-tree/db/schema';
import { eq, like, and } from 'drizzle-orm';

export const personRouter = router({
  // Get person by WikiTree ID
  getByWikiId: publicProcedure
    .input(z.object({ wikiId: z.string() }))
    .query(async ({ input }) => {
      return db.query.persons.findFirst({
        where: eq(persons.wikiId, input.wikiId),
      });
    }),

  // Search persons by name
  search: publicProcedure
    .input(z.object({
      query: z.string(),
      limit: z.number().default(50)
    }))
    .query(async ({ input }) => {
      return db.query.persons.findMany({
        where: like(persons.name, `%${input.query}%`),
        limit: input.limit,
      });
    }),

  // Get ancestors
  getAncestors: publicProcedure
    .input(z.object({ personId: z.number(), depth: z.number().default(5) }))
    .query(async ({ input }) => {
      // Recursive CTE for ancestor tree
      // Implementation depends on your traversal needs
    }),

  // Get all persons with birth locations (for map)
  getForMap: publicProcedure
    .input(z.object({
      startYear: z.number().optional(),
      endYear: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return db.query.persons.findMany({
        where: and(
          // Filter by birth year range if provided
        ),
        columns: {
          id: true,
          name: true,
          birthDate: true,
          birthLocation: true,
        },
      });
    }),
});
```

---

### Turborepo Task Configuration

**turbo.json** (enhanced for crawler):
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "dev": {
      "cache": false,
      "persistent": true
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".output/**"]
    },
    "crawl": {
      "cache": false,
      "dependsOn": ["@funk-tree/db#build"]
    },
    "db:migrate": {
      "cache": false
    },
    "db:studio": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "outputs": []
    }
  }
}
```

Run commands:
```bash
# Start all dev servers
turbo dev

# Run crawler
turbo crawl

# Open Drizzle Studio
turbo db:studio

# Build everything
turbo build
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
