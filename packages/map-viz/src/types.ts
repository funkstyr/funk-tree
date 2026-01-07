export interface GeocodedLocation {
  id: number;
  rawLocation: string;
  latitude: number;
  longitude: number;
  normalizedName: string;
  country: string | null;
  state: string | null;
  city: string | null;
}

export interface MapPerson {
  wikiId: string;
  name: string | null;
  birthYear: number | null;
  gender: "M" | "F" | "U" | string | null;
}

export interface MapPoint {
  id: string;
  latitude: number;
  longitude: number;
  locationName: string;
  state?: string | null;
  city?: string | null;
  personCount: number;
  persons: MapPerson[];
  yearRange: [number, number];
}

export interface MigrationMapProps {
  points: MapPoint[];
  selectedYear?: number;
  onPointSelect?: (point: MapPoint | null) => void;
  onPointHover?: (point: MapPoint | null) => void;
  className?: string;
}

export interface TimeSliderProps {
  minYear: number;
  maxYear: number;
  value: number;
  onChange: (year: number) => void;
  isPlaying?: boolean;
  onPlayPause?: () => void;
}

export interface MapData {
  points: MapPoint[];
  yearRange: [number, number];
  totalPersons: number;
}
