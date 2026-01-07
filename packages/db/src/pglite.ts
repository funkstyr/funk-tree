import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "path";

import * as schema from "./schema";

export type PGLiteDatabase = ReturnType<typeof createPGLiteDb>;

/**
 * Create a PGLite database instance for local development or browser use.
 *
 * @param dataDir - Path to the data directory for persistence, or "memory://" for in-memory
 * @returns Drizzle database instance with PGLite
 *
 * @example
 * // File-based persistence (Node.js/Bun)
 * const db = createPGLiteDb("./data/funk_tree");
 *
 * @example
 * // In-memory (testing)
 * const db = createPGLiteDb("memory://");
 *
 * @example
 * // IndexedDB persistence (Browser)
 * const db = createPGLiteDb("idb://funk-tree");
 */
export function createPGLiteDb(dataDir: string = "./data/pglite") {
  const client = new PGlite(dataDir);
  return drizzle(client, { schema });
}

/**
 * Create a PGLite instance with relaxed durability for better browser performance.
 * Writes are flushed asynchronously to IndexedDB.
 */
export function createBrowserDb(dbName: string = "funk-tree") {
  const client = new PGlite(`idb://${dbName}`, {
    relaxedDurability: true,
  });
  return drizzle(client, { schema });
}

export { schema };

/**
 * Run Drizzle migrations on a PGLite database.
 * This syncs the database schema with the Drizzle schema definitions.
 *
 * @param db - The Drizzle PGLite database instance
 *
 * @example
 * const db = createPGLiteDb("./data/pglite");
 * await migratePGLiteDb(db);
 */
export async function migratePGLiteDb(db: PGLiteDatabase): Promise<void> {
  const migrationsFolder = path.join(
    import.meta.dirname,
    "migrations"
  );
  await migrate(db, { migrationsFolder });
}
