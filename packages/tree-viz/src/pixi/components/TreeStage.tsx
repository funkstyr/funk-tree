import { Application } from "@pixi/react";
import { type ReactNode } from "react";

// Import extend to register components
import "../extend";

interface TreeStageProps {
  children: ReactNode;
  width: number;
  height: number;
  backgroundColor?: number;
}

export function TreeStage({
  children,
  width,
  height,
  backgroundColor = 0x1a1a2e,
}: TreeStageProps) {
  return (
    <Application
      width={width}
      height={height}
      antialias={true}
      resolution={typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1}
      autoDensity={true}
      backgroundColor={backgroundColor}
      preference="webgpu"
      powerPreference="high-performance"
    >
      {children}
    </Application>
  );
}
