# Plan: Convert Raw SQL to Type-Safe Drizzle ORM

## Overview

This plan audits all `sql` template literal usage in the crawler app and provides type-safe Drizzle ORM alternatives.

## Files Affected

- `apps/crawler/src/crawler.ts`
- `apps/crawler/src/migrate.ts`

---

## Audit: Raw SQL Usage

### crawler.ts

| Line | Current Code | Purpose |
|------|--------------|---------|
| 96 | `updatedAt: sql\`NOW()\`` | Set timestamp on upsert |
| 143 | `orderBy(sql\`${crawlQueue.priority} DESC, ${crawlQueue.createdAt} ASC\`)` | Multi-column ordering |
| 158 | `processedAt: sql\`NOW()\`` | Set timestamp on update |
| 161 | `retryCount: sql\`${crawlQueue.retryCount} + 1\`` | Increment counter |
| 173 | `sql<number>\`count(*)\`` | Count persons |
| 177 | `sql<number>\`count(*)\`` | Count pending queue |
| 181 | `sql<number>\`count(*)\`` | Count completed queue |
| 186 | `sql<number>\`count(*)\`` | Count errors |

### migrate.ts

| Lines | Current Code | Purpose |
|-------|--------------|---------|
| 78-121 | `db.execute(sql\`INSERT INTO persons...ON CONFLICT DO UPDATE\`)` | Upsert person from legacy data |
| 145-149 | `db.execute(sql\`INSERT INTO crawl_queue...ON CONFLICT DO NOTHING\`)` | Insert pending queue item |
| 161-167 | `db.execute(sql\`INSERT INTO crawl_queue...ON CONFLICT DO UPDATE\`)` | Upsert completed queue item |

---

## Drizzle ORM Alternatives

### 1. Timestamps (`NOW()`)

**Current:**
```typescript
updatedAt: sql`NOW()`
```

**Type-safe alternative:**
```typescript
import { sql } from 'drizzle-orm';

// Option A: Use JavaScript Date (Drizzle handles conversion)
updatedAt: new Date()

// Option B: If you need database-side NOW(), this is acceptable
// The sql template is type-safe when used with Drizzle's sql helper
updatedAt: sql`now()`
```

**Recommendation:** Use `new Date()` for consistency and full type safety.

---

### 2. Multi-Column Ordering

**Current:**
```typescript
.orderBy(sql`${crawlQueue.priority} DESC, ${crawlQueue.createdAt} ASC`)
```

**Type-safe alternative:**
```typescript
import { desc, asc } from 'drizzle-orm';

.orderBy(desc(crawlQueue.priority), asc(crawlQueue.createdAt))
```

---

### 3. Incrementing a Column

**Current:**
```typescript
retryCount: sql`${crawlQueue.retryCount} + 1`
```

**Type-safe alternative:**
```typescript
import { sql } from 'drizzle-orm';

// Drizzle's sql helper with column reference is type-safe
retryCount: sql`${crawlQueue.retryCount} + 1`
```

**Note:** This usage is already type-safe because it references the schema column. No change needed, but could wrap in a helper for clarity.

---

### 4. Count Aggregation

**Current:**
```typescript
const [personsCount] = await this.db
  .select({ count: sql<number>`count(*)` })
  .from(persons);
```

**Type-safe alternative:**
```typescript
import { count } from 'drizzle-orm';

const [personsCount] = await this.db
  .select({ count: count() })
  .from(persons);
```

---

### 5. Raw INSERT with ON CONFLICT (migrate.ts)

**Current (persons upsert):**
```typescript
await db.execute(sql`
  INSERT INTO persons (wiki_id, wiki_numeric_id, name, ...)
  VALUES (${wikiId}, ${person.id || null}, ...)
  ON CONFLICT (wiki_id) DO UPDATE SET ...
`);
```

**Type-safe alternative:**
```typescript
import { persons, type NewPerson } from '@funk-tree/db/schema';

const personData: NewPerson = {
  wikiId,
  wikiNumericId: person.id ?? null,
  name: person.name ?? null,
  firstName: person.first_name ?? null,
  middleName: person.middle_name ?? null,
  lastNameBirth: person.last_name_birth ?? null,
  lastNameCurrent: person.last_name_current ?? null,
  suffix: person.suffix ?? null,
  gender: person.gender ?? null,
  birthDate: person.birth_date ?? null,
  deathDate: person.death_date ?? null,
  birthLocation: person.birth_location ?? null,
  deathLocation: person.death_location ?? null,
  isLiving: person.is_living === 1,
  generation: person.generation ?? null,
  fatherWikiId: person.father_id ? String(person.father_id) : null,
  motherWikiId: person.mother_id ? String(person.mother_id) : null,
};

await db
  .insert(persons)
  .values(personData)
  .onConflictDoUpdate({
    target: persons.wikiId,
    set: {
      ...personData,
      updatedAt: new Date(),
    },
  });
```

