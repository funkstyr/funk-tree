# Custom Family Tree Visualization Package

## PixiJS v8 + WebGPU Architecture

Building a future-proof, high-performance family tree visualization using **PixiJS v8** with WebGPU support and **@pixi/react** for React 19 integration.

## Why PixiJS v8?

| Feature              | Benefit                            |
| -------------------- | ---------------------------------- |
| WebGPU support       | Future-proof, best GPU performance |
| WebGL fallback       | Works on all browsers today        |
| Built-in culling     | Automatic viewport optimization    |
| React 19 support     | @pixi/react v8 declarative API     |
| TypeScript-first     | Full type safety, rebuilt in TS    |
| Sprite batching      | Up to 16 textures per batch        |
| Async initialization | Modern async/await patterns        |

**Performance targets:**

- 100,000+ nodes with culling
- 60fps pan/zoom interactions
- Sub-50ms initial render

---

## Architecture Overview

```
packages/
└── tree-viz/
    ├── src/
    │   ├── core/
    │   │   ├── layout/
    │   │   │   ├── generation-layout.ts   # Family tree layout algorithm
    │   │   │   └── types.ts
    │   │   ├── spatial/
    │   │   │   └── rtree.ts               # R-Tree for hit testing
    │   │   └── data/
    │   │       ├── tree-model.ts          # Core data structures
    │   │       └── transform.ts           # DB -> viz transforms
    │   ├── pixi/
    │   │   ├── components/
    │   │   │   ├── TreeStage.tsx          # Root PixiJS stage
    │   │   │   ├── NodeSprite.tsx         # Person node component
    │   │   │   ├── EdgeGraphics.tsx       # Relationship lines
    │   │   │   └── GenerationLayer.tsx    # Generation container
    │   │   ├── hooks/
    │   │   │   ├── useViewport.ts         # Pan/zoom state
    │   │   │   ├── useCulling.ts          # Viewport culling
    │   │   │   └── useTreeLayout.ts       # Layout computation
    │   │   └── extend.ts                  # PixiJS component registration
    │   ├── react/
    │   │   ├── FamilyTree.tsx             # Main public component
    │   │   ├── FamilyTreeProvider.tsx     # Context provider
    │   │   └── types.ts
    │   └── index.ts
    ├── package.json
    └── tsconfig.json
```

---

## Dependencies

```json
{
  "name": "@funk-tree/tree-viz",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "pixi.js": "^8.6.6",
    "@pixi/react": "^8.0.0",
    "rbush": "^4.0.1"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/rbush": "^4.0.0",
    "typescript": "^5.7.0"
  }
}
```

---

## Core Data Model

```typescript
// core/data/tree-model.ts

export interface Person {
  id: string;
  wikiId: string;
  name: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  deathDate?: string;
  birthLocation?: string;
  gender: 'M' | 'F' | 'U';
  generation?: number;
}

export interface Relationship {
  type: 'parent' | 'child' | 'spouse';
  sourceId: string;
  targetId: string;
}

export interface TreeNode {
  id: string;
  person: Person;
  // Layout position (world coordinates)
  x: number;
  y: number;
  width: number;
  height: number;
  // Relationships
  parentIds: string[];
  childIds: string[];
  spouseIds: string[];
  // Visual state
  collapsed: boolean;
  selected: boolean;
  highlighted: boolean;
  visible: boolean;  // Set by culling
}

export interface TreeEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: 'parent-child' | 'spouse';
  points: Point[];
}

export interface TreeState {
  nodes: Map<string, TreeNode>;
  edges: Map<string, TreeEdge>;
  rootId: string;
  bounds: Bounds;
  generations: Map<number, string[]>;  // generation -> node IDs
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Point {
  x: number;
  y: number;
}
```

---

## PixiJS v8 Setup with React

### Component Registration (extend API)

PixiJS React v8 requires explicit component registration for tree-shaking:

```typescript
// pixi/extend.ts
import { extend } from '@pixi/react';
import {
  Container,
  Graphics,
  Text,
  Sprite,
  Application,
} from 'pixi.js';

// Register components once at app startup
extend({
  Container,
  Graphics,
  Text,
  Sprite,
});

// TypeScript: Extend PixiElements for type safety
declare module '@pixi/react' {
  interface PixiElements {
    container: PixiReactElementProps<typeof Container>;
    graphics: PixiReactElementProps<typeof Graphics>;
    text: PixiReactElementProps<typeof Text>;
    sprite: PixiReactElementProps<typeof Sprite>;
  }
}
```

### Application Initialization

PixiJS v8 requires async initialization:

```typescript
// pixi/components/TreeStage.tsx
import { Application, useApp } from '@pixi/react';
import { useEffect, useRef, useState } from 'react';

interface TreeStageProps {
  children: React.ReactNode;
  width: number;
  height: number;
  onReady?: (app: Application) => void;
}

export function TreeStage({ children, width, height, onReady }: TreeStageProps) {
  const [app, setApp] = useState<Application | null>(null);

  useEffect(() => {
    const initApp = async () => {
      const application = new Application();

      await application.init({
        width,
        height,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        backgroundColor: 0x1a1a2e,
        // Prefer WebGPU, fall back to WebGL
        preference: 'webgpu',
        // Performance options
        powerPreference: 'high-performance',
      });

      setApp(application);
      onReady?.(application);
    };

    initApp();

    return () => {
      app?.destroy(true, { children: true, texture: true });
    };
  }, []);

  if (!app) {
    return <div style={{ width, height }} className="animate-pulse bg-gray-800" />;
  }

  return (
    <Application app={app}>
      {children}
    </Application>
  );
}
```

---

## Viewport & Culling System

### Viewport Hook with Pan/Zoom

