# Custom Family Tree Visualization Package

## Problem Statement

With 7,000+ persons and growing, we need a visualization that:
- Renders smoothly at 60fps with thousands of nodes
- Only renders what's visible (virtualization)
- Supports family-specific layouts (spouses side-by-side, generations in rows)
- Works with React 19 and TypeScript

## Rendering Technology Comparison

| Approach | Max Nodes | Complexity | Best For |
|----------|-----------|------------|----------|
| SVG (D3/visx) | ~1,000 | Low | Small trees, print quality |
| Canvas 2D | ~10,000 | Medium | Medium trees, good balance |
| WebGL (PixiJS) | 100,000+ | High | Massive datasets |
| WebGPU (PixiJS v8) | 1M+ | High | Future-proof, best perf |

**Recommendation**: Start with **Canvas 2D + R-Tree virtualization** for simplicity, with architecture that allows upgrading to PixiJS/WebGL later.

---

## Architecture Overview

```
packages/
└── tree-viz/
    ├── src/
    │   ├── core/
    │   │   ├── layout/           # Tree layout algorithms
    │   │   │   ├── generation-layout.ts
    │   │   │   └── force-layout.ts
    │   │   ├── spatial/          # Virtualization
    │   │   │   ├── rtree.ts      # Spatial index
    │   │   │   └── viewport.ts   # Viewport management
    │   │   └── data/
    │   │       ├── tree-model.ts # Core data structures
    │   │       └── transform.ts  # DB -> viz transforms
    │   ├── renderers/
    │   │   ├── canvas/           # Canvas 2D renderer
    │   │   │   ├── renderer.ts
    │   │   │   ├── node-renderer.ts
    │   │   │   └── edge-renderer.ts
    │   │   └── pixi/             # Future: WebGL renderer
    │   ├── interaction/
    │   │   ├── pan-zoom.ts       # Pan/zoom controls
    │   │   ├── selection.ts      # Node selection
    │   │   └── hover.ts          # Hover detection
    │   └── react/
    │       ├── FamilyTree.tsx    # Main React component
    │       ├── hooks/
    │       │   ├── useViewport.ts
    │       │   ├── useLayout.ts
    │       │   └── useInteraction.ts
    │       └── context/
    │           └── TreeContext.tsx
    └── package.json
```

---

## Core Data Model

```typescript
// tree-model.ts

export interface Person {
  id: string;
  wikiId: string;
  name: string;
  birthDate?: string;
  deathDate?: string;
  gender: 'M' | 'F' | 'U';
  generation?: number;
}

export interface Relationship {
  type: 'parent' | 'child' | 'spouse';
  sourceId: string;
  targetId: string;
}

export interface TreeNode {
  person: Person;
  // Layout position (computed)
  x: number;
  y: number;
  width: number;
  height: number;
  // Relationships
  parents: string[];
  children: string[];
  spouses: string[];
  // State
  collapsed: boolean;
  selected: boolean;
  highlighted: boolean;
}

export interface TreeEdge {
  id: string;
  source: string;
  target: string;
  type: 'parent-child' | 'spouse';
  // Computed path points
  points: { x: number; y: number }[];
}

export interface TreeState {
  nodes: Map<string, TreeNode>;
  edges: Map<string, TreeEdge>;
  rootId: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}
```

---

## Virtualization with R-Tree

The key to performance is only rendering nodes visible in the viewport.

```typescript
// rtree.ts
import RBush from 'rbush';

interface SpatialItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
}

export class SpatialIndex {
  private tree: RBush<SpatialItem>;

  constructor() {
    this.tree = new RBush();
  }

  // Bulk load all nodes - O(n log n)
  load(nodes: TreeNode[]): void {
    const items = nodes.map(node => ({
      minX: node.x,
      minY: node.y,
      maxX: node.x + node.width,
      maxY: node.y + node.height,
      id: node.person.id,
    }));
    this.tree.load(items);
  }

  // Query visible nodes - O(log n + k) where k = results
  queryViewport(viewport: Viewport): string[] {
    const results = this.tree.search({
      minX: viewport.x,
      minY: viewport.y,
      maxX: viewport.x + viewport.width,
      maxY: viewport.y + viewport.height,
    });
    return results.map(r => r.id);
  }
}
```

