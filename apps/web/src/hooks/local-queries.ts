/**
 * Local query functions for browser-side PGLite database.
 *
 * These mirror the API genealogy router but work directly with the local database.
 */

import type { BrowserDatabase } from "@funk-tree/db/browser";

import { persons, relationships, locations } from "@funk-tree/db/schema";
import { eq, or, ilike, and, sql, isNotNull } from "drizzle-orm";

export type Person = typeof persons.$inferSelect;

// Get a single person by wiki ID
export async function getPerson(db: BrowserDatabase, wikiId: string) {
  const person = await db.select().from(persons).where(eq(persons.wikiId, wikiId)).limit(1);

  if (!person[0]) {
    return null;
  }

  // Get parents
  const [father, mother] = await Promise.all([
    person[0].fatherWikiId
      ? db.select().from(persons).where(eq(persons.wikiId, person[0].fatherWikiId)).limit(1)
      : Promise.resolve([]),
    person[0].motherWikiId
      ? db.select().from(persons).where(eq(persons.wikiId, person[0].motherWikiId)).limit(1)
      : Promise.resolve([]),
  ]);

  // Get children
  const children = await db
    .select()
    .from(persons)
    .where(or(eq(persons.fatherWikiId, wikiId), eq(persons.motherWikiId, wikiId)));

  // Get spouses from relationships
  const spouseRels = await db
    .select()
    .from(relationships)
    .where(
      and(eq(relationships.personId, person[0].id), eq(relationships.relationshipType, "spouse")),
    );

  const spouseIds = spouseRels.map((r) => r.relatedPersonId);
  const spouses =
    spouseIds.length > 0
      ? await db.select().from(persons).where(sql`${persons.id} IN ${spouseIds}`)
      : [];

  return {
    ...person[0],
    father: father[0] || null,
    mother: mother[0] || null,
    children,
    spouses,
  };
}

// Get descendants tree with depth limit
export async function getDescendants(db: BrowserDatabase, wikiId: string, depth: number = 3) {
  const result = await db.execute(sql`
    WITH RECURSIVE descendants AS (
      SELECT
        id, wiki_id, name, first_name, middle_name,
        last_name_birth, last_name_current, suffix, gender,
        birth_date, death_date, birth_location, death_location,
        is_living, generation, father_wiki_id, mother_wiki_id,
        0 as tree_depth
      FROM persons
      WHERE wiki_id = ${wikiId}

      UNION ALL

      SELECT
        p.id, p.wiki_id, p.name, p.first_name, p.middle_name,
        p.last_name_birth, p.last_name_current, p.suffix, p.gender,
        p.birth_date, p.death_date, p.birth_location, p.death_location,
        p.is_living, p.generation, p.father_wiki_id, p.mother_wiki_id,
        d.tree_depth + 1
      FROM persons p
      INNER JOIN descendants d ON (
        p.father_wiki_id = d.wiki_id OR p.mother_wiki_id = d.wiki_id
      )
      WHERE d.tree_depth < ${depth}
    )
    SELECT * FROM descendants ORDER BY tree_depth, name
  `);

  return result.rows;
}

// Get ancestors tree with depth limit
export async function getAncestors(db: BrowserDatabase, wikiId: string, depth: number = 3) {
  const result = await db.execute(sql`
    WITH RECURSIVE ancestors AS (
      SELECT
        id, wiki_id, name, first_name, middle_name,
        last_name_birth, last_name_current, suffix, gender,
        birth_date, death_date, birth_location, death_location,
        is_living, generation, father_wiki_id, mother_wiki_id,
        0 as tree_depth
      FROM persons
      WHERE wiki_id = ${wikiId}

      UNION ALL

      SELECT
        p.id, p.wiki_id, p.name, p.first_name, p.middle_name,
        p.last_name_birth, p.last_name_current, p.suffix, p.gender,
        p.birth_date, p.death_date, p.birth_location, p.death_location,
        p.is_living, p.generation, p.father_wiki_id, p.mother_wiki_id,
        a.tree_depth + 1
      FROM persons p
      INNER JOIN ancestors a ON (
        a.father_wiki_id = p.wiki_id OR a.mother_wiki_id = p.wiki_id
      )
      WHERE a.tree_depth < ${depth}
    )
    SELECT * FROM ancestors ORDER BY tree_depth, name
  `);

  return result.rows;
}