```typescript
// pixi/hooks/useViewport.ts
import { useCallback, useRef, useState } from 'react';
import { Rectangle } from 'pixi.js';

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface UseViewportOptions {
  initialScale?: number;
  minScale?: number;
  maxScale?: number;
  bounds?: Bounds;
}

export function useViewport(options: UseViewportOptions = {}) {
  const {
    initialScale = 1,
    minScale = 0.1,
    maxScale = 3,
    bounds,
  } = options;

  const [viewport, setViewport] = useState<Viewport>({
    x: 0,
    y: 0,
    scale: initialScale,
  });

  const isDragging = useRef(false);
  const lastPosition = useRef({ x: 0, y: 0 });

  const pan = useCallback((dx: number, dy: number) => {
    setViewport(prev => ({
      ...prev,
      x: prev.x + dx / prev.scale,
      y: prev.y + dy / prev.scale,
    }));
  }, []);

  const zoomAt = useCallback((delta: number, centerX: number, centerY: number) => {
    setViewport(prev => {
      const factor = delta > 0 ? 0.9 : 1.1;
      const newScale = Math.max(minScale, Math.min(maxScale, prev.scale * factor));

      // Zoom towards cursor position
      const worldX = prev.x + centerX / prev.scale;
      const worldY = prev.y + centerY / prev.scale;

      return {
        x: worldX - centerX / newScale,
        y: worldY - centerY / newScale,
        scale: newScale,
      };
    });
  }, [minScale, maxScale]);

  const fitToBounds = useCallback((containerBounds: Bounds, padding = 50) => {
    const width = containerBounds.maxX - containerBounds.minX + padding * 2;
    const height = containerBounds.maxY - containerBounds.minY + padding * 2;

    // Calculate scale to fit
    const scaleX = window.innerWidth / width;
    const scaleY = window.innerHeight / height;
    const scale = Math.min(scaleX, scaleY, maxScale);

    setViewport({
      x: containerBounds.minX - padding,
      y: containerBounds.minY - padding,
      scale,
    });
  }, [maxScale]);

  // Get visible area as Rectangle for culling
  const getVisibleRect = useCallback((screenWidth: number, screenHeight: number): Rectangle => {
    return new Rectangle(
      viewport.x,
      viewport.y,
      screenWidth / viewport.scale,
      screenHeight / viewport.scale
    );
  }, [viewport]);

  const handlers = {
    onWheel: useCallback((e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(e.deltaY, e.offsetX, e.offsetY);
      } else {
        pan(-e.deltaX, -e.deltaY);
      }
    }, [pan, zoomAt]),

    onPointerDown: useCallback((e: PointerEvent) => {
      isDragging.current = true;
      lastPosition.current = { x: e.clientX, y: e.clientY };
    }, []),

    onPointerMove: useCallback((e: PointerEvent) => {
      if (!isDragging.current) return;

      const dx = e.clientX - lastPosition.current.x;
      const dy = e.clientY - lastPosition.current.y;
      lastPosition.current = { x: e.clientX, y: e.clientY };

      pan(dx, dy);
    }, [pan]),

    onPointerUp: useCallback(() => {
      isDragging.current = false;
    }, []),
  };

  return {
    viewport,
    setViewport,
    pan,
    zoomAt,
    fitToBounds,
    getVisibleRect,
    handlers,
  };
}
```

### Culling Hook (PixiJS v8 Built-in)

```typescript
// pixi/hooks/useCulling.ts
import { useCallback, useEffect, useRef } from 'react';
import { Container, Rectangle, Culler } from 'pixi.js';

interface UseCullingOptions {
  enabled?: boolean;
  updateTransform?: boolean;
}

export function useCulling(
  containerRef: React.RefObject<Container>,
  viewRect: Rectangle,
  options: UseCullingOptions = {}
) {
  const { enabled = true, updateTransform = true } = options;
  const cullerRef = useRef(Culler.shared);

  const performCull = useCallback(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    // PixiJS v8 built-in culling
    cullerRef.current.cull(container, viewRect, updateTransform);
  }, [viewRect, enabled, updateTransform]);

  // Re-cull when viewport changes
  useEffect(() => {
    performCull();
  }, [performCull]);

  return { performCull };
}
```

---

## Node Rendering Components

### Node Sprite with Level of Detail

```typescript
// pixi/components/NodeSprite.tsx
import { Container, Graphics, Text } from '@pixi/react';
import { useCallback, useMemo } from 'react';
import type { TreeNode } from '../../core/data/tree-model';

interface NodeSpriteProps {
  node: TreeNode;
  scale: number;  // Current viewport scale for LOD
  onSelect?: (nodeId: string) => void;
  onHover?: (nodeId: string | null) => void;
}

const COLORS = {
  male: 0x3b82f6,
  female: 0xec4899,
  unknown: 0x6b7280,
  selected: 0xfbbf24,
  hover: 0x60a5fa,
};

type DetailLevel = 'full' | 'medium' | 'minimal';

function getDetailLevel(scale: number): DetailLevel {
  if (scale > 0.6) return 'full';
  if (scale > 0.25) return 'medium';
  return 'minimal';
}

export function NodeSprite({ node, scale, onSelect, onHover }: NodeSpriteProps) {
  const { x, y, width, height, person, selected, highlighted } = node;
  const lod = getDetailLevel(scale);

  const fillColor = useMemo(() => {
    if (selected) return COLORS.selected;
    if (person.gender === 'M') return COLORS.male;
    if (person.gender === 'F') return COLORS.female;
    return COLORS.unknown;
  }, [selected, person.gender]);

  const drawBackground = useCallback((g: Graphics) => {
    g.clear();
    g.roundRect(0, 0, width, height, 8);
    g.fill({ color: fillColor });

    if (highlighted) {
      g.stroke({ color: 0xfbbf24, width: 3 });
    }
  }, [width, height, fillColor, highlighted]);

  const dates = useMemo(() => {
    return [person.birthDate, person.deathDate].filter(Boolean).join(' - ');
  }, [person.birthDate, person.deathDate]);

  return (
    <container
      x={x}
      y={y}
      eventMode="static"
      cursor="pointer"
      cullable={true}
      onPointerDown={() => onSelect?.(node.id)}
      onPointerEnter={() => onHover?.(node.id)}
      onPointerLeave={() => onHover?.(null)}
    >
      <graphics draw={drawBackground} />

      {/* Name - shown at medium and full LOD */}
      {lod !== 'minimal' && (
        <text
          text={person.name}
          x={width / 2}
          y={lod === 'full' ? 20 : height / 2}
          anchor={{ x: 0.5, y: lod === 'full' ? 0 : 0.5 }}
          style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: lod === 'full' ? 14 : 12,
            fontWeight: '600',
            fill: 0xffffff,
            wordWrap: true,
            wordWrapWidth: width - 16,
            align: 'center',
          }}
        />
      )}

      {/* Dates - only at full LOD */}
      {lod === 'full' && dates && (
        <text
          text={dates}
          x={width / 2}
          y={42}
          anchor={{ x: 0.5, y: 0 }}
          style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 11,
            fill: 0xcccccc,
            align: 'center',
          }}
        />
      )}

      {/* Location - only at full LOD */}
      {lod === 'full' && person.birthLocation && (
        <text
          text={person.birthLocation}
          x={width / 2}
          y={height - 12}
          anchor={{ x: 0.5, y: 1 }}
          style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 10,
            fill: 0x999999,
            align: 'center',
            wordWrap: true,
            wordWrapWidth: width - 16,
          }}
        />
      )}
    </container>
  );
}
```