```typescript
// viewport.ts

export interface Viewport {
  x: number;      // Top-left X in world coords
  y: number;      // Top-left Y in world coords
  width: number;  // Visible width in world coords
  height: number; // Visible height in world coords
  zoom: number;   // Scale factor (1 = 100%)
}

export class ViewportManager {
  private viewport: Viewport;
  private canvasWidth: number;
  private canvasHeight: number;

  constructor(canvasWidth: number, canvasHeight: number) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.viewport = {
      x: 0,
      y: 0,
      width: canvasWidth,
      height: canvasHeight,
      zoom: 1,
    };
  }

  // Pan by delta pixels
  pan(dx: number, dy: number): void {
    this.viewport.x -= dx / this.viewport.zoom;
    this.viewport.y -= dy / this.viewport.zoom;
  }

  // Zoom centered on a point
  zoomAt(factor: number, centerX: number, centerY: number): void {
    const worldX = this.viewport.x + centerX / this.viewport.zoom;
    const worldY = this.viewport.y + centerY / this.viewport.zoom;

    this.viewport.zoom *= factor;
    this.viewport.zoom = Math.max(0.1, Math.min(5, this.viewport.zoom));

    this.viewport.x = worldX - centerX / this.viewport.zoom;
    this.viewport.y = worldY - centerY / this.viewport.zoom;

    this.viewport.width = this.canvasWidth / this.viewport.zoom;
    this.viewport.height = this.canvasHeight / this.viewport.zoom;
  }

  // Convert screen coords to world coords
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: this.viewport.x + screenX / this.viewport.zoom,
      y: this.viewport.y + screenY / this.viewport.zoom,
    };
  }

  // Convert world coords to screen coords
  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: (worldX - this.viewport.x) * this.viewport.zoom,
      y: (worldY - this.viewport.y) * this.viewport.zoom,
    };
  }
}
```

---

## Canvas 2D Renderer

```typescript
// renderer.ts

export interface RenderConfig {
  nodeWidth: number;
  nodeHeight: number;
  nodePadding: number;
  generationGap: number;
  siblingGap: number;
  colors: {
    male: string;
    female: string;
    unknown: string;
    selected: string;
    edge: string;
    spouseEdge: string;
  };
  fonts: {
    name: string;
    dates: string;
  };
}

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private config: RenderConfig;
  private spatialIndex: SpatialIndex;
  private viewport: ViewportManager;

  constructor(
    canvas: HTMLCanvasElement,
    config: Partial<RenderConfig> = {}
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.config = { ...defaultConfig, ...config };
    this.spatialIndex = new SpatialIndex();
    this.viewport = new ViewportManager(canvas.width, canvas.height);

    // Enable high DPI rendering
    this.setupHiDPI(canvas);
  }

  private setupHiDPI(canvas: HTMLCanvasElement): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
  }

  setData(state: TreeState): void {
    this.spatialIndex.load(Array.from(state.nodes.values()));
  }

  render(state: TreeState): void {
    const { ctx, viewport, config } = this;
    const vp = viewport.getViewport();

    // Clear canvas
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // Save state and apply viewport transform
    ctx.save();
    ctx.translate(-vp.x * vp.zoom, -vp.y * vp.zoom);
    ctx.scale(vp.zoom, vp.zoom);

    // Query visible nodes from spatial index
    const visibleIds = this.spatialIndex.queryViewport(vp);
    const visibleNodes = visibleIds.map(id => state.nodes.get(id)!);

    // Collect edges for visible nodes
    const visibleEdges = this.getVisibleEdges(state, visibleIds);

    // Render edges first (below nodes)
    for (const edge of visibleEdges) {
      this.renderEdge(edge);
    }

    // Render nodes
    for (const node of visibleNodes) {
      this.renderNode(node);
    }

    ctx.restore();

    // Debug: show stats
    if (process.env.NODE_ENV === 'development') {
      this.renderDebugInfo(state.nodes.size, visibleNodes.length);
    }
  }

  private renderNode(node: TreeNode): void {
    const { ctx, config } = this;
    const { x, y, width, height, person, selected, highlighted } = node;

    // Background
    ctx.fillStyle = selected
      ? config.colors.selected
      : person.gender === 'M'
        ? config.colors.male
        : person.gender === 'F'
          ? config.colors.female
          : config.colors.unknown;

    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 8);
    ctx.fill();

    // Border for highlighted
    if (highlighted) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Name
    ctx.fillStyle = '#fff';
    ctx.font = config.fonts.name;
    ctx.textAlign = 'center';
    ctx.fillText(person.name, x + width / 2, y + 24, width - 16);

    // Dates
    if (person.birthDate || person.deathDate) {
      ctx.font = config.fonts.dates;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      const dates = [person.birthDate, person.deathDate]
        .filter(Boolean)
        .join(' - ');
      ctx.fillText(dates, x + width / 2, y + 42, width - 16);
    }
  }

  private renderEdge(edge: TreeEdge): void {
    const { ctx, config } = this;
    const { points, type } = edge;

    ctx.strokeStyle = type === 'spouse'
      ? config.colors.spouseEdge
      : config.colors.edge;
    ctx.lineWidth = type === 'spouse' ? 2 : 1.5;

    if (type === 'spouse') {
      ctx.setLineDash([5, 5]);
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    // Use bezier curves for smooth edges
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const midY = (p0.y + p1.y) / 2;
      ctx.bezierCurveTo(p0.x, midY, p1.x, midY, p1.x, p1.y);
    }

    ctx.stroke();
    ctx.setLineDash([]);
  }

  private renderDebugInfo(total: number, visible: number): void {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(10, 10, 200, 50);
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Total: ${total} | Visible: ${visible}`, 20, 30);
    ctx.fillText(`Culled: ${((1 - visible/total) * 100).toFixed(1)}%`, 20, 48);
  }
}
```

---

## Generation-Based Layout Algorithm

Family trees work best with a generation-based layout where:
- Each generation is a horizontal row
- Spouses are placed side-by-side
- Children are centered below their parents

```typescript
// generation-layout.ts

