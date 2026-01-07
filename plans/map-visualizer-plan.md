# Map Visualizer: Migration Pattern Visualization

## Overview

An interactive map showing birth places of Funk family members over time, visualizing migration patterns across the USA. The feature will be accessible at `/map` following similar patterns to the existing `/tree` page.

## Current State Assessment

### What Exists

| Component          | Status              | Details                                                                 |
| ------------------ | ------------------- | ----------------------------------------------------------------------- |
| Location text data | Available           | `persons.birthLocation` and `persons.deathLocation` as raw text strings |
| Locations table    | Schema ready        | Has `latitude`, `longitude`, `country`, `state`, `city` fields          |
| Geocoding          | **Not implemented** | Locations table is defined but empty - no geocoding service integrated  |
| API endpoints      | Partial             | `searchPersons` has location filter, but no dedicated location queries  |
| Indexes            | Ready               | `idx_persons_birth_location` for fast filtering                         |

### Key Gap: Geocoding

The locations table infrastructure exists but is dormant:

```typescript
// packages/db/src/schema/genealogy.ts (lines 86-100)
export const locations = pgTable("locations", {
  rawLocation: text("raw_location").unique().notNull(),  // e.g., "Philadelphia, Pennsylvania"
  latitude: real("latitude"),         // NOT POPULATED
  longitude: real("longitude"),       // NOT POPULATED
  normalizedName: text("normalized_name"),
  country: text("country"),
  state: text("state"),
  city: text("city"),
  geocodedAt: timestamp("geocoded_at"),
});
```

WikiTree provides location data as raw text strings only - no coordinates.

---

## Technical Research: Mapping Libraries

### Recommended: react-simple-maps

| Criteria        | react-simple-maps               | react-map-gl      | React Leaflet   |
| --------------- | ------------------------------- | ----------------- | --------------- |
| Bundle size     | ~50KB                           | ~200KB+           | ~150KB          |
| Tile server     | None needed (SVG)               | Mapbox required   | OpenStreetMap   |
| Offline capable | Yes                             | No                | Partial         |
| Animation       | via react-spring                | Built-in          | Limited         |
| TypeScript      | Good                            | Excellent         | Good            |
| Learning curve  | Low                             | Medium            | Medium          |
| Cost            | Free                            | Mapbox pricing    | Free            |
| Best for        | Static geography + data overlay | Interactive tiles | General purpose |

**Why react-simple-maps:**

- SVG-based, no external tile service required
- Thin wrapper around d3-geo and topojson
- Integrates well with react-spring for animations
- Perfect for showing data points on USA map
- Simpler than tile-based solutions for our use case (fixed geography)

### Alternative: deck.gl (for future scale)

If we need WebGL performance for 100k+ points, deck.gl provides:

- ScatterplotLayer for location markers
- ArcLayer for migration paths
- Automatic clustering
- Can overlay on react-map-gl

---

## Architecture

### Package Structure

```
packages/
└── map-viz/                          # New package (following tree-viz pattern)
    ├── src/
    │   ├── components/
    │   │   ├── USAMap.tsx            # Base USA geography
    │   │   ├── LocationMarker.tsx    # Birth location dot
    │   │   ├── MigrationArc.tsx      # Optional: parent->child migration lines
    │   │   ├── TimeSlider.tsx        # Year range control
    │   │   ├── Legend.tsx            # Color/size legend
    │   │   └── MapTooltip.tsx        # Hover info
    │   ├── hooks/
    │   │   ├── useMapData.ts         # Data fetching + transformation
    │   │   ├── useTimeFilter.ts      # Year range state
    │   │   └── useProjection.ts      # d3-geo projection utilities
    │   ├── data/
    │   │   ├── usa-topojson.ts       # USA geography data
    │   │   └── transform.ts          # Person -> MapPoint conversion
    │   ├── types.ts
    │   └── index.ts
    └── package.json
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Data Pipeline                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  WikiTree API ──► Crawler ──► persons.birthLocation (raw text)      │
│                                       │                              │
│                     ┌─────────────────┘                              │
│                     ▼                                                │
│           Geocoding Service (NEW)                                    │
│              • Mapbox / Google / Nominatim                           │
│              • Batch process unique locations                        │
│                     │                                                │
│                     ▼                                                │
│           locations table (lat/lng populated)                        │
│                     │                                                │
│                     ▼                                                │
│           API Endpoint: getLocationData()                            │
│              • Join persons + locations                              │
│              • Filter by year range                                  │
│              • Aggregate by location                                 │
│                     │                                                │
│                     ▼                                                │
│           Map Component                                              │
│              • Plot markers by coordinates                           │
│              • Animate through time                                  │
│              • Show clustering                                       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Core Types

```typescript
// packages/map-viz/src/types.ts