### Edge Graphics (Relationship Lines)

```typescript
// pixi/components/EdgeGraphics.tsx
import { Graphics } from '@pixi/react';
import { useCallback } from 'react';
import type { TreeEdge } from '../../core/data/tree-model';

interface EdgeGraphicsProps {
  edges: TreeEdge[];
  scale: number;
}

const EDGE_COLORS = {
  'parent-child': 0x4b5563,
  'spouse': 0x9333ea,
};

export function EdgeGraphics({ edges, scale }: EdgeGraphicsProps) {
  const drawEdges = useCallback((g: Graphics) => {
    g.clear();

    for (const edge of edges) {
      const color = EDGE_COLORS[edge.type];
      const lineWidth = edge.type === 'spouse' ? 2 : 1.5;

      g.moveTo(edge.points[0].x, edge.points[0].y);

      if (edge.type === 'spouse') {
        // Dashed line for spouses
        // PixiJS doesn't have native dash, use segments
        drawDashedLine(g, edge.points, color, lineWidth);
      } else {
        // Bezier curve for parent-child
        g.stroke({ color, width: lineWidth });

        for (let i = 1; i < edge.points.length; i++) {
          const p0 = edge.points[i - 1];
          const p1 = edge.points[i];
          const midY = (p0.y + p1.y) / 2;

          g.bezierCurveTo(p0.x, midY, p1.x, midY, p1.x, p1.y);
        }
        g.stroke({ color, width: lineWidth });
      }
    }
  }, [edges]);

  return <graphics draw={drawEdges} />;
}

function drawDashedLine(
  g: Graphics,
  points: Point[],
  color: number,
  width: number,
  dashLength = 8,
  gapLength = 4
) {
  // Simplified: draw line segments
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];

    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const segments = Math.floor(distance / (dashLength + gapLength));

    for (let j = 0; j < segments; j++) {
      const startRatio = (j * (dashLength + gapLength)) / distance;
      const endRatio = (j * (dashLength + gapLength) + dashLength) / distance;

      g.moveTo(
        p0.x + dx * startRatio,
        p0.y + dy * startRatio
      );
      g.lineTo(
        p0.x + dx * endRatio,
        p0.y + dy * endRatio
      );
    }
    g.stroke({ color, width });
  }
}
```

---

## Main React Component