export interface LayoutConfig {
  nodeWidth: number;
  nodeHeight: number;
  horizontalGap: number;  // Gap between siblings
  verticalGap: number;    // Gap between generations
  spouseGap: number;      // Gap between spouses
}

export function computeLayout(
  tree: TreeState,
  config: LayoutConfig
): TreeState {
  const { nodes, rootId } = tree;
  const root = nodes.get(rootId)!;

  // Step 1: Assign generations (BFS from root)
  const generations = assignGenerations(nodes, rootId);

  // Step 2: Group nodes by generation
  const genGroups = new Map<number, TreeNode[]>();
  for (const node of nodes.values()) {
    const gen = generations.get(node.person.id) || 0;
    if (!genGroups.has(gen)) genGroups.set(gen, []);
    genGroups.get(gen)!.push(node);
  }

  // Step 3: Sort within generations (keep families together)
  for (const [gen, group] of genGroups) {
    sortGeneration(group, nodes);
  }

  // Step 4: Assign X positions within each generation
  let maxWidth = 0;
  for (const [gen, group] of genGroups) {
    let x = 0;
    for (let i = 0; i < group.length; i++) {
      const node = group[i];
      node.x = x;
      node.y = gen * (config.nodeHeight + config.verticalGap);
      node.width = config.nodeWidth;
      node.height = config.nodeHeight;

      // Check if next node is spouse
      const nextNode = group[i + 1];
      const isSpouse = nextNode &&
        node.spouses.includes(nextNode.person.id);

      x += config.nodeWidth + (isSpouse ? config.spouseGap : config.horizontalGap);
    }
    maxWidth = Math.max(maxWidth, x);
  }

  // Step 5: Center children under parents
  centerChildrenUnderParents(genGroups, nodes, config);

  // Step 6: Compute edges
  const edges = computeEdges(nodes, config);

  // Step 7: Compute bounds
  const bounds = computeBounds(nodes);

  return { ...tree, edges, bounds };
}

