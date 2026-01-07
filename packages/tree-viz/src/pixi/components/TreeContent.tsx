import { useMemo } from "react";
import { useApplication } from "@pixi/react";
import { OptimizedNodeSprite } from "./OptimizedNodeSprite";
import { EdgeGraphics } from "./EdgeGraphics";
import { useNodeTextures } from "../hooks/useNodeTextures";
import type { TreeNode, TreeEdge, Viewport } from "../../core/data/types";

interface TreeContentProps {
  nodes: (TreeNode & { selected: boolean; highlighted: boolean })[];
  edges: TreeEdge[];
  viewport: Viewport;
  layoutConfig: { nodeWidth: number; nodeHeight: number };
  onSelect: (nodeId: string) => void;
  onHover: (nodeId: string | null) => void;
}

/**
 * Tree content component that renders nodes and edges using optimized textures.
 * Must be used inside a PixiJS Application context.
 */
export function TreeContent({
  nodes,
  edges,
  viewport,
  layoutConfig,
  onSelect,
  onHover,
}: TreeContentProps) {
  const { app } = useApplication();
  const { textureManager, isReady } = useNodeTextures({
    width: layoutConfig.nodeWidth,
    height: layoutConfig.nodeHeight,
    cornerRadius: 8,
  });

  // Get base texture for tinting approach
  const baseTexture = useMemo(() => {
    if (!textureManager || !isReady) return null;
    return textureManager.getBaseTexture();
  }, [textureManager, isReady]);

  // Don't render until textures are ready
  if (!isReady || !baseTexture || !app) {
    return null;
  }

  return (
    <pixiContainer
      x={-viewport.x * viewport.scale}
      y={-viewport.y * viewport.scale}
      scale={viewport.scale}
    >
      {/* Edges layer (render below nodes) */}
      <pixiContainer>
        <EdgeGraphics edges={edges} />
      </pixiContainer>

      {/* Nodes layer - using optimized sprites with tinting */}
      <pixiContainer>
        {nodes.map((node) => (
          <OptimizedNodeSprite
            key={node.id}
            node={node}
            scale={viewport.scale}
            baseTexture={baseTexture}
            onSelect={onSelect}
            onHover={onHover}
          />
        ))}
      </pixiContainer>
    </pixiContainer>
  );
}
