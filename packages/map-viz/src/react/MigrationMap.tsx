import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import type { MigrationMapProps, MapPoint } from "../types";

const USA_TOPO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

// Color scale for time-based visualization
const getMarkerColor = (birthYear: number | null, selectedYear?: number): string => {
  if (birthYear === null) return "#6b7280"; // gray for unknown
  if (selectedYear === undefined) return "#3b82f6"; // blue default

  // Fade based on how recent relative to selected year
  const yearsAgo = selectedYear - birthYear;
  if (yearsAgo < 0) return "#6b7280"; // future = gray (shouldn't show)
  if (yearsAgo < 20) return "#22c55e"; // recent = green
  if (yearsAgo < 50) return "#3b82f6"; // medium = blue
  return "#8b5cf6"; // older = purple
};

export function MigrationMap({
  points,
  selectedYear,
  onPointSelect,
  onPointHover,
  className,
}: MigrationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  // ResizeObserver for responsive sizing
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setDimensions({ width, height });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Filter points by selected year (show births up to selected year)
  const visiblePoints = useMemo(() => {
    if (selectedYear === undefined) return points;
    return points.filter((p) => p.yearRange[0] <= selectedYear);
  }, [points, selectedYear]);

  // Calculate marker radius based on person count (sqrt for visual scaling)
  const getMarkerRadius = useCallback((count: number): number => {
    return Math.max(4, Math.min(20, Math.sqrt(count) * 3));
  }, []);

  // Handle marker click
  const handleMarkerClick = useCallback(
    (point: MapPoint) => {
      onPointSelect?.(point);
    },
    [onPointSelect],
  );

  // Handle marker hover
  const handleMarkerEnter = useCallback(
    (point: MapPoint) => {
      onPointHover?.(point);
    },
    [onPointHover],
  );

  const handleMarkerLeave = useCallback(() => {
    onPointHover?.(null);
  }, [onPointHover]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", height: "100%", background: "#111827" }}
    >
      <ComposableMap
        projection="geoAlbersUsa"
        width={dimensions.width}
        height={dimensions.height}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup>
          {/* USA States */}
          <Geographies geography={USA_TOPO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="#1f2937"
                  stroke="#374151"
                  strokeWidth={0.5}
                  style={{
                    default: { outline: "none" },
                    hover: { fill: "#374151", outline: "none" },
                    pressed: { outline: "none" },
                  }}
                />
              ))
            }
          </Geographies>

          {/* Location Markers */}
          {visiblePoints.map((point) => {
            const radius = getMarkerRadius(point.personCount);
            const color = getMarkerColor(point.yearRange[0], selectedYear);

            return (
              <Marker
                key={point.id}
                coordinates={[point.longitude, point.latitude]}
                onClick={() => handleMarkerClick(point)}
                onMouseEnter={() => handleMarkerEnter(point)}
                onMouseLeave={handleMarkerLeave}
              >
                <circle
                  r={radius}
                  fill={color}
                  fillOpacity={0.7}
                  stroke="#ffffff"
                  strokeWidth={1}
                  style={{ cursor: "pointer" }}
                />
                {/* Show count for larger clusters */}
                {point.personCount > 3 && (
                  <text
                    textAnchor="middle"
                    y={4}
                    style={{
                      fontFamily: "system-ui, sans-serif",
                      fontSize: Math.max(8, radius * 0.8),
                      fill: "#ffffff",
                      fontWeight: "bold",
                      pointerEvents: "none",
                    }}
                  >
                    {point.personCount}
                  </text>
                )}
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>
    </div>
  );
}