export interface GeocodedLocation {
  id: number;
  rawLocation: string;
  latitude: number;
  longitude: number;
  normalizedName: string;
  country: string;
  state: string;
  city: string;
}

export interface MapPerson {
  wikiId: string;
  name: string;
  birthYear: number | null;      // Parsed from birthDate
  deathYear: number | null;
  birthLocation: GeocodedLocation | null;
  gender: 'M' | 'F' | 'U';
  generation: number;
}

export interface MapPoint {
  id: string;                    // Location ID or aggregation key
  latitude: number;
  longitude: number;
  locationName: string;
  personCount: number;           // For clustering/sizing
  persons: MapPerson[];          // People at this location
  yearRange: [number, number];   // Min/max birth years
}

export interface MapState {
  points: MapPoint[];
  yearRange: [number, number];   // Current filter
  selectedPoint: MapPoint | null;
  hoveredPoint: MapPoint | null;
  zoom: number;
  center: [number, number];      // [longitude, latitude]
}
```

---

## Implementation Plan

### Phase 1: Geocoding Infrastructure (Backend)

#### 1.1 Create Geocoding Service

```typescript
// packages/db/src/services/geocoding.ts

import { db } from '../index';
import { locations, persons } from '../schema/genealogy';
import { eq, isNull, sql } from 'drizzle-orm';

interface GeocodeResult {
  latitude: number;
  longitude: number;
  normalizedName: string;
  country: string;
  state: string;
  city: string;
}

// Use Nominatim (free) or Mapbox (paid, more reliable)
async function geocodeLocation(rawLocation: string): Promise<GeocodeResult | null> {
  // Implementation depends on chosen service
  // Rate limit: Nominatim = 1 req/sec, Mapbox = 600 req/min
}

export async function populateLocations() {
  // 1. Get unique locations from persons
  const uniqueLocations = await db
    .selectDistinct({ location: persons.birthLocation })
    .from(persons)
    .where(sql`${persons.birthLocation} IS NOT NULL`);

  // 2. Filter out already geocoded
  const existing = await db.select({ raw: locations.rawLocation }).from(locations);
  const existingSet = new Set(existing.map(e => e.raw));
  const toGeocode = uniqueLocations.filter(l => !existingSet.has(l.location));

  // 3. Geocode with rate limiting
  for (const { location } of toGeocode) {
    const result = await geocodeLocation(location);
    if (result) {
      await db.insert(locations).values({
        rawLocation: location,
        ...result,
        geocodedAt: new Date(),
      });
    }
    await sleep(1100); // Respect rate limits
  }
}
```

#### 1.2 Add Geocoding Command

```typescript
// apps/crawler/src/geocode.ts
// New command: bun run geocode
```

#### 1.3 Database Schema Updates (if needed)

Add foreign key relationship or create view:

```sql
-- Option A: Add locationId to persons
ALTER TABLE persons ADD COLUMN birth_location_id INTEGER REFERENCES locations(id);

-- Option B: Create a view (simpler, no migration)
CREATE VIEW persons_with_coordinates AS
SELECT p.*, l.latitude, l.longitude, l.state, l.city
FROM persons p
LEFT JOIN locations l ON p.birth_location = l.raw_location;
```

### Phase 2: API Endpoints

#### 2.1 New Location Endpoints

```typescript
// packages/api/src/routers/genealogy.ts

// Get all persons with coordinates for map
getMapData: publicProcedure
  .input(z.object({
    minYear: z.number().optional(),
    maxYear: z.number().optional(),
  }))
  .query(async ({ input }) => {
    // Join persons with locations, filter by year
    // Aggregate by location for clustering
  }),

// Get location statistics
getLocationStats: publicProcedure
  .query(async () => {
    // Count persons per state/city
    // Return aggregated data for heatmap
  }),

// Get geocoding status
getGeocodingStatus: publicProcedure
  .query(async () => {
    const total = await db.select({ count: sql`count(*)` })
      .from(sql`(SELECT DISTINCT birth_location FROM persons WHERE birth_location IS NOT NULL)`);
    const geocoded = await db.select({ count: sql`count(*)` }).from(locations);
    return {
      totalLocations: total[0].count,
      geocodedLocations: geocoded[0].count,
      percentComplete: (geocoded[0].count / total[0].count) * 100,
    };
  }),