function assignGenerations(
  nodes: Map<string, TreeNode>,
  rootId: string
): Map<string, number> {
  const generations = new Map<string, number>();
  const queue: [string, number][] = [[rootId, 0]];

  while (queue.length > 0) {
    const [id, gen] = queue.shift()!;
    if (generations.has(id)) continue;

    generations.set(id, gen);
    const node = nodes.get(id);
    if (!node) continue;

    // Children are next generation
    for (const childId of node.children) {
      if (!generations.has(childId)) {
        queue.push([childId, gen + 1]);
      }
    }

    // Parents are previous generation
    for (const parentId of node.parents) {
      if (!generations.has(parentId)) {
        queue.push([parentId, gen - 1]);
      }
    }
  }

  // Normalize so minimum generation is 0
  const minGen = Math.min(...generations.values());
  for (const [id, gen] of generations) {
    generations.set(id, gen - minGen);
  }

  return generations;
}
```

---

## React Component

```typescript
// FamilyTree.tsx
import { useRef, useEffect, useCallback, useState } from 'react';
import { CanvasRenderer } from '../renderers/canvas/renderer';
import { computeLayout } from '../core/layout/generation-layout';
import type { Person, TreeState } from '../core/data/tree-model';

interface FamilyTreeProps {
  persons: Person[];
  relationships: Relationship[];
  rootId: string;
  onPersonClick?: (person: Person) => void;
  onPersonHover?: (person: Person | null) => void;
  className?: string;
}

export function FamilyTree({
  persons,
  relationships,
  rootId,
  onPersonClick,
  onPersonHover,
  className,
}: FamilyTreeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const [treeState, setTreeState] = useState<TreeState | null>(null);
  const rafRef = useRef<number>(0);

  // Initialize renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    rendererRef.current = new CanvasRenderer(canvas);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Process data and compute layout
  useEffect(() => {
    const state = buildTreeState(persons, relationships, rootId);
    const laidOut = computeLayout(state, defaultLayoutConfig);
    setTreeState(laidOut);

    if (rendererRef.current) {
      rendererRef.current.setData(laidOut);
    }
  }, [persons, relationships, rootId]);

  // Render loop
  useEffect(() => {
    if (!treeState || !rendererRef.current) return;

    const render = () => {
      rendererRef.current!.render(treeState);
      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);

    return () => cancelAnimationFrame(rafRef.current);
  }, [treeState]);

  // Pan/zoom handlers
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const renderer = rendererRef.current;
    if (!renderer) return;

    if (e.ctrlKey || e.metaKey) {
      // Zoom
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      renderer.viewport.zoomAt(factor, e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    } else {
      // Pan
      renderer.viewport.pan(e.deltaX, e.deltaY);
    }
  }, []);

  // Drag to pan
  const [isDragging, setIsDragging] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) {
      // Hover detection
      const renderer = rendererRef.current;
      if (renderer && treeState) {
        const worldPos = renderer.viewport.screenToWorld(
          e.nativeEvent.offsetX,
          e.nativeEvent.offsetY
        );
        const hoveredNode = findNodeAtPosition(treeState, worldPos);
        onPersonHover?.(hoveredNode?.person || null);
      }
      return;
    }

    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };

    rendererRef.current?.viewport.pan(dx, dy);
  }, [isDragging, treeState, onPersonHover]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const renderer = rendererRef.current;
    if (!renderer || !treeState) return;

    const worldPos = renderer.viewport.screenToWorld(
      e.nativeEvent.offsetX,
      e.nativeEvent.offsetY
    );
    const clickedNode = findNodeAtPosition(treeState, worldPos);
    if (clickedNode) {
      onPersonClick?.(clickedNode.person);
    }
  }, [treeState, onPersonClick]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: '100%', height: '100%', cursor: isDragging ? 'grabbing' : 'grab' }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
    />
  );
}
```

---

## Performance Optimizations

### 1. Dirty Rectangle Rendering
Only redraw changed regions:

```typescript
class DirtyRegionTracker {
  private dirtyRects: Set<string> = new Set();

  markDirty(nodeId: string): void {
    this.dirtyRects.add(nodeId);
  }

  getDirtyRegion(): Rect | null {
    // Compute bounding box of all dirty nodes
  }

  clear(): void {
    this.dirtyRects.clear();
  }
}
```

### 2. Level of Detail (LOD)
Render less detail when zoomed out:

```typescript
function getDetailLevel(zoom: number): 'full' | 'medium' | 'low' {
  if (zoom > 0.7) return 'full';
  if (zoom > 0.3) return 'medium';
  return 'low';
}

