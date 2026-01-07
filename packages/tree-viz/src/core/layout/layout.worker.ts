import { computeLayout } from "./generation-layout";
import { buildTreeState } from "../data/transform";
import type { RawPerson } from "../data/transform";
import type { LayoutConfig, TreeState } from "../data/types";

/**
 * Message types for worker communication
 */
interface LayoutRequestMessage {
  id: string;
  type: "layout";
  persons: RawPerson[];
  rootId: string;
  config: LayoutConfig;
}

interface AbortMessage {
  id: string;
  type: "abort";
}

type WorkerMessage = LayoutRequestMessage | AbortMessage;

interface LayoutResultMessage {
  id: string;
  type: "result";
  treeState: TreeState;
}

interface ErrorResultMessage {
  id: string;
  type: "error";
  error: {
    message: string;
    stack?: string;
  };
}

type WorkerResponse = LayoutResultMessage | ErrorResultMessage;

// Track active computations for potential cancellation
const activeComputations = new Set<string>();

/**
 * Handle incoming messages from main thread
 */
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  if (message.type === "abort") {
    activeComputations.delete(message.id);
    return;
  }

  if (message.type === "layout") {
    const { id, persons, rootId, config } = message;
    activeComputations.add(id);

    try {
      // Check if aborted before starting
      if (!activeComputations.has(id)) {
        return;
      }

      // Build tree state from raw persons
      const state = buildTreeState(persons, rootId);

      // Check if aborted after building state
      if (!activeComputations.has(id)) {
        return;
      }

      // Compute layout
      const laidOut = computeLayout(state, config);

      // Check if aborted after layout
      if (!activeComputations.has(id)) {
        return;
      }

      // Convert Maps to serializable format for postMessage
      const serializedState: TreeState = {
        ...laidOut,
        nodes: new Map(laidOut.nodes),
        edges: new Map(laidOut.edges),
        generations: new Map(laidOut.generations),
      };

      const response: LayoutResultMessage = {
        id,
        type: "result",
        treeState: serializedState,
      };

      self.postMessage(response);
    } catch (error) {
      const response: ErrorResultMessage = {
        id,
        type: "error",
        error: {
          message: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
      };

      self.postMessage(response);
    } finally {
      activeComputations.delete(id);
    }
  }
};

// Needed for TypeScript module recognition
export {};