```

### Phase 3: Map Visualization Package

#### 3.1 Package Setup

```json
// packages/map-viz/package.json
{
  "name": "@funk-tree/map-viz",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "react-simple-maps": "^3.0.0",
    "d3-geo": "^3.1.0",
    "topojson-client": "^3.1.0"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/d3-geo": "^3.0.0",
    "@types/topojson-client": "^3.1.0",
    "typescript": "^5.7.0"
  }
}
```

#### 3.2 Core Map Component

```typescript
// packages/map-viz/src/components/USAMap.tsx
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps';

interface USAMapProps {
  points: MapPoint[];
  onPointClick?: (point: MapPoint) => void;
  onPointHover?: (point: MapPoint | null) => void;
  selectedYear?: number;
  className?: string;
}

const USA_TOPOJSON = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

export function USAMap({ points, onPointClick, onPointHover, selectedYear }: USAMapProps) {
  // Filter points by year if provided
  const visiblePoints = selectedYear
    ? points.filter(p => p.yearRange[0] <= selectedYear && p.yearRange[1] >= selectedYear)
    : points;

  return (
    <ComposableMap projection="geoAlbersUsa">
      <ZoomableGroup>
        <Geographies geography={USA_TOPOJSON}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="#1f2937"
                stroke="#374151"
                strokeWidth={0.5}
              />
            ))
          }
        </Geographies>

        {visiblePoints.map((point) => (
          <Marker
            key={point.id}
            coordinates={[point.longitude, point.latitude]}
            onClick={() => onPointClick?.(point)}
            onMouseEnter={() => onPointHover?.(point)}
            onMouseLeave={() => onPointHover?.(null)}
          >
            <circle
              r={Math.sqrt(point.personCount) * 3}
              fill="#3b82f6"
              fillOpacity={0.7}
              stroke="#fff"
              strokeWidth={1}
            />
          </Marker>
        ))}
      </ZoomableGroup>
    </ComposableMap>
  );
}
```

#### 3.3 Time Slider Component

```typescript
// packages/map-viz/src/components/TimeSlider.tsx
interface TimeSliderProps {
  minYear: number;
  maxYear: number;
  value: number;
  onChange: (year: number) => void;
  isPlaying: boolean;
  onPlayPause: () => void;
}

export function TimeSlider({ minYear, maxYear, value, onChange, isPlaying, onPlayPause }: TimeSliderProps) {
  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-gray-800 rounded-lg">
      <button onClick={onPlayPause} className="p-2 hover:bg-gray-700 rounded">
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>
      <input
        type="range"
        min={minYear}
        max={maxYear}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1"
      />
      <span className="text-white font-mono w-16">{value}</span>
    </div>
  );
}
```

### Phase 4: Web App Integration

#### 4.1 Route Setup

```typescript
// apps/web/src/routes/map.tsx
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { USAMap, TimeSlider } from '@funk-tree/map-viz';

export const Route = createFileRoute('/map')({
  component: MapPage,
});

