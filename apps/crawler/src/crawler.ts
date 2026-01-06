import { eq, sql, and, isNull } from "drizzle-orm";
import type { PGLiteDatabase } from "@funk-tree/db/pglite";
import {
  persons,
  crawlQueue,
  relationships,
  crawlMetadata,
  type NewPerson,
  type NewQueueItem,
} from "@funk-tree/db/schema";
import { wikitreeApi, type WikiTreeProfile } from "./wikitree-api";

const SAVE_INTERVAL = 25;

export class WikiTreeCrawler {
  private db: PGLiteDatabase;
  private requestCount = 0;
  private errors: Array<{ wikiId: string; error: string }> = [];

  constructor(db: PGLiteDatabase) {
    this.db = db;
  }

  async initialize(): Promise<void> {
    // Create tables if they don't exist (PGLite doesn't have migrations yet)
    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS persons (
        id SERIAL PRIMARY KEY,
        wiki_id TEXT UNIQUE NOT NULL,
        wiki_numeric_id INTEGER,
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
        is_living BOOLEAN DEFAULT FALSE,
        generation INTEGER,
        father_wiki_id TEXT,
        mother_wiki_id TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS relationships (
        id SERIAL PRIMARY KEY,
        person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
        related_person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
        relationship_type TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(person_id, related_person_id, relationship_type)
      )
    `);

    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS crawl_queue (
        id SERIAL PRIMARY KEY,
        wiki_id TEXT UNIQUE NOT NULL,
        status TEXT DEFAULT 'pending',
        priority INTEGER DEFAULT 0,
        source_person_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        processed_at TIMESTAMP,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0
      )
    `);

    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS crawl_metadata (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        raw_location TEXT UNIQUE NOT NULL,
        latitude REAL,
        longitude REAL,
        normalized_name TEXT,
        country TEXT,
        state TEXT,
        city TEXT,
        geocoded_at TIMESTAMP
      )
    `);

    // Create indexes
    await this.db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_persons_wiki_id ON persons(wiki_id)
    `);
    await this.db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_queue_status ON crawl_queue(status)
    `);

    console.log("Database initialized");
  }

  private buildFullName(profile: WikiTreeProfile): string {
    const parts: string[] = [];
    if (profile.FirstName) parts.push(profile.FirstName);
    if (profile.MiddleName) parts.push(profile.MiddleName);
    if (profile.LastNameAtBirth) parts.push(profile.LastNameAtBirth);
    else if (profile.LastNameCurrent) parts.push(profile.LastNameCurrent);
    if (profile.Suffix) parts.push(profile.Suffix);
    return parts.length > 0 ? parts.join(" ") : profile.Name || "Unknown";
  }

  private extractIds(
    items: Record<string, unknown> | unknown[] | undefined
  ): string[] {
    if (!items) return [];

    if (Array.isArray(items)) {
      return items
        .map((item) => {
          if (typeof item === "object" && item !== null) {
            return (item as Record<string, unknown>).Name as string;
          }
          return null;
        })
        .filter((id): id is string => id !== null);
    }

    if (typeof items === "object") {
      return Object.keys(items);
    }

    return [];
  }

  private isValidId(id: unknown): boolean {
    if (!id) return false;
    if (typeof id === "number" && id === 0) return false;
    if (typeof id === "string" && (id === "0" || id === "")) return false;
    return true;
  }

  async processProfile(profile: WikiTreeProfile): Promise<void> {
    const wikiId = profile.Name;
    if (!wikiId) return;

    // Upsert the person
    const personData: NewPerson = {
      wikiId,
      wikiNumericId: profile.Id,
      name: this.buildFullName(profile),
      firstName: profile.FirstName || null,
      middleName: profile.MiddleName || null,
      lastNameBirth: profile.LastNameAtBirth || null,
      lastNameCurrent: profile.LastNameCurrent || null,
      suffix: profile.Suffix || null,
      gender: profile.Gender || null,
      birthDate: profile.BirthDate || null,
      deathDate: profile.DeathDate || null,
      birthLocation: profile.BirthLocation || null,
      deathLocation: profile.DeathLocation || null,
      isLiving: profile.IsLiving === 1,
      fatherWikiId: this.isValidId(profile.Father)
        ? String(profile.Father)
        : null,
      motherWikiId: this.isValidId(profile.Mother)
        ? String(profile.Mother)
        : null,
    };

    await this.db
      .insert(persons)
      .values(personData)
      .onConflictDoUpdate({
        target: persons.wikiId,
        set: {
          ...personData,
          updatedAt: sql`NOW()`,
        },
      });

    // Queue relatives
    await this.queueRelatives(profile);
  }

  private async queueRelatives(profile: WikiTreeProfile): Promise<void> {
    const toQueue: string[] = [];

    // Father
    if (this.isValidId(profile.Father)) {
      toQueue.push(String(profile.Father));
    }

    // Mother
    if (this.isValidId(profile.Mother)) {
      toQueue.push(String(profile.Mother));
    }

    // Spouses
    const spouseIds = this.extractIds(profile.Spouses);
    toQueue.push(...spouseIds.filter((id) => this.isValidId(id)));

    // Children
    const childIds = this.extractIds(profile.Children);
    toQueue.push(...childIds.filter((id) => this.isValidId(id)));

    // Add to queue (ignore duplicates)
    for (const wikiId of toQueue) {
      try {
        await this.db
          .insert(crawlQueue)
          .values({ wikiId, status: "pending" })
          .onConflictDoNothing();
      } catch {
        // Ignore duplicate key errors
      }
    }
  }

  async getNextFromQueue(): Promise<string | null> {
    const result = await this.db
      .select({ wikiId: crawlQueue.wikiId })
      .from(crawlQueue)
      .where(eq(crawlQueue.status, "pending"))
      .orderBy(sql`${crawlQueue.priority} DESC, ${crawlQueue.createdAt} ASC`)
      .limit(1);

    return result[0]?.wikiId || null;
  }

  async markQueueItem(
    wikiId: string,
    status: "processing" | "completed" | "error",
    errorMessage?: string
  ): Promise<void> {
    await this.db
      .update(crawlQueue)
      .set({
        status,
        processedAt: sql`NOW()`,
        errorMessage: errorMessage || null,
        retryCount:
          status === "error" ? sql`${crawlQueue.retryCount} + 1` : undefined,
      })
      .where(eq(crawlQueue.wikiId, wikiId));
  }

  async getStats(): Promise<{
    totalPersons: number;
    pendingQueue: number;
    completedQueue: number;
    errors: number;
  }> {
    const [personsCount] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(persons);

    const [pendingCount] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(crawlQueue)
      .where(eq(crawlQueue.status, "pending"));

    const [completedCount] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(crawlQueue)
      .where(eq(crawlQueue.status, "completed"));

    const [errorCount] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(crawlQueue)
      .where(eq(crawlQueue.status, "error"));

    return {
      totalPersons: Number(personsCount?.count || 0),
      pendingQueue: Number(pendingCount?.count || 0),
      completedQueue: Number(completedCount?.count || 0),
      errors: Number(errorCount?.count || 0),
    };
  }

  async crawl(startId: string): Promise<void> {
    console.log(`Starting crawl from ${startId}`);
    console.log("No max limit - will crawl until queue is empty");
    console.log();

    // Check if starting profile is already in DB
    const existing = await this.db
      .select()
      .from(persons)
      .where(eq(persons.wikiId, startId))
      .limit(1);

    if (existing.length === 0) {
      console.log(`Fetching root profile: ${startId}`);
      const profile = await wikitreeApi.getProfile(startId);
      if (profile) {
        await this.processProfile(profile);
        this.requestCount++;
      }
    }

    // Fetch descendants
    console.log("\nFetching descendants (depth=2)...");
    const descendants = await wikitreeApi.getDescendants(startId, 2);
    this.requestCount++;
    for (const desc of descendants) {
      await this.processProfile(desc);
    }

    // Main crawl loop
    const stats = await this.getStats();
    console.log(`\nCrawling queue (${stats.pendingQueue} profiles)...`);

    let wikiId: string | null;
    while ((wikiId = await this.getNextFromQueue()) !== null) {
      await this.markQueueItem(wikiId, "processing");

      const currentStats = await this.getStats();
      console.log(
        `  [Request #${this.requestCount}] Fetching: ${wikiId} (Queue: ${currentStats.pendingQueue})`
      );

      try {
        const profile = await wikitreeApi.getProfile(wikiId);
        this.requestCount++;

        if (profile) {
          await this.processProfile(profile);
          await this.markQueueItem(wikiId, "completed");
        } else {
          await this.markQueueItem(wikiId, "error", "Profile not found");
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.errors.push({ wikiId, error: errorMsg });
        await this.markQueueItem(wikiId, "error", errorMsg);
      }

      // Periodic status
      if (this.requestCount % SAVE_INTERVAL === 0) {
        const s = await this.getStats();
        console.log(
          `  Progress: ${s.totalPersons} profiles, ${s.pendingQueue} in queue`
        );
      }
    }

    // Final stats
    const finalStats = await this.getStats();
    console.log("\nCrawl complete!");
    console.log(`  Total profiles: ${finalStats.totalPersons}`);
    console.log(`  API requests: ${this.requestCount}`);
    console.log(`  Errors: ${finalStats.errors}`);
  }
}
