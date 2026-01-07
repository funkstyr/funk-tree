/**
 * Browser-only PGLite database loader.
 *
 * This module is designed to run in the browser and loads a pre-built
 * database tarball. It does NOT include migrations or Node.js dependencies.
 *
 * Usage:
 *   import { loadBrowserDb, createEmptyBrowserDb } from "@funk-tree/db/browser";
 *
 *   // Load pre-built data from tarball URL
 *   const db = await loadBrowserDb("/data/funk-tree.tar.gz");
 *
 *   // Or create empty IndexedDB database
 *   const db = await createEmptyBrowserDb("my-db");
 */

import { PGlite, type PGliteOptions } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import * as schema from "./schema";

export type BrowserDatabase = ReturnType<typeof drizzle<typeof schema>>;

const DB_VERSION_KEY = "funk-tree-db-version";
const DEFAULT_DB_NAME = "funk-tree";

/**
 * Load a PGLite database from a pre-built tarball in the browser.
 *
 * This function:
 * 1. Checks if the database is already cached in IndexedDB
 * 2. If not cached (or version changed), fetches the tarball and loads it
 * 3. Caches the result in IndexedDB for future page loads
 *
 * @param tarballUrl - URL to the gzipped tarball (e.g., "/data/funk-tree.tar.gz")
 * @param options - Configuration options
 * @returns Drizzle database instance
 *
 * @example
 * const db = await loadBrowserDb("/data/funk-tree.tar.gz");
 * const persons = await db.select().from(schema.persons).limit(10);
 */
export async function loadBrowserDb(
  tarballUrl: string,
  options: {
    dbName?: string;
    forceReload?: boolean;
    onProgress?: (status: "checking" | "fetching" | "loading" | "ready") => void;
  } = {},
): Promise<BrowserDatabase> {
  const { dbName = DEFAULT_DB_NAME, forceReload = false, onProgress } = options;
  const idbPath = `idb://${dbName}`;

  onProgress?.("checking");

  // Check if we have a cached version and if it matches
  const cachedVersion = localStorage.getItem(DB_VERSION_KEY);
  const needsReload = forceReload || cachedVersion !== tarballUrl;

  if (!needsReload) {
    // Try to open existing IndexedDB database
    try {
      const client = new PGlite(idbPath, { relaxedDurability: true });
      await client.waitReady;

      // Quick check if database has data
      const result = await client.query<{ count: string }>("SELECT COUNT(*) as count FROM persons");
      const count = parseInt(result.rows[0]?.count || "0", 10);

      if (count > 0) {
        onProgress?.("ready");
        return drizzle(client, { schema });
      }
    } catch {
      // Database doesn't exist or is corrupted, proceed with loading
    }
  }

  // Fetch the tarball
  onProgress?.("fetching");
  const response = await fetch(tarballUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch database: ${response.status} ${response.statusText}`);
  }

  const tarball = await response.blob();

  // Load into PGLite with IndexedDB persistence
  onProgress?.("loading");

  const pgliteOptions: PGliteOptions = {
    loadDataDir: tarball,
    relaxedDurability: true,
  };

  const client = new PGlite(idbPath, pgliteOptions);
  await client.waitReady;

  // Store version for cache invalidation
  localStorage.setItem(DB_VERSION_KEY, tarballUrl);

  onProgress?.("ready");
  return drizzle(client, { schema });
}

/**
 * Create an empty browser database backed by IndexedDB.
 * Useful for testing or when you want to build the database from scratch.
 *
 * @param dbName - Name for the IndexedDB database
 * @returns Drizzle database instance
 */
export async function createEmptyBrowserDb(
  dbName: string = DEFAULT_DB_NAME,
): Promise<BrowserDatabase> {
  const client = new PGlite(`idb://${dbName}`, {
    relaxedDurability: true,
  });
  await client.waitReady;
  return drizzle(client, { schema });
}

/**
 * Clear the cached database from IndexedDB.
 * Call this to force a fresh download on next load.
 *
 * @param dbName - Name of the IndexedDB database to clear
 */
export async function clearBrowserDb(dbName: string = DEFAULT_DB_NAME): Promise<void> {
  localStorage.removeItem(DB_VERSION_KEY);

  // Delete the IndexedDB database
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(`/pglite/${dbName}`);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Re-export schema for convenience
export { schema };
