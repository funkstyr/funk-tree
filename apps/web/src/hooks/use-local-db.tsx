/**
 * React context and hook for browser-side PGLite database.
 *
 * This provides access to a local SQLite-like database running entirely
 * in the browser via PGLite (WebAssembly PostgreSQL).
 */

import type { BrowserDatabase } from "@funk-tree/db/browser";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type LoadingStatus = "idle" | "checking" | "fetching" | "loading" | "ready" | "error";

interface LocalDbContextValue {
  db: BrowserDatabase | null;
  status: LoadingStatus;
  error: Error | null;
  reload: () => Promise<void>;
}

const LocalDbContext = createContext<LocalDbContextValue | null>(null);

interface LocalDbProviderProps {
  children: ReactNode;
  tarballUrl?: string;
}

const DEFAULT_TARBALL_URL = "/data/funk-tree.tar.gz";

export function LocalDbProvider({
  children,
  tarballUrl = DEFAULT_TARBALL_URL,
}: LocalDbProviderProps) {
  const [db, setDb] = useState<BrowserDatabase | null>(null);
  const [status, setStatus] = useState<LoadingStatus>("idle");
  const [error, setError] = useState<Error | null>(null);

  const loadDatabase = async (forceReload = false) => {
    try {
      setError(null);
      setStatus("checking");

      // Dynamic import to avoid SSR issues
      const { loadBrowserDb } = await import("@funk-tree/db/browser");

      const database = await loadBrowserDb(tarballUrl, {
        forceReload,
        onProgress: setStatus,
      });

      setDb(database);
      setStatus("ready");
    } catch (err) {
      console.error("Failed to load local database:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
      setStatus("error");
    }
  };

  useEffect(() => {
    // Only load in browser
    if (typeof window !== "undefined") {
      loadDatabase();
    }
  }, [tarballUrl]);

  const reload = async () => {
    await loadDatabase(true);
  };

  return (
    <LocalDbContext.Provider value={{ db, status, error, reload }}>
      {children}
    </LocalDbContext.Provider>
  );
}

export function useLocalDb(): LocalDbContextValue {
  const context = useContext(LocalDbContext);
  if (!context) {
    throw new Error("useLocalDb must be used within a LocalDbProvider");
  }
  return context;
}

export function useLocalDbReady(): BrowserDatabase {
  const { db, status } = useLocalDb();
  if (status !== "ready" || !db) {
    throw new Error("Database not ready. Use useLocalDb() to check status first.");
  }
  return db;
}
