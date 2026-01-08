import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TreeStage } from "../pixi/components/TreeStage";
import { TreeContent } from "../pixi/components/TreeContent";
import { useViewport } from "../pixi/hooks/useViewport";
import { computeLayout } from "../core/layout/generation-layout";
import { buildTreeState, type RawPerson } from "../core/data/transform";
import { SpatialIndex } from "../core/spatial/rtree";
import { useLayoutWorker } from "../hooks/useLayoutWorker";
import type { Person, TreeState, TreeNode, LayoutConfig } from "../core/data/types";

export interface FamilyTreeWithWorkerProps {
  persons: RawPerson[];
  rootId: string;
  width?: number;
  height?: number;
  className?: string;
  /** Use Web Worker for layout computation (default: true) */
  useWorker?: boolean;
  /** Timeout for worker computation in ms (default: 30000) */
  workerTimeout?: number;
  onPersonSelect?: (person: Person) => void;
  onPersonHover?: (person: Person | null) => void;
  /** Called when layout computation starts */
  onLayoutStart?: () => void;
  /** Called when layout computation ends */
  onLayoutEnd?: (duration: number) => void;
}

const LAYOUT_CONFIG: LayoutConfig = {
  nodeWidth: 180,
  nodeHeight: 70,
  horizontalGap: 40,
  verticalGap: 100,
  spouseGap: 20,
};

/**
 * FamilyTree component with Web Worker support for layout computation.
 * Automatically falls back to main thread if workers are unavailable.
 */
export function FamilyTreeWithWorker({
  persons,
  rootId,
  width: initialWidth = 800,
  height: initialHeight = 600,
  className,
  useWorker = true,
  workerTimeout = 30000,
  onPersonSelect,
  onPersonHover,
  onLayoutStart,
  onLayoutEnd,
}: FamilyTreeWithWorkerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const spatialIndexRef = useRef(new SpatialIndex());
  const [dimensions, setDimensions] = useState({
    width: initialWidth,
    height: initialHeight,
  });
  const [treeState, setTreeState] = useState<TreeState | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [isLayoutComputing, setIsLayoutComputing] = useState(false);

  // Worker hook
  const {
    computeLayout: computeLayoutInWorker,
    isReady: workerReady,
    isComputing: workerComputing,
    error: _workerError,
  } = useLayoutWorker({
    timeout: workerTimeout,
    enabled: useWorker,
  });

  // Viewport management
  const { viewport, handlers, getVisibleBounds, fitToBounds } = useViewport({
    minScale: 0.05,
    maxScale: 2,
  });

  // Compute layout when data changes
  useEffect(() => {
    if (persons.length === 0) {
      setTreeState(null);
      return;
    }

    const startTime = performance.now();
    onLayoutStart?.();
    setIsLayoutComputing(true);

    const doLayout = async () => {
      try {
        let laidOut: TreeState;

        // Try worker first if enabled and ready
        if (useWorker && workerReady) {
          try {
            laidOut = await computeLayoutInWorker(persons, rootId, LAYOUT_CONFIG);
          } catch (err) {
            // Fallback to main thread on worker error
            console.warn("Worker layout failed, falling back to main thread:", err);
            const state = buildTreeState(persons, rootId);
            laidOut = computeLayout(state, LAYOUT_CONFIG);
          }
        } else {
          // Main thread computation
          const state = buildTreeState(persons, rootId);
          laidOut = computeLayout(state, LAYOUT_CONFIG);
        }

        setTreeState(laidOut);

        // Build spatial index
        spatialIndexRef.current.load(Array.from(laidOut.nodes.values()));

        // Fit to bounds on initial load
        if (laidOut.bounds && dimensions.width > 0 && dimensions.height > 0) {
          fitToBounds(laidOut.bounds, dimensions.width, dimensions.height);
        }

        const duration = performance.now() - startTime;
        onLayoutEnd?.(duration);
      } catch (err) {
        console.error("Layout computation failed:", err);
      } finally {
        setIsLayoutComputing(false);
      }
    };

    void doLayout();
  }, [persons, rootId, useWorker, workerReady, computeLayoutInWorker]);

  // Refit when dimensions change
  useEffect(() => {
    if (treeState?.bounds && dimensions.width > 0 && dimensions.height > 0) {
      fitToBounds(treeState.bounds, dimensions.width, dimensions.height);
    }
  }, [dimensions]);

  // Responsive sizing
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setDimensions({ width, height });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Get visible bounds
  const visibleBounds = useMemo(
    () => getVisibleBounds(dimensions.width, dimensions.height),
    [viewport, dimensions, getVisibleBounds],
  );

  // Filter visible nodes using spatial index
  const visibleNodes = useMemo(() => {
    if (!treeState) return [];

    const visibleIds = spatialIndexRef.current.queryRect(visibleBounds);
    return visibleIds
      .map((id) => treeState.nodes.get(id))
      .filter((n): n is TreeNode => n !== undefined)
      .map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
        highlighted: node.id === hoveredNodeId,
      }));
  }, [treeState, visibleBounds, selectedNodeId, hoveredNodeId]);

  // Filter visible edges
  const visibleEdges = useMemo(() => {
    if (!treeState) return [];

    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    return Array.from(treeState.edges.values()).filter(
      (edge) => visibleNodeIds.has(edge.sourceId) || visibleNodeIds.has(edge.targetId),
    );
  }, [treeState, visibleNodes]);

  // Event handlers
  const handleSelect = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
      if (!treeState) return;

      const node = treeState.nodes.get(nodeId);
      if (node) {
        onPersonSelect?.(node.person);
      }
    },
    [treeState, onPersonSelect],
  );

  const handleHover = useCallback(
    (nodeId: string | null) => {
      setHoveredNodeId(nodeId);
      if (!treeState) return;

      const node = nodeId ? treeState.nodes.get(nodeId) : null;
      onPersonHover?.(node?.person || null);
    },
    [treeState, onPersonHover],
  );

  // Handle click on background (deselect)
  const handleBackgroundClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        setSelectedNodeId(null);
        onPersonSelect?.(null as unknown as Person);
      }
    },
    [onPersonSelect],
  );

  const isLoading = isLayoutComputing || workerComputing;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        cursor: isLoading ? "wait" : "grab",
        position: "relative",
      }}
      onWheel={handlers.onWheel}
      onPointerDown={handlers.onPointerDown}
      onPointerMove={handlers.onPointerMove}
      onPointerUp={handlers.onPointerUp}
      onPointerLeave={handlers.onPointerLeave}
      onClick={handleBackgroundClick}
    >
      {dimensions.width > 0 && dimensions.height > 0 && (
        <TreeStage width={dimensions.width} height={dimensions.height}>
          <TreeContent
            nodes={visibleNodes}
            edges={visibleEdges}
            viewport={viewport}
            layoutConfig={LAYOUT_CONFIG}
            onSelect={handleSelect}
            onHover={handleHover}
          />
        </TreeStage>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "rgba(0, 0, 0, 0.7)",
            color: "white",
            padding: "12px 24px",
            borderRadius: "8px",
            fontSize: "14px",
          }}
        >
          Computing layout...
        </div>
      )}
    </div>
  );
}
