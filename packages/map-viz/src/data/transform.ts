import type { MapPoint, MapPerson } from "../types";
import { parseYear } from "@funk-tree/regex";

// Re-export for backwards compatibility
export { parseYear };

interface RawPersonWithLocation {
  wikiId: string;
  name: string | null;
  birthDate: string | null;
  gender: string | null;
  latitude: number;
  longitude: number;
  locationName: string;
}

/**
 * Transform raw person data into MapPoints grouped by location
 */
export function transformToMapPoints(data: RawPersonWithLocation[]): MapPoint[] {
  const byLocation = new Map<string, MapPoint>();

  for (const row of data) {
    const key = `${row.latitude},${row.longitude}`;
    const birthYear = parseYear(row.birthDate);

    if (!byLocation.has(key)) {
      byLocation.set(key, {
        id: key,
        latitude: row.latitude,
        longitude: row.longitude,
        locationName: row.locationName,
        personCount: 0,
        persons: [],
        yearRange: [birthYear ?? 9999, birthYear ?? 0],
      });
    }

    const point = byLocation.get(key);
    if (!point) continue;
    point.personCount++;

    const person: MapPerson = {
      wikiId: row.wikiId,
      name: row.name,
      birthYear,
      gender: row.gender === "Male" ? "M" : row.gender === "Female" ? "F" : "U",
    };
    point.persons.push(person);

    if (birthYear !== null) {
      point.yearRange = [
        Math.min(point.yearRange[0], birthYear),
        Math.max(point.yearRange[1], birthYear),
      ];
    }
  }

  return Array.from(byLocation.values());
}
