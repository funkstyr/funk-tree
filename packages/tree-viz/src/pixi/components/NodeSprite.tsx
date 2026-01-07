import { useCallback, useMemo } from "react";
import type { Graphics as PixiGraphics } from "pixi.js";
import type { TreeNode } from "../../core/data/types";

interface NodeSpriteProps {
  node: TreeNode;
  scale: number;
  onSelect?: (nodeId: string) => void;
  onHover?: (nodeId: string | null) => void;
}

const COLORS = {
  male: 0x3b82f6,
  female: 0xec4899,
  unknown: 0x6b7280,
  selected: 0xfbbf24,
  highlighted: 0x60a5fa,
};

type DetailLevel = "full" | "medium" | "minimal";

function getDetailLevel(scale: number): DetailLevel {
  if (scale > 0.6) return "full";
  if (scale > 0.25) return "medium";
  return "minimal";
}

export function NodeSprite({
  node,
  scale,
  onSelect,
  onHover,
}: NodeSpriteProps) {
  const { x, y, width, height, person, selected, highlighted } = node;
  const lod = getDetailLevel(scale);

  const fillColor = useMemo(() => {
    if (selected) return COLORS.selected;
    if (person.gender === "M") return COLORS.male;
    if (person.gender === "F") return COLORS.female;
    return COLORS.unknown;
  }, [selected, person.gender]);

  const drawBackground = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      g.roundRect(0, 0, width, height, 8);
      g.fill({ color: fillColor });

      if (highlighted) {
        g.stroke({ color: COLORS.highlighted, width: 3 });
      }
    },
    [width, height, fillColor, highlighted]
  );

  const dates = useMemo(() => {
    return [person.birthDate, person.deathDate].filter(Boolean).join(" - ");
  }, [person.birthDate, person.deathDate]);

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

      {/* Name - shown at medium and full LOD */}
      {lod !== "minimal" && (
        <pixiText
          text={person.name}
          x={width / 2}
          y={lod === "full" ? 18 : height / 2}
          anchor={{ x: 0.5, y: lod === "full" ? 0 : 0.5 }}
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: lod === "full" ? 13 : 11,
            fontWeight: "600",
            fill: 0xffffff,
            wordWrap: true,
            wordWrapWidth: width - 16,
            align: "center",
          }}
        />
      )}

      {/* Dates - only at full LOD */}
      {lod === "full" && dates && (
        <pixiText
          text={dates}
          x={width / 2}
          y={38}
          anchor={{ x: 0.5, y: 0 }}
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 10,
            fill: 0xcccccc,
            align: "center",
          }}
        />
      )}

      {/* Location - only at full LOD */}
      {lod === "full" && person.birthLocation && (
        <pixiText
          text={truncateLocation(person.birthLocation)}
          x={width / 2}
          y={height - 10}
          anchor={{ x: 0.5, y: 1 }}
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 9,
            fill: 0x999999,
            align: "center",
          }}
        />
      )}
    </pixiContainer>
  );
}

function truncateLocation(location: string, maxLength = 30): string {
  if (location.length <= maxLength) return location;
  return location.slice(0, maxLength - 3) + "...";
}
