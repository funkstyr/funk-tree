// Core types
export type {
  Person,
  Relationship,
  TreeNode,
  TreeEdge,
  TreeState,
  Bounds,
  Point,
  Viewport,
  LayoutConfig,
} from "./core/data/types";
export { DEFAULT_LAYOUT_CONFIG } from "./core/data/types";

// Data transformation
export { buildTreeState, transformPerson, type RawPerson } from "./core/data/transform";

// Layout
export { computeLayout } from "./core/layout/generation-layout";

// Spatial index
export { SpatialIndex } from "./core/spatial/rtree";

// React components
export { FamilyTree, type FamilyTreeProps } from "./react/FamilyTree";
export {
  FamilyTreeWithWorker,
  type FamilyTreeWithWorkerProps,
} from "./react/FamilyTreeWithWorker";

// PixiJS components (for advanced usage)
export { TreeStage } from "./pixi/components/TreeStage";
export { NodeSprite } from "./pixi/components/NodeSprite";
export { EdgeGraphics } from "./pixi/components/EdgeGraphics";
export { TreeContent } from "./pixi/components/TreeContent";
export { OptimizedNodeSprite } from "./pixi/components/OptimizedNodeSprite";

// Hooks
export { useViewport, type UseViewportOptions } from "./pixi/hooks/useViewport";
export { useLayoutWorker } from "./hooks/useLayoutWorker";
export { useNodeTextures } from "./pixi/hooks/useNodeTextures";

// Texture management (for advanced usage)
export { NodeTextureManager } from "./pixi/textures/NodeTextureManager";

// Font utilities (for advanced usage)
export {
  initializeBitmapFonts,
  cleanupBitmapFonts,
  areFontsInitialized,
} from "./pixi/fonts/initFonts";
