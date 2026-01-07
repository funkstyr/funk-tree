import { useEffect, useState } from "react";
import { useApplication } from "@pixi/react";
import {
  NodeTextureManager,
  type NodeTextureConfig,
} from "../textures/NodeTextureManager";

const DEFAULT_CONFIG: NodeTextureConfig = {
  width: 180,
  height: 70,
  cornerRadius: 8,
};

/**
 * Hook to manage node texture initialization.
 * Creates and initializes the NodeTextureManager when the PixiJS application is ready.
 */
export function useNodeTextures(config: NodeTextureConfig = DEFAULT_CONFIG) {
  const { app } = useApplication();
  const [textureManager, setTextureManager] = useState<NodeTextureManager | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!app?.renderer) return;

    const manager = new NodeTextureManager(config);
    manager.initialize(app.renderer);
    setTextureManager(manager);
    setIsReady(true);

    return () => {
      manager.destroy();
      setTextureManager(null);
      setIsReady(false);
    };
  }, [app?.renderer, config.width, config.height, config.cornerRadius]);

  return { textureManager, isReady };
}