function renderNode(node: TreeNode, lod: DetailLevel): void {
  if (lod === 'low') {
    // Just render colored rectangle
    ctx.fillRect(x, y, width, height);
  } else if (lod === 'medium') {
    // Rectangle + name only
    ctx.fillRect(x, y, width, height);
    ctx.fillText(name, ...);
  } else {
    // Full details: name, dates, photo
  }
}
```

### 3. Worker Thread Layout
Compute layout in a Web Worker:

```typescript
// layout.worker.ts
self.onmessage = (e: MessageEvent<{ persons: Person[], relationships: Relationship[] }>) => {
  const { persons, relationships } = e.data;
  const state = buildTreeState(persons, relationships);
  const layout = computeLayout(state);
  self.postMessage(layout);
};

// In component
const worker = new Worker(new URL('./layout.worker.ts', import.meta.url));
worker.postMessage({ persons, relationships });
worker.onmessage = (e) => setTreeState(e.data);
```

### 4. Offscreen Canvas for Static Elements
Pre-render unchanging elements:

```typescript
const offscreenCanvas = new OffscreenCanvas(width, height);
const offscreenCtx = offscreenCanvas.getContext('2d');

// Render all edges once (they rarely change)
renderAllEdges(offscreenCtx, edges);

// In main render loop, just blit the offscreen canvas
ctx.drawImage(offscreenCanvas, 0, 0);
// Then render interactive nodes on top
renderNodes(ctx, visibleNodes);
```

---

## Future: WebGL with PixiJS

When Canvas 2D performance becomes insufficient:

```typescript
// pixi-renderer.ts
import { Application, Container, Graphics, Text } from 'pixi.js';

export class PixiRenderer {
  private app: Application;
  private nodesContainer: Container;
  private edgesContainer: Container;
  private nodeSprites: Map<string, Container> = new Map();

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.app = new Application();
    await this.app.init({
      canvas,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio,
    });

    this.edgesContainer = new Container();
    this.nodesContainer = new Container();
    this.app.stage.addChild(this.edgesContainer, this.nodesContainer);
  }

  setData(state: TreeState): void {
    // Create sprites for all nodes (PixiJS handles GPU batching)
    for (const node of state.nodes.values()) {
      const sprite = this.createNodeSprite(node);
      this.nodeSprites.set(node.person.id, sprite);
      this.nodesContainer.addChild(sprite);
    }
  }

  private createNodeSprite(node: TreeNode): Container {
    const container = new Container();
    container.position.set(node.x, node.y);

    const bg = new Graphics()
      .roundRect(0, 0, node.width, node.height, 8)
      .fill(this.getColor(node));

    const text = new Text({
      text: node.person.name,
      style: { fill: 'white', fontSize: 14 },
    });
    text.anchor.set(0.5, 0);
    text.position.set(node.width / 2, 8);

    container.addChild(bg, text);

    // Enable culling - PixiJS won't render offscreen
    container.cullable = true;

    return container;
  }

  updateViewport(viewport: Viewport): void {
    this.app.stage.position.set(-viewport.x, -viewport.y);
    this.app.stage.scale.set(viewport.zoom);
  }
}
```

---

## Dependencies

```json
{
  "dependencies": {
    "rbush": "^4.0.1"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  },
  "optionalDependencies": {
    "pixi.js": "^8.6.0",
    "@pixi/react": "^8.0.0"
  }
}
```

---

## Implementation Steps

1. **Create package scaffold** - Set up `packages/tree-viz` with TypeScript config
2. **Implement core data model** - TreeNode, TreeEdge, TreeState types
3. **Build spatial index** - R-Tree wrapper with viewport queries
4. **Create viewport manager** - Pan, zoom, coordinate transforms
5. **Implement generation layout** - Assign positions to all nodes
6. **Build Canvas renderer** - Node and edge rendering with virtualization
7. **Create React component** - Wire up interactions and state
8. **Add performance optimizations** - LOD, dirty rects, worker layout
9. **Integrate with app** - Replace react-d3-tree with custom component

---

## References

- [rbush](https://github.com/mourner/rbush) - R-Tree spatial index
- [PixiJS React v8](https://pixijs.com/blog/pixi-react-v8-live) - WebGL rendering
- [vis-tree](https://github.com/bytedance/vis-tree) - ByteDance's virtualized tree
- [Canvas Performance](https://developer.chrome.com/blog/canvas-performance) - Chrome optimization guide
- [D3 Hierarchy](https://d3js.org/d3-hierarchy) - Layout algorithm reference
