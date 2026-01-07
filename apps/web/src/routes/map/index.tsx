import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { MigrationMap, TimeSlider } from "@funk-tree/map-viz/react";
import type { MapPoint } from "@funk-tree/map-viz";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocalDb } from "@/hooks/use-local-db";
import { getMapData } from "@/hooks/local-queries";

export const Route = createFileRoute("/map/")({
  component: MapPage,
});

function MapPage() {
  const navigate = useNavigate();
  const { db, status: dbStatus, error: dbError } = useLocalDb();

  const [selectedYear, setSelectedYear] = useState(1800);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<MapPoint | null>(null);

  // Use local database for map data
  const { data, isLoading, error } = useQuery({
    queryKey: ["local", "mapData"],
    queryFn: async () => {
      if (!db) throw new Error("Database not ready");
      return getMapData(db);
    },
    enabled: dbStatus === "ready" && db !== null,
  });

  // Initialize selected year to the middle of the range
  useEffect(() => {
    if (data?.yearRange) {
      const [min, max] = data.yearRange;
      setSelectedYear(Math.round((min + max) / 2));
    }
  }, [data?.yearRange]);

  // Auto-play animation
  useEffect(() => {
    if (!isPlaying || !data?.yearRange) return;

    const [min, max] = data.yearRange;
    const interval = setInterval(() => {
      setSelectedYear((y) => {
        if (y >= max) return min;
        return y + 5;
      });
    }, 300);

    return () => clearInterval(interval);
  }, [isPlaying, data?.yearRange]);

  const handlePointSelect = useCallback(
    (point: MapPoint | null) => {
      if (point && point.persons.length === 1) {
        // Single person - navigate to their tree
        navigate({ to: "/tree/$wikiId", params: { wikiId: point.persons[0].wikiId } });
      }
      // For multiple persons, could show a modal/sidebar in the future
    },
    [navigate],
  );

  const handlePointHover = useCallback((point: MapPoint | null) => {
    setHoveredPoint(point);
  }, []);

  // Show loading state for database or query
  if (dbStatus !== "ready" && dbStatus !== "error") {
    const statusMessage =
      {
        idle: "Initializing...",
        checking: "Checking local database...",
        fetching: "Downloading database...",
        loading: "Loading database...",
      }[dbStatus] || "Loading...";

    return (
      <div className="flex h-full flex-col gap-4 p-8">
        <Skeleton className="h-8 w-64" />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="animate-pulse text-lg text-gray-300">{statusMessage}</div>
            <p className="text-sm text-gray-500 mt-2">This may take a moment on first load</p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-4 p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  if (dbError || error) {
    const errorMsg = dbError?.message || error?.message || "Unknown error";
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-red-400">Error loading map data</h2>
          <p className="text-gray-400">{errorMsg}</p>
          <p className="text-sm text-gray-500 mt-4">
            Make sure the database export exists at{" "}
            <code className="bg-gray-800 px-2 py-1 rounded">/data/funk-tree.tar.gz</code>
          </p>
        </div>
      </div>
    );
  }

  const points = data?.points ?? [];
  const yearRange = data?.yearRange ?? [1700, 1900];
  const totalPersons = data?.totalPersons ?? 0;

  // Show message if no data
  if (points.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-gray-800 px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-100">Migration Map</h1>
          <p className="text-sm text-gray-400">Birth locations of Funk family members over time</p>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center max-w-md">
            <h2 className="text-xl font-semibold text-gray-300 mb-2">No Location Data Yet</h2>
            <p className="text-gray-400 mb-4">
              Birth locations need to be geocoded before they can appear on the map.
            </p>
            <p className="text-sm text-gray-500">
              Run <code className="bg-gray-800 px-2 py-1 rounded">bun run crawl:geocode</code> to
              populate location coordinates.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-100">Migration Map</h1>
        <p className="text-sm text-gray-400">
          Birth locations of {totalPersons} Funk family members ({points.length} locations)
        </p>
      </div>

      {/* Map Container */}
      <div className="relative flex-1 overflow-hidden">
        <MigrationMap
          points={points}
          selectedYear={selectedYear}
          onPointSelect={handlePointSelect}
          onPointHover={handlePointHover}
          className="h-full w-full"
        />

        {/* Tooltip for hovered point */}
        {hoveredPoint && (
          <div className="absolute top-4 right-4 bg-gray-800/95 backdrop-blur rounded-lg p-4 shadow-xl max-w-xs">
            <h3 className="font-semibold text-gray-100">{hoveredPoint.locationName}</h3>
            <p className="text-sm text-gray-400 mt-1">
              {hoveredPoint.personCount} {hoveredPoint.personCount === 1 ? "person" : "people"}
            </p>
            {hoveredPoint.yearRange[0] !== 9999 && (
              <p className="text-sm text-gray-400">
                {hoveredPoint.yearRange[0] === hoveredPoint.yearRange[1]
                  ? `Born ${hoveredPoint.yearRange[0]}`
                  : `Born ${hoveredPoint.yearRange[0]} - ${hoveredPoint.yearRange[1]}`}
              </p>
            )}
            {hoveredPoint.persons.length <= 5 && (
              <ul className="mt-2 text-sm text-gray-300">
                {hoveredPoint.persons.map((p) => (
                  <li key={p.wikiId}>
                    {p.name || "Unknown"} {p.birthYear ? `(${p.birthYear})` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Time Slider */}
        <div className="absolute bottom-4 left-4 right-4">
          <TimeSlider
            minYear={yearRange[0]}
            maxYear={yearRange[1]}
            value={selectedYear}
            onChange={setSelectedYear}
            isPlaying={isPlaying}
            onPlayPause={() => setIsPlaying(!isPlaying)}
          />
        </div>

        {/* Legend */}
        <div className="absolute top-4 left-4 bg-gray-800/90 backdrop-blur rounded-lg px-3 py-2 text-xs">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-gray-300">Recent ({"<"}20 years)</span>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-gray-300">Medium (20-50 years)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-purple-500" />
            <span className="text-gray-300">Older ({">"}50 years)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
