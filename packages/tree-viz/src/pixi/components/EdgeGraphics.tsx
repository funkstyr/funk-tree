import { useCallback } from "react";
import type { Graphics as PixiGraphics } from "pixi.js";
import type { TreeEdge, Point } from "../../core/data/types";

interface EdgeGraphicsProps {
  edges: TreeEdge[];
}

const EDGE_COLORS = {
  "parent-child": 0x4b5563,
  spouse: 0x9333ea,
};

export function EdgeGraphics({ edges }: EdgeGraphicsProps) {
  const drawEdges = useCallback(
    (g: PixiGraphics) => {
      g.clear();

      for (const edge of edges) {
        const color = EDGE_COLORS[edge.type];
        const lineWidth = edge.type === "spouse" ? 2 : 1.5;

        if (edge.points.length < 2) continue;

        if (edge.type === "spouse") {
          // Dashed line for spouses
          drawDashedLine(g, edge.points, color, lineWidth);
        } else {
          // Smooth bezier curve for parent-child
          drawBezierPath(g, edge.points, color, lineWidth);
        }
      }
    },
    [edges]
  );

  return <pixiGraphics draw={drawEdges} />;
}

function drawBezierPath(
  g: PixiGraphics,
  points: Point[],
  color: number,
  width: number
): void {
  if (points.length < 2) return;

  g.moveTo(points[0].x, points[0].y);

  if (points.length === 2) {
    // Simple line
    g.lineTo(points[1].x, points[1].y);
  } else if (points.length === 4) {
    // Use cubic bezier for smoother curves
    g.bezierCurveTo(
      points[1].x,
      points[1].y,
      points[2].x,
      points[2].y,
      points[3].x,
      points[3].y
    );
  } else {
    // Fallback: connect points with quadratic curves
    for (let i = 1; i < points.length - 1; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];

      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;

      g.quadraticCurveTo(p1.x, p1.y, midX, midY);
    }
    // Connect to last point
    const last = points[points.length - 1];
    g.lineTo(last.x, last.y);
  }

  g.stroke({ color, width });
}

function drawDashedLine(
  g: PixiGraphics,
  points: Point[],
  color: number,
  width: number,
  dashLength = 6,
  gapLength = 4
): void {
  if (points.length < 2) return;

  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];

    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) continue;

    const segments = Math.floor(distance / (dashLength + gapLength));
    const unitX = dx / distance;
    const unitY = dy / distance;

    for (let j = 0; j < segments; j++) {
      const startDist = j * (dashLength + gapLength);
      const endDist = startDist + dashLength;

      g.moveTo(p0.x + unitX * startDist, p0.y + unitY * startDist);
      g.lineTo(p0.x + unitX * endDist, p0.y + unitY * endDist);
    }

    // Draw remaining segment if any
    const remainingStart = segments * (dashLength + gapLength);
    if (remainingStart < distance) {
      const remainingEnd = Math.min(remainingStart + dashLength, distance);
      g.moveTo(p0.x + unitX * remainingStart, p0.y + unitY * remainingStart);
      g.lineTo(p0.x + unitX * remainingEnd, p0.y + unitY * remainingEnd);
    }
  }

  g.stroke({ color, width });
}
