import { extend } from "@pixi/react";
import { Container, Graphics, Text, Sprite } from "pixi.js";

// Register PixiJS components with @pixi/react
// This must be called before using any pixi-react components
extend({
  Container,
  Graphics,
  Text,
  Sprite,
});

// Re-export for convenience
export { Container, Graphics, Text, Sprite };