```typescript
// react/FamilyTree.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Container, Rectangle } from 'pixi.js';
import { Application, useApp } from '@pixi/react';

import { TreeStage } from '../pixi/components/TreeStage';
import { NodeSprite } from '../pixi/components/NodeSprite';
import { EdgeGraphics } from '../pixi/components/EdgeGraphics';
import { useViewport } from '../pixi/hooks/useViewport';
import { useCulling } from '../pixi/hooks/useCulling';
import { computeLayout } from '../core/layout/generation-layout';
import { buildTreeState } from '../core/data/transform';
import type { Person, Relationship, TreeState, TreeNode } from '../core/data/tree-model';

// Import and register PixiJS components
import '../pixi/extend';

export interface FamilyTreeProps {
  persons: Person[];
  relationships: Relationship[];
  rootId: string;
  width?: number;
  height?: number;
  onPersonSelect?: (person: Person) => void;
  onPersonHover?: (person: Person | null) => void;
  className?: string;
}

export function FamilyTree({
  persons,
  relationships,
  rootId,
  width = 800,
  height = 600,
  onPersonSelect,
  onPersonHover,
  className,
}: FamilyTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageContainerRef = useRef<Container>(null);
  const [dimensions, setDimensions] = useState({ width, height });
  const [treeState, setTreeState] = useState<TreeState | null>(null);

  // Viewport management
  const {
    viewport,
    handlers,
    getVisibleRect,
    fitToBounds,
  } = useViewport({
    minScale: 0.05,
    maxScale: 2,
  });

  // Compute layout when data changes
  useEffect(() => {
    const state = buildTreeState(persons, relationships, rootId);
    const laidOut = computeLayout(state, {
      nodeWidth: 180,
      nodeHeight: 70,
      horizontalGap: 40,
      verticalGap: 100,
      spouseGap: 20,
    });
    setTreeState(laidOut);

    // Fit to bounds on initial load
    if (laidOut.bounds) {
      fitToBounds(laidOut.bounds);
    }
  }, [persons, relationships, rootId]);

  // Responsive sizing
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Culling
  const visibleRect = useMemo(
    () => getVisibleRect(dimensions.width, dimensions.height),
    [viewport, dimensions]
  );

  useCulling(stageContainerRef, visibleRect);

  // Event handlers
  const handleSelect = useCallback((nodeId: string) => {
    if (!treeState) return;
    const node = treeState.nodes.get(nodeId);
    if (node) {
      onPersonSelect?.(node.person);
    }
  }, [treeState, onPersonSelect]);

  const handleHover = useCallback((nodeId: string | null) => {
    if (!treeState) return;
    const node = nodeId ? treeState.nodes.get(nodeId) : null;
    onPersonHover?.(node?.person || null);
  }, [treeState, onPersonHover]);

  // Filter visible nodes (R-Tree could be used here for optimization)
  const visibleNodes = useMemo(() => {
    if (!treeState) return [];
    return Array.from(treeState.nodes.values()).filter(node => {
      return (
        node.x + node.width >= visibleRect.x &&
        node.x <= visibleRect.x + visibleRect.width &&
        node.y + node.height >= visibleRect.y &&
        node.y <= visibleRect.y + visibleRect.height
      );
    });
  }, [treeState, visibleRect]);

  // Filter visible edges
  const visibleEdges = useMemo(() => {
    if (!treeState) return [];
    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
    return Array.from(treeState.edges.values()).filter(edge =>
      visibleNodeIds.has(edge.sourceId) || visibleNodeIds.has(edge.targetId)
    );
  }, [treeState, visibleNodes]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        cursor: 'grab',
      }}
      onWheel={handlers.onWheel}
      onPointerDown={handlers.onPointerDown}
      onPointerMove={handlers.onPointerMove}
      onPointerUp={handlers.onPointerUp}
      onPointerLeave={handlers.onPointerUp}
    >
      <TreeStage width={dimensions.width} height={dimensions.height}>
        <container
          ref={stageContainerRef}
          x={-viewport.x * viewport.scale}
          y={-viewport.y * viewport.scale}
          scale={viewport.scale}
        >
          {/* Edges layer (render below nodes) */}
          <container sortableChildren={false}>
            <EdgeGraphics edges={visibleEdges} scale={viewport.scale} />
          </container>

          {/* Nodes layer */}
          <container sortableChildren={false}>
            {visibleNodes.map(node => (
              <NodeSprite
                key={node.id}
                node={node}
                scale={viewport.scale}
                onSelect={handleSelect}
                onHover={handleHover}
              />
            ))}
          </container>
        </container>
      </TreeStage>

      {/* Debug overlay */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute top-2 left-2 bg-black/70 text-white text-xs p-2 rounded font-mono">
          <div>Total: {treeState?.nodes.size || 0}</div>
          <div>Visible: {visibleNodes.length}</div>
          <div>Culled: {((1 - visibleNodes.length / (treeState?.nodes.size || 1)) * 100).toFixed(1)}%</div>
          <div>Scale: {viewport.scale.toFixed(2)}</div>
        </div>
      )}
    </div>
  );
}
```

---

## Generation Layout Algorithm

```typescript
// core/layout/generation-layout.ts
import type { TreeState, TreeNode, TreeEdge, Bounds } from '../data/tree-model';

export interface LayoutConfig {
  nodeWidth: number;
  nodeHeight: number;
  horizontalGap: number;
  verticalGap: number;
  spouseGap: number;
}

export function computeLayout(tree: TreeState, config: LayoutConfig): TreeState {
  const { nodes, rootId } = tree;

  // Step 1: Assign generations via BFS
  const generations = assignGenerations(nodes, rootId);

  // Step 2: Group by generation
  const genGroups = groupByGeneration(nodes, generations);

  // Step 3: Sort within generations (families together)
  for (const group of genGroups.values()) {
    sortFamiliesInGeneration(group, nodes);
  }

  // Step 4: Position nodes
  positionNodes(genGroups, nodes, config);

  // Step 5: Center children under parents
  centerChildrenUnderParents(genGroups, nodes, config);

  // Step 6: Compute edges
  const edges = computeEdges(nodes, config);

  // Step 7: Compute bounds
  const bounds = computeBounds(nodes);

  return {
    ...tree,
    edges,
    bounds,
    generations: genGroups,
  };
}

function assignGenerations(
  nodes: Map<string, TreeNode>,
  rootId: string
): Map<string, number> {
  const generations = new Map<string, number>();
  const queue: [string, number][] = [[rootId, 0]];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const [id, gen] = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    generations.set(id, gen);
    const node = nodes.get(id);
    if (!node) continue;

    // Spouses same generation
    for (const spouseId of node.spouseIds) {
      if (!visited.has(spouseId)) {
        queue.push([spouseId, gen]);
      }
    }

    // Children next generation
    for (const childId of node.childIds) {
      if (!visited.has(childId)) {
        queue.push([childId, gen + 1]);
      }
    }

    // Parents previous generation
    for (const parentId of node.parentIds) {
      if (!visited.has(parentId)) {
        queue.push([parentId, gen - 1]);
      }
    }
  }

  // Normalize to start at 0
  const minGen = Math.min(...generations.values());
  for (const [id, gen] of generations) {
    generations.set(id, gen - minGen);
  }

  return generations;
}

function groupByGeneration(
  nodes: Map<string, TreeNode>,
  generations: Map<string, number>
): Map<number, TreeNode[]> {
  const groups = new Map<number, TreeNode[]>();

  for (const node of nodes.values()) {
    const gen = generations.get(node.id) ?? 0;
    if (!groups.has(gen)) groups.set(gen, []);
    groups.get(gen)!.push(node);
  }

  return groups;
}

function positionNodes(
  genGroups: Map<number, TreeNode[]>,
  nodes: Map<string, TreeNode>,
  config: LayoutConfig
): void {
  for (const [gen, group] of genGroups) {
    let x = 0;

    for (let i = 0; i < group.length; i++) {
      const node = group[i];
      node.x = x;
      node.y = gen * (config.nodeHeight + config.verticalGap);
      node.width = config.nodeWidth;
      node.height = config.nodeHeight;

      // Check if next is spouse
      const nextNode = group[i + 1];
      const isSpouse = nextNode && node.spouseIds.includes(nextNode.id);

      x += config.nodeWidth + (isSpouse ? config.spouseGap : config.horizontalGap);
    }
  }
}

function computeEdges(
  nodes: Map<string, TreeNode>,
  config: LayoutConfig
): Map<string, TreeEdge> {
  const edges = new Map<string, TreeEdge>();

  for (const node of nodes.values()) {
    // Parent-child edges
    for (const childId of node.childIds) {
      const child = nodes.get(childId);
      if (!child) continue;

      const edgeId = `${node.id}->${childId}`;
      edges.set(edgeId, {
        id: edgeId,
        sourceId: node.id,
        targetId: childId,
        type: 'parent-child',
        points: [
          { x: node.x + node.width / 2, y: node.y + node.height },
          { x: child.x + child.width / 2, y: child.y },
        ],
      });
    }

    // Spouse edges (only create once per pair)
    for (const spouseId of node.spouseIds) {
      const spouse = nodes.get(spouseId);
      if (!spouse || node.id > spouseId) continue;  // Avoid duplicates

      const edgeId = `${node.id}<=>${spouseId}`;
      edges.set(edgeId, {
        id: edgeId,
        sourceId: node.id,
        targetId: spouseId,
        type: 'spouse',
        points: [
          { x: node.x + node.width, y: node.y + node.height / 2 },
          { x: spouse.x, y: spouse.y + spouse.height / 2 },
        ],
      });
    }
  }

  return edges;
}

function computeBounds(nodes: Map<string, TreeNode>): Bounds {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const node of nodes.values()) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }

  return { minX, minY, maxX, maxY };
}
```

