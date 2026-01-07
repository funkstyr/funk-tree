import { createServerConfig } from "@funk-tree/config/vitest";

export default createServerConfig({
  name: "tree-viz",
  coverageExclude: [
    "src/pixi/**", // Exclude PixiJS components (need browser environment)
    "src/react/**", // Exclude React components (need jsdom + PixiJS)
    "src/hooks/**", // Exclude hooks
  ],
});
