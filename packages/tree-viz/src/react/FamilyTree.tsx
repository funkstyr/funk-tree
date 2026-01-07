import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TreeStage } from "../pixi/components/TreeStage";
import { TreeContent } from "../pixi/components/TreeContent";
import { useViewport } from "../pixi/hooks/useViewport";
import { computeLayout } from "../core/layout/generation-layout";
import { buildTreeState, type RawPerson } from "../core/data/transform";
import { SpatialIndex } from "../core/spatial/rtree";
import type { Person, TreeState, TreeNode } from "../core/data/types";

export interface FamilyTreeProps {
  persons: RawPerson[];
  rootId: string;
  width?: number;
  height?: number;
  className?: string;
  onPersonSelect?: (person: Person) => void;
  onPersonHover?: (person: Person | null) => void;
}

const LAYOUT_CONFIG = {
  nodeWidth: 180,
  nodeHeight: 70,
  horizontalGap: 40,
  verticalGap: 100,
  spouseGap: 20,
};

export function FamilyTree({
  persons,
  rootId,
  width: initialWidth = 800,
  height: initialHeight = 600,
  className,
  onPersonSelect,
  onPersonHover,
}: FamilyTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const spatialIndexRef = useRef(new SpatialIndex());
  const [dimensions, setDimensions] = useState({
    width: initialWidth,
    height: initialHeight,
  });
  const [treeState, setTreeState] = useState<TreeState | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

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

    const state = buildTreeState(persons, rootId);
    const laidOut = computeLayout(state, LAYOUT_CONFIG);
    setTreeState(laidOut);

    // Build spatial index
    spatialIndexRef.current.load(Array.from(laidOut.nodes.values()));

    // Fit to bounds on initial load
    if (laidOut.bounds && dimensions.width > 0 && dimensions.height > 0) {
      fitToBounds(laidOut.bounds, dimensions.width, dimensions.height);
    }
  }, [persons, rootId]);

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
      // Only deselect if clicking directly on the container (not a node)
      if (e.target === e.currentTarget) {
        setSelectedNodeId(null);
        onPersonSelect?.(null as unknown as Person);
      }
    },
    [onPersonSelect],
  );

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        cursor: "grab",
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
    </div>
  );
}