---

## Performance Optimizations

### 1. R-Tree for Fast Hit Testing

```typescript
// core/spatial/rtree.ts
import RBush from 'rbush';

interface SpatialItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
}

export class SpatialIndex {
  private tree = new RBush<SpatialItem>();

  load(nodes: TreeNode[]): void {
    const items = nodes.map(node => ({
      minX: node.x,
      minY: node.y,
      maxX: node.x + node.width,
      maxY: node.y + node.height,
      id: node.id,
    }));
    this.tree.load(items);
  }

  queryRect(rect: Rectangle): string[] {
    return this.tree.search({
      minX: rect.x,
      minY: rect.y,
      maxX: rect.x + rect.width,
      maxY: rect.y + rect.height,
    }).map(item => item.id);
  }

  queryPoint(x: number, y: number): string | null {
    const results = this.tree.search({
      minX: x,
      minY: y,
      maxX: x,
      maxY: y,
    });
    return results[0]?.id ?? null;
  }
}
```

### 2. Web Worker Layout Computation

```typescript
// core/layout/layout.worker.ts
import { computeLayout } from './generation-layout';
import { buildTreeState } from '../data/transform';

self.onmessage = (e: MessageEvent) => {
  const { persons, relationships, rootId, config } = e.data;

  const state = buildTreeState(persons, relationships, rootId);
  const layout = computeLayout(state, config);

  // Transfer the result back
  self.postMessage(layout);
};
```

### 3. Texture Atlas for Node Backgrounds

```typescript
// Pre-render node backgrounds to textures for GPU batching
import { Graphics, RenderTexture, Application } from 'pixi.js';

function createNodeTextures(app: Application) {
  const textures = new Map<string, RenderTexture>();

  const colors = {
    male: 0x3b82f6,
    female: 0xec4899,
    unknown: 0x6b7280,
  };

  for (const [key, color] of Object.entries(colors)) {
    const graphics = new Graphics();
    graphics.roundRect(0, 0, 180, 70, 8);
    graphics.fill({ color });

    const texture = app.renderer.generateTexture(graphics);
    textures.set(key, texture);
  }

  return textures;
}
```

### 4. PixiJS v8 Specific Optimizations

```typescript
// Optimization settings for PixiJS v8
const optimizedAppConfig = {
  // Prefer WebGPU for better batching
  preference: 'webgpu',

  // Disable features we don't need
  hello: false,  // Disable console greeting

  // Power preference for laptops
  powerPreference: 'high-performance',

  // Resolution handling
  resolution: window.devicePixelRatio || 1,
  autoDensity: true,
};

// Container optimization
container.cullable = true;           // Enable culling
container.interactiveChildren = false; // Disable if no child events needed

// Text optimization - use BitmapText for dynamic content
import { BitmapText, BitmapFont } from 'pixi.js';

BitmapFont.from('NodeFont', {
  fontFamily: 'Inter',
  fontSize: 14,
  fill: 0xffffff,
});

// Use BitmapText instead of Text for frequently updated labels
<BitmapText text={name} fontName="NodeFont" />
```

---

## Implementation Steps

1. ✅ **Create package scaffold**
   - Set up `packages/tree-viz` with TypeScript + PixiJS v8
   - Configure @pixi/react with extend API

2. ✅ **Implement data layer**
   - TreeNode, TreeEdge, TreeState types
   - Transform functions from DB schema

3. ✅ **Build layout engine**
   - Generation assignment algorithm
   - Position computation
   - Edge routing

4. ✅ **Create PixiJS components**
   - TreeStage with async init
   - NodeSprite with LOD
   - EdgeGraphics

5. ✅ **Implement viewport system**
   - Pan/zoom hooks
   - Coordinate transforms
   - Culling integration (R-Tree)

6. ✅ **Add interactivity**
   - Node selection/hover
   - R-Tree hit testing
   - Event handlers