// Search persons with filters
export async function searchPersons(
  db: BrowserDatabase,
  options: {
    query?: string;
    location?: string;
    limit?: number;
    offset?: number;
  } = {},
) {
  const { query, location, limit = 50, offset = 0 } = options;
  const conditions = [];

  if (query) {
    const searchTerm = `%${query}%`;
    conditions.push(
      or(
        ilike(persons.name, searchTerm),
        ilike(persons.firstName, searchTerm),
        ilike(persons.middleName, searchTerm),
        ilike(persons.lastNameBirth, searchTerm),
        ilike(persons.lastNameCurrent, searchTerm),
      ),
    );
  }

  if (location) {
    const locationTerm = `%${location}%`;
    conditions.push(
      or(ilike(persons.birthLocation, locationTerm), ilike(persons.deathLocation, locationTerm)),
    );
  }

  let resultsQuery = db.select().from(persons);

  if (conditions.length > 0) {
    resultsQuery = resultsQuery.where(and(...conditions)) as typeof resultsQuery;
  }

  const results = await resultsQuery.limit(limit).offset(offset).orderBy(persons.name);

  // Get total count for pagination
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(persons);

  if (conditions.length > 0) {
    countQuery = countQuery.where(and(...conditions)) as typeof countQuery;
  }

  const countResult = await countQuery;
  const total = Number(countResult[0]?.count || 0);

  return {
    results,
    total,
    limit,
    offset,
  };
}

// Get statistics about the database
export async function getStats(db: BrowserDatabase) {
  const [personCount, relationshipCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(persons),
    db.select({ count: sql<number>`count(*)` }).from(relationships),
  ]);

  return {
    totalPersons: Number(personCount[0]?.count || 0),
    totalRelationships: Number(relationshipCount[0]?.count || 0),
  };
}

// Get map data with geocoded birth locations
export async function getMapData(
  db: BrowserDatabase,
  options: {
    minYear?: number;
    maxYear?: number;
  } = {},
) {
  const { minYear, maxYear } = options;

  // Join persons with locations on birth_location = raw_location
  const result = await db
    .select({
      wikiId: persons.wikiId,
      name: persons.name,
      firstName: persons.firstName,
      lastName: persons.lastNameBirth,
      birthDate: persons.birthDate,
      gender: persons.gender,
      latitude: locations.latitude,
      longitude: locations.longitude,
      locationName: locations.normalizedName,
      state: locations.state,
      city: locations.city,
    })
    .from(persons)
    .innerJoin(locations, eq(persons.birthLocation, locations.rawLocation))
    .where(and(isNotNull(locations.latitude), isNotNull(locations.longitude)));

  // Parse years and filter if needed
  const personsWithYears = result.map((row) => {
    const yearMatch = row.birthDate?.match(/^(\d{4})/);
    const birthYear = yearMatch?.[1] ? parseInt(yearMatch[1], 10) : null;
    return { ...row, birthYear };
  });

  // Apply year filters
  let filtered = personsWithYears;
  if (minYear !== undefined) {
    filtered = filtered.filter((p) => p.birthYear === null || p.birthYear >= minYear);
  }
  if (maxYear !== undefined) {
    filtered = filtered.filter((p) => p.birthYear === null || p.birthYear <= maxYear);
  }

  // Group by location for clustering
  const byLocation = new Map<
    string,
    {
      id: string;
      latitude: number;
      longitude: number;
      locationName: string;
      state: string | null;
      city: string | null;
      personCount: number;
      persons: Array<{
        wikiId: string;
        name: string | null;
        birthYear: number | null;
        gender: string | null;
      }>;
      yearRange: [number, number];
    }
  >();

  for (const row of filtered) {
    if (row.latitude === null || row.longitude === null) continue;

    const key = `${row.latitude},${row.longitude}`;

    if (!byLocation.has(key)) {
      byLocation.set(key, {
        id: key,
        latitude: row.latitude,
        longitude: row.longitude,
        locationName: row.locationName || row.city || row.state || "Unknown",
        state: row.state,
        city: row.city,
        personCount: 0,
        persons: [],
        yearRange: [row.birthYear ?? 9999, row.birthYear ?? 0],
      });
    }

    const point = byLocation.get(key);
    if (!point) continue;
    point.personCount++;
    point.persons.push({
      wikiId: row.wikiId,
      name: row.name || `${row.firstName || ""} ${row.lastName || ""}`.trim() || null,
      birthYear: row.birthYear,
      gender: row.gender,
    });

    if (row.birthYear !== null) {
      point.yearRange = [
        Math.min(point.yearRange[0], row.birthYear),
        Math.max(point.yearRange[1], row.birthYear),
      ];
    }
  }

  // Calculate overall year range
  const allYears = filtered.map((p) => p.birthYear).filter((year): year is number => year !== null);
  const yearRange: [number, number] =
    allYears.length > 0 ? [Math.min(...allYears), Math.max(...allYears)] : [1700, 1900];

  return {
    points: Array.from(byLocation.values()),
    yearRange,
    totalPersons: filtered.length,
  };
}
