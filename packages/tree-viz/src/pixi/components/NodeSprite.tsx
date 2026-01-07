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

  // Truncate name for display (BitmapText doesn't support word wrap)
  const displayName = useMemo(() => {
    return truncateText(person.name, width - 16, lod === "full" ? 13 : 11);
  }, [person.name, width, lod]);

  // Truncate location for display
  const displayLocation = useMemo(() => {
    if (!person.birthLocation) return "";
    return truncateText(person.birthLocation, width - 16, 9);
  }, [person.birthLocation, width]);

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

      {/* Name - BitmapText for performance (shown at medium and full LOD) */}
      {lod !== "minimal" && (
        <pixiBitmapText
          text={displayName}
          x={width / 2}
          y={lod === "full" ? 18 : height / 2}
          anchor={{ x: 0.5, y: lod === "full" ? 0 : 0.5 }}
          style={{
            fontFamily: lod === "full" ? "personName" : "personNameSmall",
            fontSize: lod === "full" ? 13 : 11,
          }}
        />
      )}

      {/* Dates - BitmapText (only at full LOD) */}
      {lod === "full" && dates && (
        <pixiBitmapText
          text={dates}
          x={width / 2}
          y={38}
          anchor={{ x: 0.5, y: 0 }}
          style={{
            fontFamily: "personDates",
            fontSize: 10,
          }}
        />
      )}

      {/* Location - BitmapText (only at full LOD) */}
      {lod === "full" && displayLocation && (
        <pixiBitmapText
          text={displayLocation}
          x={width / 2}
          y={height - 10}
          anchor={{ x: 0.5, y: 1 }}
          style={{
            fontFamily: "personLocation",
            fontSize: 9,
          }}
        />
      )}
    </pixiContainer>
  );
}

/**
 * Truncate text to fit within a given width.
 * Uses approximate character width calculation.
 */
function truncateText(text: string, maxWidth: number, fontSize: number): string {
  // Approximate character width (varies by font, this is a rough estimate)
  const avgCharWidth = fontSize * 0.55;
  const maxChars = Math.floor(maxWidth / avgCharWidth);

  if (text.length <= maxChars) return text;
  if (maxChars <= 3) return text.slice(0, maxChars);
  return text.slice(0, maxChars - 3) + "...";
}