7. **Optimize performance** (future)
   - Web Worker layout
   - Texture atlas
   - BitmapText

8. 🔄 **Integrate with app**
   - Replace react-d3-tree
   - Connect to ORPC data

---

## Web App Integration

### Files to Modify

1. `apps/web/package.json` - Add tree-viz dependency
2. `apps/web/src/components/family-tree.tsx` - Replace react-d3-tree with tree-viz
3. Keep `apps/web/src/components/person-card.tsx` - Reuse for selection panel

### Data Mapping

The web app receives Person data with snake_case fields from the DB:

```typescript
// apps/web Person type (snake_case from DB)
interface Person {
  wiki_id: string;
  name?: string | null;
  first_name?: string | null;
  gender?: string | null;
  birth_date?: string | null;
  death_date?: string | null;
  birth_location?: string | null;
  father_wiki_id?: string | null;
  mother_wiki_id?: string | null;
  // ...
}

// tree-viz RawPerson type (camelCase)
interface RawPerson {
  id: string;
  wikiId: string;
  name: string;
  gender: 'M' | 'F' | 'U';
  birthDate?: string;
  deathDate?: string;
  birthLocation?: string;
  fatherWikiId?: string;
  motherWikiId?: string;
  spouseWikiIds?: string[];
}
```

### Transform Function

```typescript
function mapDbPersonToRawPerson(dbPerson: Person): RawPerson {
  const displayName =
    dbPerson.name ||
    [dbPerson.first_name, dbPerson.middle_name, dbPerson.last_name_birth]
      .filter(Boolean)
      .join(" ") ||
    dbPerson.wiki_id;

  return {
    id: dbPerson.wiki_id,
    wikiId: dbPerson.wiki_id,
    name: displayName,
    gender: dbPerson.gender === "Male" ? "M" : dbPerson.gender === "Female" ? "F" : "U",
    birthDate: dbPerson.birth_date || undefined,
    deathDate: dbPerson.death_date || undefined,
    birthLocation: dbPerson.birth_location || undefined,
    fatherWikiId: dbPerson.father_wiki_id || undefined,
    motherWikiId: dbPerson.mother_wiki_id || undefined,
  };
}
```

---

## Future Optimizations (Detailed Plans)

The following optimizations are planned for when performance requirements increase (>10k nodes).

---

### 1. Web Worker Layout Computation

#### Why Use Web Workers?

Moving layout computation to a Web Worker prevents main thread blocking during expensive tree traversals. Key benefits:

| Tree Size     | Main Thread | Worker (Transferable) | UI Blocking |
| ------------- | ----------- | --------------------- | ----------- |
| 1,000 nodes   | 5ms         | 5.5ms                 | None        |
| 10,000 nodes  | 70ms        | 75ms                  | Noticeable  |
| 50,000 nodes  | 450ms       | 500ms                 | Severe      |
| 100,000 nodes | 1000ms      | 1100ms                | Unusable    |

While total time is similar, workers keep the UI responsive during computation.

#### Implementation

**Worker File:**

```typescript
// packages/tree-viz/src/core/layout/layout.worker.ts
import { computeLayout } from './generation-layout';
import { buildTreeState } from '../data/transform';
import type { TreeState, LayoutConfig } from '../data/types';

interface WorkerMessage {
  id: string;
  type: 'layout' | 'abort';
  treeState?: TreeState;
  config?: LayoutConfig;
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { id, type, treeState, config } = event.data;

  try {
    if (type === 'layout' && treeState && config) {
      const result = computeLayout(treeState, config);
      self.postMessage({ id, result });
    }
  } catch (error) {
    self.postMessage({
      id,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }
    });
  }
};

export {};
```

**React Hook:**

```typescript
// packages/tree-viz/src/hooks/useLayoutWorker.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TreeState, LayoutConfig, LayoutResult } from '../core/data/types';

export function useLayoutWorker(options: { timeout?: number } = {}) {
  const { timeout = 10000 } = options;
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    try {
      workerRef.current = new Worker(
        new URL('../core/layout/layout.worker.ts', import.meta.url),
        { type: 'module' }
      );

      workerRef.current.onerror = (event) => {
        setError(new Error(event.message));
      };

      setIsReady(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to create worker'));
    }

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const computeLayout = useCallback(
    (treeState: TreeState, config: LayoutConfig): Promise<LayoutResult> => {
      if (!workerRef.current || !isReady) {
        return Promise.reject(new Error('Worker not initialized'));
      }

      return new Promise((resolve, reject) => {
        const messageId = crypto.randomUUID();
        let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

        const handler = (event: MessageEvent) => {
          if (event.data.id !== messageId) return;

          if (timeoutHandle) clearTimeout(timeoutHandle);
          workerRef.current?.removeEventListener('message', handler);

          if (event.data.error) {
            reject(new Error(event.data.error.message));
          } else {
            resolve(event.data.result);
          }
        };

        timeoutHandle = setTimeout(() => {
          workerRef.current?.removeEventListener('message', handler);
          reject(new Error(`Layout timeout (${timeout}ms)`));
        }, timeout);

        workerRef.current!.addEventListener('message', handler);
        workerRef.current!.postMessage({
          id: messageId,
          type: 'layout',
          treeState,
          config
        });
      });
    },
    [isReady, timeout]
  );

  return { computeLayout, isReady, error };
}
```

**Usage with Fallback:**

```typescript
// In FamilyTree.tsx
const { computeLayout: computeInWorker, isReady } = useLayoutWorker();

useEffect(() => {
  if (!isReady) return;

  const treeState = buildTreeState(persons, rootId);

  computeInWorker(treeState, LAYOUT_CONFIG)
    .then(setTreeState)
    .catch((error) => {
      console.warn('Worker failed, falling back:', error);
      // Fallback to main thread
      setTreeState(computeLayout(treeState, LAYOUT_CONFIG));
    });
}, [persons, rootId, isReady]);
```