**Current (queue insert with DO NOTHING):**
```typescript
await db.execute(sql`
  INSERT INTO crawl_queue (wiki_id, status)
  VALUES (${wikiId}, 'pending')
  ON CONFLICT (wiki_id) DO NOTHING
`);
```

**Type-safe alternative:**
```typescript
import { crawlQueue } from '@funk-tree/db/schema';

await db
  .insert(crawlQueue)
  .values({ wikiId, status: 'pending' })
  .onConflictDoNothing();
```

**Current (queue upsert for completed):**
```typescript
await db.execute(sql`
  INSERT INTO crawl_queue (wiki_id, status, processed_at)
  VALUES (${wikiId}, 'completed', NOW())
  ON CONFLICT (wiki_id) DO UPDATE SET
    status = 'completed',
    processed_at = NOW()
`);
```

**Type-safe alternative:**
```typescript
await db
  .insert(crawlQueue)
  .values({
    wikiId,
    status: 'completed',
    processedAt: new Date()
  })
  .onConflictDoUpdate({
    target: crawlQueue.wikiId,
    set: {
      status: 'completed',
      processedAt: new Date(),
    },
  });
```

---

## Implementation Checklist

### crawler.ts

- [ ] Import `count`, `desc`, `asc` from `drizzle-orm`
- [ ] Remove `sql` import (or keep if needed for increment)
- [ ] Line 96: Change `sql\`NOW()\`` to `new Date()`
- [ ] Line 143: Change to `orderBy(desc(crawlQueue.priority), asc(crawlQueue.createdAt))`
- [ ] Line 158: Change `sql\`NOW()\`` to `new Date()`
- [ ] Line 161: Keep as-is (already type-safe) or extract to helper
- [ ] Lines 173, 177, 181, 186: Change `sql<number>\`count(*)\`` to `count()`

### migrate.ts

- [ ] Import `persons`, `crawlQueue`, `NewPerson` from `@funk-tree/db/schema`
- [ ] Remove `sql` import
- [ ] Lines 78-121: Replace raw SQL with Drizzle `.insert().onConflictDoUpdate()`
- [ ] Lines 145-149: Replace raw SQL with Drizzle `.insert().onConflictDoNothing()`
- [ ] Lines 161-167: Replace raw SQL with Drizzle `.insert().onConflictDoUpdate()`

---

## Additional Improvements

### 1. Add Type-Safe Status Enum

The `status` field uses string literals. Consider adding a type:

```typescript
// In schema/genealogy.ts
export const queueStatusEnum = ['pending', 'processing', 'completed', 'error'] as const;
export type QueueStatus = typeof queueStatusEnum[number];
```

### 2. Helper Function for Upserts

Create a reusable helper in the db package:

```typescript
// In packages/db/src/helpers.ts
export async function upsertPerson(db: PGLiteDatabase, data: NewPerson) {
  return db
    .insert(persons)
    .values(data)
    .onConflictDoUpdate({
      target: persons.wikiId,
      set: { ...data, updatedAt: new Date() },
    });
}
```

### 3. Batch Inserts for Migration

The migrate.ts file loops through records one-by-one. Consider batching:

```typescript
// Insert in batches of 100
const BATCH_SIZE = 100;
const entries = Object.entries(progressData.persons);

for (let i = 0; i < entries.length; i += BATCH_SIZE) {
  const batch = entries.slice(i, i + BATCH_SIZE);
  const values = batch.map(([wikiId, person]) => ({
    wikiId,
    // ... map other fields
  }));

  await db
    .insert(persons)
    .values(values)
    .onConflictDoUpdate({
      target: persons.wikiId,
      set: { updatedAt: new Date() },
    });
}
```

---

## Summary

| Change | Files | Complexity |
|--------|-------|------------|
| `NOW()` → `new Date()` | crawler.ts | Low |
| Raw orderBy → `desc()`/`asc()` | crawler.ts | Low |
| `sql\`count(*)\`` → `count()` | crawler.ts | Low |
| Raw INSERT → Drizzle insert | migrate.ts | Medium |
| Add batch inserts | migrate.ts | Optional |

**Estimated effort:** 30-45 minutes for core changes, additional time for optional improvements.
