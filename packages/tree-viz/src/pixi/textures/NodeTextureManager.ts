import { Graphics, RenderTexture, type Renderer } from "pixi.js";

export interface NodeTextureConfig {
  width: number;
  height: number;
  cornerRadius: number;
}

export interface NodeTextureColors {
  male: number;
  female: number;
  unknown: number;
  selected: number;
}

const DEFAULT_COLORS: NodeTextureColors = {
  male: 0x3b82f6,
  female: 0xec4899,
  unknown: 0x6b7280,
  selected: 0xfbbf24,
};

type TextureKey = "male" | "female" | "unknown" | "selected" | "base";

/**
 * Manages pre-rendered node textures for efficient sprite batching.
 * Pre-renders node backgrounds to RenderTextures so they can be used
 * with Sprites instead of Graphics for better GPU batching.
 */
export class NodeTextureManager {
  private textures = new Map<TextureKey, RenderTexture>();
  private initialized = false;
  private config: NodeTextureConfig;
  private colors: NodeTextureColors;

  constructor(
    config: NodeTextureConfig,
    colors: NodeTextureColors = DEFAULT_COLORS
  ) {
    this.config = config;
    this.colors = colors;
  }

  /**
   * Initialize all node textures. Must be called after renderer is ready.
   */
  initialize(renderer: Renderer): void {
    if (this.initialized) return;

    const { width, height, cornerRadius } = this.config;
    const resolution = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    // Create base white texture for tinting approach
    this.textures.set("base", this.createNodeTexture(
      renderer,
      width,
      height,
      cornerRadius,
      0xffffff,
      resolution
    ));

    // Create colored textures for each state
    for (const [key, color] of Object.entries(this.colors)) {
      this.textures.set(
        key as TextureKey,
        this.createNodeTexture(renderer, width, height, cornerRadius, color, resolution)
      );
    }

    this.initialized = true;
  }

  private createNodeTexture(
    renderer: Renderer,
    width: number,
    height: number,
    cornerRadius: number,
    color: number,
    resolution: number
  ): RenderTexture {
    const graphics = new Graphics()
      .roundRect(0, 0, width, height, cornerRadius)
      .fill({ color });

    const texture = RenderTexture.create({
      width,
      height,
      antialias: true,
      resolution,
    });

    renderer.render({ container: graphics, target: texture });
    graphics.destroy();

    return texture;
  }

  /**
   * Get the appropriate texture for a node based on gender and selection state.
   */
  getTexture(gender: "M" | "F" | "U", selected: boolean): RenderTexture | null {
    if (!this.initialized) return null;

    if (selected) {
      return this.textures.get("selected") || null;
    }

    const key: TextureKey =
      gender === "M" ? "male" : gender === "F" ? "female" : "unknown";
    return this.textures.get(key) || null;
  }

  /**
   * Get the base white texture for use with tinting.
   * This approach allows all nodes to batch together regardless of color.
   */
  getBaseTexture(): RenderTexture | null {
    return this.textures.get("base") || null;
  }

  /**
   * Get the tint color for a node based on gender and selection state.
   */
  getTint(gender: "M" | "F" | "U", selected: boolean): number {
    if (selected) return this.colors.selected;
    if (gender === "M") return this.colors.male;
    if (gender === "F") return this.colors.female;
    return this.colors.unknown;
  }

  /**
   * Check if textures are initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Destroy all textures and clean up resources.
   */
  destroy(): void {
    for (const texture of this.textures.values()) {
      texture.destroy(true);
    }
    this.textures.clear();
    this.initialized = false;
  }
}

// Singleton instance with default config
let defaultManager: NodeTextureManager | null = null;

/**
 * Get or create the default NodeTextureManager.
 */
export function getNodeTextureManager(
  config: NodeTextureConfig = { width: 180, height: 70, cornerRadius: 8 }
): NodeTextureManager {
  if (!defaultManager) {
    defaultManager = new NodeTextureManager(config);
  }
  return defaultManager;
}

/**
 * Destroy the default NodeTextureManager.
 */
export function destroyNodeTextureManager(): void {
  if (defaultManager) {
    defaultManager.destroy();
    defaultManager = null;
  }
}