#### Data Serialization Strategies

| Method               | Use Case          | Performance            |
| -------------------- | ----------------- | ---------------------- |
| Structured Clone     | <5k nodes         | Automatic, simple      |
| Transferable Objects | >10k nodes        | Zero-copy, fast        |
| SharedArrayBuffer    | Concurrent access | Complex, rarely needed |

**Transferable Objects Example:**

```typescript
// Convert tree data to transferable format
function serializeTreeData(treeState: TreeState) {
  const nodeX = new Float32Array(treeState.nodes.size);
  const nodeY = new Float32Array(treeState.nodes.size);
  // ... fill arrays

  return {
    metadata: { nodeIds: [...treeState.nodes.keys()] },
    buffers: [nodeX.buffer, nodeY.buffer]
  };
}

// Send with transfer list
const { metadata, buffers } = serializeTreeData(treeState);
worker.postMessage({ metadata }, buffers);
```

#### Alternative: Comlink (Cleaner API)

```typescript
// Using Comlink for RPC-style communication
import * as Comlink from 'comlink';

// Worker
class LayoutComputer {
  compute(treeState: TreeState, config: LayoutConfig) {
    return computeLayout(treeState, config);
  }
}
Comlink.expose(LayoutComputer);

// Main thread
const Computer = Comlink.wrap<typeof LayoutComputer>(worker);
const result = await new Computer().compute(treeState, config);
```

---

### 2. Texture Atlas for Node Backgrounds

#### Why Texture Atlases?

Pre-rendering node backgrounds to textures provides 3-4x performance boost:

- Single draw call for all nodes with same texture
- GPU batching with up to 16 textures per batch
- No runtime Graphics recreation

#### Implementation

**Pre-render Node Textures:**

```typescript
// packages/tree-viz/src/pixi/textures/NodeTextures.ts
import { Graphics, RenderTexture, Application } from 'pixi.js';

interface NodeTextureConfig {
  width: number;
  height: number;
  cornerRadius: number;
  colors: {
    male: number;
    female: number;
    unknown: number;
    selected: number;
    highlighted: number;
  };
}

export class NodeTextureManager {
  private textures = new Map<string, RenderTexture>();

  constructor(
    private app: Application,
    private config: NodeTextureConfig
  ) {}

  async initialize() {
    const { width, height, cornerRadius, colors } = this.config;

    // Pre-render each node type
    for (const [key, color] of Object.entries(colors)) {
      const graphics = new Graphics()
        .roundRect(0, 0, width, height, cornerRadius)
        .fill({ color });

      const texture = RenderTexture.create({
        width,
        height,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
      });

      this.app.renderer.render(graphics, { target: texture });
      this.textures.set(key, texture);

      graphics.destroy();
    }
  }

  getTexture(gender: 'M' | 'F' | 'U', selected: boolean): RenderTexture {
    if (selected) return this.textures.get('selected')!;

    const key = gender === 'M' ? 'male' : gender === 'F' ? 'female' : 'unknown';
    return this.textures.get(key)!;
  }

  destroy() {
    for (const texture of this.textures.values()) {
      texture.destroy(true);
    }
    this.textures.clear();
  }
}
```

**Updated NodeSprite:**

```typescript
// Using Sprite instead of Graphics for better batching
import { Sprite } from 'pixi.js';

export function NodeSprite({ node, textureManager, scale, onSelect, onHover }) {
  const { person, selected } = node;

  // Get pre-rendered texture based on state
  const texture = textureManager.getTexture(person.gender, selected);

  return (
    <pixiSprite
      texture={texture}
      x={node.x}
      y={node.y}
      eventMode="static"
      cursor="pointer"
      cullable={true}
      onPointerDown={() => onSelect?.(node.id)}
      onPointerEnter={() => onHover?.(node.id)}
      onPointerLeave={() => onHover?.(null)}
    >
      {/* Text children remain the same */}
    </pixiSprite>
  );
}
```

#### Tinting for Color Variants

For even better batching, use a single white texture and tint at runtime:

```typescript
// Single base texture with runtime tinting
const baseTexture = createWhiteNodeTexture();

// Apply tint based on gender
<pixiSprite
  texture={baseTexture}
  tint={person.gender === 'M' ? 0x3b82f6 : person.gender === 'F' ? 0xec4899 : 0x6b7280}
/>
```

#### ParticleContainer for Extreme Scale (1M+ nodes)

For massive trees, PixiJS v8's ParticleContainer is 5x faster:

```typescript
import { ParticleContainer, Particle } from 'pixi.js';

const container = new ParticleContainer({
  dynamicProperties: {
    position: true,
    rotation: false,
    color: false,
    scale: false,
  },
});

// Add particles for each node
for (const node of nodes) {
  const particle = new Particle({
    texture: nodeTexture,
    x: node.x,
    y: node.y,
    color: getColorForNode(node),
  });
  container.addParticle(particle);
}
```

**Tradeoff:** Particles can't have children, filters, or masks - use only for extreme scale requirements.

---

### 3. BitmapText for Text Rendering

#### Why BitmapText?

Regular Text re-renders canvas on every change. BitmapText uses pre-rendered font atlas:

| Metric              | Text | BitmapText | Improvement |
| ------------------- | ---- | ---------- | ----------- |
| Text change         | ~5ms | ~0.05ms    | 100x faster |
| Memory per instance | High | Shared     | 50% less    |
| Batching            | Poor | Excellent  | Better FPS  |

#### Implementation

**Initialize Bitmap Fonts:**