function MapPage() {
  const { orpc } = Route.useRouteContext();
  const [selectedYear, setSelectedYear] = useState(1750);
  const [isPlaying, setIsPlaying] = useState(false);

  const { data, isLoading } = useQuery(
    orpc.genealogy.getMapData.queryOptions({
      input: {},
    }),
  );

  // Auto-play animation
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setSelectedYear((y) => (y >= 1900 ? 1700 : y + 10));
    }, 500);
    return () => clearInterval(interval);
  }, [isPlaying]);

  if (isLoading) return <MapSkeleton />;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-800 px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-100">Migration Map</h1>
        <p className="text-sm text-gray-400">Birth locations of Funk family members over time</p>
      </div>

      <div className="flex-1 relative">
        <USAMap
          points={data?.points ?? []}
          selectedYear={selectedYear}
          onPointClick={handlePointClick}
        />

        <div className="absolute bottom-4 left-4 right-4">
          <TimeSlider
            minYear={1700}
            maxYear={1900}
            value={selectedYear}
            onChange={setSelectedYear}
            isPlaying={isPlaying}
            onPlayPause={() => setIsPlaying(!isPlaying)}
          />
        </div>
      </div>
    </div>
  );
}
```

#### 4.2 Navigation Update

```typescript
// apps/web/src/components/header.tsx
const links = [
  { to: "/", label: "Home" },
  { to: "/tree", label: "Tree" },
  { to: "/map", label: "Map" },       // Add this
  { to: "/search", label: "Search" },
  { to: "/dashboard", label: "Dashboard" },
];
```

---

## Data Considerations

### Expected Data Volume

Based on WikiTree Funk family data:

- ~2,000-5,000 persons in tree
- ~500-1,000 unique birth locations
- Primarily Pennsylvania, Virginia, Ohio, Indiana migration pattern

### Geocoding Strategy

| Service                | Pros                      | Cons                                          | Cost                  |
| ---------------------- | ------------------------- | --------------------------------------------- | --------------------- |
| **Nominatim (OSM)**    | Free, no API key          | 1 req/sec limit, less accurate for historical | Free                  |
| **Mapbox**             | Fast, accurate, batch API | Requires account                              | Free tier: 100k/month |
| **Google Geocoding**   | Most accurate             | Expensive at scale                            | $5/1000 requests      |
| **Photon (OSM-based)** | Self-hostable, free       | Setup required                                | Free                  |

**Recommendation:** Start with Nominatim for MVP, upgrade to Mapbox if accuracy issues arise.

### Historical Location Challenges

1. **Place name changes**: "Germantown" might not geocode to correct area
2. **Vague locations**: "Pennsylvania" vs "Philadelphia, Pennsylvania"
3. **Non-US locations**: German Palatinate origins before immigration

**Mitigation:**

- Add state/country fallbacks for vague locations
- Create manual override table for known historical places
- Focus on post-immigration (USA) data initially

---

## UI/UX Design

### Core Features

1. **USA Map View**
   - AlbersUSA projection (optimized for continental US)
   - State boundaries visible
   - Dots sized by person count at location
   - Color coded by time period or generation

2. **Time Animation**
   - Slider from ~1700 to ~1950
   - Play/pause button for auto-advance
   - Shows cumulative births up to selected year

3. **Location Details**
   - Click/hover shows person list
   - Links to individual tree view
   - Shows birth year range at location

4. **Filters**
   - By generation
   - By surname variant
   - By gender

### Visual Design

```
┌──────────────────────────────────────────────────────────────────┐
│  Migration Map                                        [Filters ▼]│
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│                         ┌─────────────────┐                      │
│                     ┌───┤                 │                      │
│                     │   │     •  •        │                      │
│                     │   │   ••••  •       │                      │
│               ┌─────┘   │  ••••••         │                      │
│               │         │    ••           │                      │
│               │         └─────────────────┘                      │
│               │              USA MAP                             │
│               │                                                  │
│               └──────────────────────────────────────────────    │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  [▶]  ════════════●══════════════════════════════════  1785      │
│       1700                                            1900       │
└──────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### MVP (Phase 1)

- [ ] Geocoding service integration (Nominatim)
- [ ] Populate locations table
- [ ] Basic API endpoint for map data
- [ ] Static USA map with all birth locations
- [ ] Simple time slider (no animation)
- [ ] Basic `/map` route

### Enhancement (Phase 2)

- [ ] Play/pause time animation
- [ ] Location clustering for dense areas
- [ ] Click to show persons at location
- [ ] Link to tree view from map

### Full (Phase 3)

- [ ] Migration paths (arcs between parent/child locations)
- [ ] State-level heatmap view
- [ ] Filter by generation/surname
- [ ] Export map as image
- [ ] Improved geocoding accuracy

---

## Dependencies

### New Packages

```bash
# map-viz package
bun add react-simple-maps d3-geo topojson-client
bun add -D @types/d3-geo @types/topojson-client
```

### Optional Animation

```bash
# For smooth time transitions
bun add react-spring
```

---

## Open Questions

1. **Geocoding service**: Start with free Nominatim or invest in Mapbox?
2. **Historical accuracy**: How to handle pre-immigration European locations?
3. **Performance**: Need clustering for 1000+ points at same zoom level?
4. **Scope**: USA only or world map for European origins?

---

## References

- [react-simple-maps Documentation](https://www.react-simple-maps.io/)
- [LogRocket: React map library comparison](https://blog.logrocket.com/react-map-library-comparison/)
- [Retool: Best React map libraries 2024](https://retool.com/blog/react-map-library)
- [US Atlas TopoJSON](https://github.com/topojson/us-atlas)
- [Nominatim API](https://nominatim.org/release-docs/latest/api/Search/)
- [d3-geo Projections](https://github.com/d3/d3-geo)
