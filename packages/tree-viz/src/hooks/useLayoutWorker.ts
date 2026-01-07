import { useCallback, useEffect, useRef, useState } from "react";
import type { RawPerson } from "../core/data/transform";
import type { LayoutConfig, TreeState } from "../core/data/types";

interface UseLayoutWorkerOptions {
  /** Timeout in milliseconds for layout computation (default: 30000) */
  timeout?: number;
  /** Whether to enable the worker (default: true) */
  enabled?: boolean;
}

interface UseLayoutWorkerResult {
  /** Compute layout in the worker */
  computeLayout: (
    persons: RawPerson[],
    rootId: string,
    config: LayoutConfig
  ) => Promise<TreeState>;
  /** Whether the worker is ready */
  isReady: boolean;
  /** Whether a computation is in progress */
  isComputing: boolean;
  /** Any error that occurred */
  error: Error | null;
  /** Cancel the current computation */
  cancel: () => void;
}

/**
 * Hook to compute tree layout in a Web Worker.
 * Falls back to main thread computation if workers are not supported.
 */
export function useLayoutWorker(
  options: UseLayoutWorkerOptions = {}
): UseLayoutWorkerResult {
  const { timeout = 30000, enabled = true } = options;

  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<string, {
    resolve: (result: TreeState) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }>>(new Map());

  const [isReady, setIsReady] = useState(false);
  const [isComputing, setIsComputing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Initialize worker
  useEffect(() => {
    if (!enabled) {
      setIsReady(false);
      return;
    }

    // Check for Worker support
    if (typeof Worker === "undefined") {
      setError(new Error("Web Workers not supported"));
      setIsReady(false);
      return;
    }

    try {
      // Create worker using Vite's URL pattern
      workerRef.current = new Worker(
        new URL("../core/layout/layout.worker.ts", import.meta.url),
        { type: "module" }
      );

      // Handle messages from worker
      workerRef.current.onmessage = (event) => {
        const { id, type, treeState, error: errorData } = event.data;

        const pending = pendingRef.current.get(id);
        if (!pending) return;

        clearTimeout(pending.timeoutId);
        pendingRef.current.delete(id);

        if (pendingRef.current.size === 0) {
          setIsComputing(false);
        }

        if (type === "error") {
          pending.reject(new Error(errorData.message));
        } else if (type === "result") {
          // Reconstruct Maps from serialized data
          const reconstructedState: TreeState = {
            ...treeState,
            nodes: new Map(Object.entries(treeState.nodes)),
            edges: new Map(Object.entries(treeState.edges)),
            generations: new Map(Object.entries(treeState.generations)),
          };
          pending.resolve(reconstructedState);
        }
      };

      // Handle worker errors
      workerRef.current.onerror = (event) => {
        const err = new Error(event.message || "Worker error");
        setError(err);

        // Reject all pending computations
        for (const [_id, pending] of pendingRef.current) {
          clearTimeout(pending.timeoutId);
          pending.reject(err);
        }
        pendingRef.current.clear();
        setIsComputing(false);
      };

      setIsReady(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to create worker"));
      setIsReady(false);
    }

    // Cleanup
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }

      // Clear pending computations
      for (const [, pending] of pendingRef.current) {
        clearTimeout(pending.timeoutId);
      }
      pendingRef.current.clear();

      setIsReady(false);
      setIsComputing(false);
    };
  }, [enabled]);

  // Compute layout function
  const computeLayout = useCallback(
    (
      persons: RawPerson[],
      rootId: string,
      config: LayoutConfig
    ): Promise<TreeState> => {
      return new Promise((resolve, reject) => {
        if (!workerRef.current || !isReady) {
          reject(new Error("Worker not ready"));
          return;
        }

        const id = crypto.randomUUID();
        setIsComputing(true);

        // Set up timeout
        const timeoutId = setTimeout(() => {
          pendingRef.current.delete(id);
          if (pendingRef.current.size === 0) {
            setIsComputing(false);
          }

          // Send abort message to worker
          workerRef.current?.postMessage({ id, type: "abort" });

          reject(new Error(`Layout computation timed out after ${timeout}ms`));
        }, timeout);

        // Store pending promise
        pendingRef.current.set(id, { resolve, reject, timeoutId });

        // Send message to worker
        workerRef.current.postMessage({
          id,
          type: "layout",
          persons,
          rootId,
          config,
        });
      });
    },
    [isReady, timeout]
  );

  // Cancel function
  const cancel = useCallback(() => {
    if (!workerRef.current) return;

    for (const [id, pending] of pendingRef.current) {
      clearTimeout(pending.timeoutId);
      workerRef.current.postMessage({ id, type: "abort" });
      pending.reject(new Error("Computation cancelled"));
    }
    pendingRef.current.clear();
    setIsComputing(false);
  }, []);

  return {
    computeLayout,
    isReady,
    isComputing,
    error,
    cancel,
  };
}