```typescript
// packages/tree-viz/src/pixi/fonts/initFonts.ts
import { BitmapFont } from 'pixi.js';

export function initializeBitmapFonts() {
  // Name font (shown at medium and full LOD)
  BitmapFont.install({
    name: 'personName',
    style: {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 13,
      fontWeight: '600',
      fill: 0xffffff,
    },
    chars: [
      ['a', 'z'], ['A', 'Z'], ['0', '9'],
      ' ', '-', '.', ',', "'", '(', ')'
    ],
    resolution: 2,
    padding: 4,
  });

  // Date font (full LOD only)
  BitmapFont.install({
    name: 'personDates',
    style: {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 10,
      fill: 0xcccccc,
    },
    chars: [['0', '9'], ' ', '-', 'c', '.'],
    resolution: 2,
  });

  // Location font (full LOD only)
  BitmapFont.install({
    name: 'personLocation',
    style: {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 9,
      fill: 0x999999,
    },
    chars: [
      ['a', 'z'], ['A', 'Z'], ['0', '9'],
      ' ', ',', '.', '-', "'", '(', ')'
    ],
    resolution: 2,
  });
}

export function cleanupBitmapFonts() {
  BitmapFont.uninstall('personName');
  BitmapFont.uninstall('personDates');
  BitmapFont.uninstall('personLocation');
}
```

**Updated NodeSprite with BitmapText:**

```typescript
// packages/tree-viz/src/pixi/components/NodeSprite.tsx
import { BitmapText } from 'pixi.js';

export function NodeSprite({ node, scale, onSelect, onHover }) {
  const { x, y, width, height, person, selected, highlighted } = node;
  const lod = getDetailLevel(scale);

  return (
    <pixiContainer
      x={x}
      y={y}
      eventMode="static"
      cursor="pointer"
      cullable={true}
      onPointerDown={() => onSelect?.(node.id)}
      onPointerEnter={() => onHover?.(node.id)}
      onPointerLeave={() => onHover?.(null)}
    >
      <pixiGraphics draw={drawBackground} />

      {/* Name - BitmapText for performance */}
      {lod !== 'minimal' && (
        <pixiBitmapText
          text={person.name}
          style={{ fontFamily: 'personName', fontSize: lod === 'full' ? 13 : 11 }}
          x={width / 2}
          y={lod === 'full' ? 18 : height / 2}
          anchor={{ x: 0.5, y: lod === 'full' ? 0 : 0.5 }}
        />
      )}

      {/* Dates - only at full LOD */}
      {lod === 'full' && dates && (
        <pixiBitmapText
          text={dates}
          style={{ fontFamily: 'personDates', fontSize: 10 }}
          x={width / 2}
          y={38}
          anchor={{ x: 0.5, y: 0 }}
        />
      )}

      {/* Location - only at full LOD */}
      {lod === 'full' && person.birthLocation && (
        <pixiBitmapText
          text={truncateLocation(person.birthLocation)}
          style={{ fontFamily: 'personLocation', fontSize: 9 }}
          x={width / 2}
          y={height - 10}
          anchor={{ x: 0.5, y: 1 }}
        />
      )}
    </pixiContainer>
  );
}
```

#### Limitations to Consider

| Feature         | Regular Text | BitmapText   |
| --------------- | ------------ | ------------ |
| Drop shadows    | ✓            | ✗            |
| Gradients       | ✓            | ✗            |
| Word wrap       | ✓            | Manual       |
| CJK characters  | ✓            | Impractical  |
| Scaling quality | Excellent    | Can pixelate |

**Workaround for Word Wrap:**

```typescript
// Manual word wrap for BitmapText
function wrapText(text: string, maxWidth: number, fontSize: number): string {
  const charWidth = fontSize * 0.6; // Approximate
  const maxChars = Math.floor(maxWidth / charWidth);

  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 3) + '...';
}
```

---

### Performance Impact Summary

| Optimization      | Impact                           | Complexity | Priority |
| ----------------- | -------------------------------- | ---------- | -------- |
| Web Workers       | UI responsiveness for >10k nodes | Medium     | High     |
| Texture Atlas     | 3-4x render speed                | Low        | Medium   |
| BitmapText        | 100x text update speed           | Low        | Medium   |
| ParticleContainer | 5x for 1M+ nodes                 | High       | Low      |

### Implementation Order

1. **Current:** PixiJS v8 + R-Tree culling + LOD (✅ Done)
2. **Next:** BitmapText for text rendering (easy win)
3. **Then:** Texture atlas for node backgrounds
4. **When needed:** Web Worker layout (for trees >10k nodes)
5. **Extreme scale:** ParticleContainer (1M+ nodes)

---

## References

- [PixiJS v8 Documentation](https://pixijs.com/8.x/guides)
- [PixiJS React v8](https://react.pixijs.io/)
- [PixiJS v8 Culling API](https://www.richardfu.net/optimizing-rendering-with-pixijs-v8-a-deep-dive-into-the-new-culling-api/)
- [PixiJS Performance Tips](https://pixijs.com/8.x/guides/concepts/performance-tips)
- [rbush R-Tree](https://github.com/mourner/rbush)
- [WebGPU Renderer](https://pixijs.download/dev/docs/rendering.WebGPURenderer.html)
- [Vite Web Workers Guide](https://vite.dev/guide/features)
- [Comlink Library](https://github.com/GoogleChromeLabs/comlink)
- [PixiJS Textures Guide](https://pixijs.com/8.x/guides/components/textures)
- [PixiJS RenderTexture API](https://pixijs.download/v8.8.1/docs/rendering.RenderTexture.html)
- [PixiJS ParticleContainer](https://pixijs.com/8.x/guides/components/scene-objects/particle-container)
- [PixiJS BitmapText API](https://pixijs.download/dev/docs/scene.BitmapText.html)
- [PixiJS BitmapFont API](https://pixijs.download/dev/docs/text.BitmapFont.html)
- [PixiJS Cache As Texture](https://pixijs.com/8.x/guides/components/scene-objects/container/cache-as-texture)
- [PixiJS Garbage Collection](https://pixijs.com/8.x/guides/concepts/garbage-collection)
