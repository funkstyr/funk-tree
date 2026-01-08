import { db } from "@funk-tree/db";
import { persons, relationships, locations } from "@funk-tree/db/schema";
import { parseYear } from "@funk-tree/regex";
import { z } from "zod";
import { and, eq, ilike, or, sql, isNotNull } from "drizzle-orm";

import { publicProcedure } from "../index";
import { notFound, withDatabaseErrorHandling } from "../errors";

// Get a single person by wiki ID
export const getPerson = publicProcedure
  .input(z.object({ wikiId: z.string().min(1) }))
  .handler(async ({ input }) => {
    return withDatabaseErrorHandling("getPerson", async () => {
      const person = await db
        .select()
        .from(persons)
        .where(eq(persons.wikiId, input.wikiId))
        .limit(1);

      if (!person[0]) {
        throw notFound("Person", input.wikiId);
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
        .where(or(eq(persons.fatherWikiId, input.wikiId), eq(persons.motherWikiId, input.wikiId)));

      // Get spouses from relationships
      const spouseRels = await db
        .select()
        .from(relationships)
        .where(
          and(
            eq(relationships.personId, person[0].id),
            eq(relationships.relationshipType, "spouse"),
          ),
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
    });
  });

// Get descendants tree with depth limit and pagination
export const getDescendants = publicProcedure
  .input(
    z.object({
      wikiId: z.string().min(1),
      depth: z.number().min(1).max(10).default(3),
      limit: z.number().min(1).max(500).default(100),
      offset: z.number().min(0).default(0),
    }),
  )
  .handler(async ({ input }) => {
    return withDatabaseErrorHandling("getDescendants", async () => {
      // CTE for recursive traversal
      const cteQuery = sql`
        WITH RECURSIVE descendants AS (
          SELECT
            id, wiki_id, name, first_name, middle_name,
            last_name_birth, last_name_current, suffix, gender,
            birth_date, death_date, birth_location, death_location,
            is_living, generation, father_wiki_id, mother_wiki_id,
            0 as tree_depth
          FROM persons
          WHERE wiki_id = ${input.wikiId}

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
          WHERE d.tree_depth < ${input.depth}
        )
      `;

      // Get paginated results and total count in parallel
      const [result, countResult] = await Promise.all([
        db.execute(sql`
          ${cteQuery}
          SELECT * FROM descendants
          ORDER BY tree_depth, name
          LIMIT ${input.limit} OFFSET ${input.offset}
        `),
        db.execute(sql`
          ${cteQuery}
          SELECT COUNT(*) as count FROM descendants
        `),
      ]);

      const total = Number(countResult.rows[0]?.count ?? 0);

      return {
        results: result.rows,
        total,
        limit: input.limit,
        offset: input.offset,
      };
    });
  });

// Get ancestors tree with depth limit and pagination
export const getAncestors = publicProcedure
  .input(
    z.object({
      wikiId: z.string().min(1),
      depth: z.number().min(1).max(10).default(3),
      limit: z.number().min(1).max(500).default(100),
      offset: z.number().min(0).default(0),
    }),
  )
  .handler(async ({ input }) => {
    return withDatabaseErrorHandling("getAncestors", async () => {
      // CTE for recursive traversal
      const cteQuery = sql`
        WITH RECURSIVE ancestors AS (
          SELECT
            id, wiki_id, name, first_name, middle_name,
            last_name_birth, last_name_current, suffix, gender,
            birth_date, death_date, birth_location, death_location,
            is_living, generation, father_wiki_id, mother_wiki_id,
            0 as tree_depth
          FROM persons
          WHERE wiki_id = ${input.wikiId}

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
          WHERE a.tree_depth < ${input.depth}
        )
      `;

      // Get paginated results and total count in parallel
      const [result, countResult] = await Promise.all([
        db.execute(sql`
          ${cteQuery}
          SELECT * FROM ancestors
          ORDER BY tree_depth, name
          LIMIT ${input.limit} OFFSET ${input.offset}
        `),
        db.execute(sql`
          ${cteQuery}
          SELECT COUNT(*) as count FROM ancestors
        `),
      ]);

      const total = Number(countResult.rows[0]?.count ?? 0);

      return {
        results: result.rows,
        total,
        limit: input.limit,
        offset: input.offset,
      };
    });
  });

// Search persons with filters
export const searchPersons = publicProcedure
  .input(
    z.object({
      query: z.string().min(1).optional(),
      location: z.string().min(1).optional(),
      birthYearFrom: z.number().optional(),
      birthYearTo: z.number().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }),
  )
  .handler(async ({ input }) => {
    return withDatabaseErrorHandling("searchPersons", async () => {
      const conditions = [];

      if (input.query) {
        const searchTerm = `%${input.query}%`;
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

      if (input.location) {
        const locationTerm = `%${input.location}%`;
        conditions.push(
          or(
            ilike(persons.birthLocation, locationTerm),
            ilike(persons.deathLocation, locationTerm),
          ),
        );
      }

      // Build the query
      let query = db.select().from(persons);

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      const results = await query.limit(input.limit).offset(input.offset).orderBy(persons.name);

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
        limit: input.limit,
        offset: input.offset,
      };
    });
  });

// Get statistics about the database
export const getStats = publicProcedure.handler(async () => {
  return withDatabaseErrorHandling("getStats", async () => {
    const [personCount, relationshipCount] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(persons),
      db.select({ count: sql<number>`count(*)` }).from(relationships),
    ]);

    return {
      totalPersons: Number(personCount[0]?.count || 0),
      totalRelationships: Number(relationshipCount[0]?.count || 0),
    };
  });
});

// Get map data with geocoded birth locations
export const getMapData = publicProcedure
  .input(
    z.object({
      minYear: z.number().optional(),
      maxYear: z.number().optional(),
    }),
  )
  .handler(async ({ input }) => {
    return withDatabaseErrorHandling("getMapData", async () => {
      // Join persons with locations using normalized keys for reliable matching
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
        .innerJoin(locations, eq(persons.birthLocationKey, locations.locationKey))
        .where(and(isNotNull(locations.latitude), isNotNull(locations.longitude)));

      // Parse years and filter if needed
      const personsWithYears = result.map((row) => ({
        ...row,
        birthYear: parseYear(row.birthDate),
      }));

      // Apply year filters
      let filtered = personsWithYears;
      if (input.minYear !== undefined) {
        const minYear = input.minYear;
        filtered = filtered.filter((p) => p.birthYear === null || p.birthYear >= minYear);
      }
      if (input.maxYear !== undefined) {
        const maxYear = input.maxYear;
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
      const allYears = filtered
        .map((p) => p.birthYear)
        .filter((year): year is number => year !== null);
      const yearRange: [number, number] =
        allYears.length > 0 ? [Math.min(...allYears), Math.max(...allYears)] : [1700, 1900];

      return {
        points: Array.from(byLocation.values()),
        yearRange,
        totalPersons: filtered.length,
      };
    });
  });

// Get geocoding progress status
export const getGeocodingStatus = publicProcedure.handler(async () => {
  return withDatabaseErrorHandling("getGeocodingStatus", async () => {
    // Count unique birth location keys in persons
    const uniqueLocationsResult = await db.execute(sql`
      SELECT COUNT(DISTINCT birth_location_key) as count
      FROM persons
      WHERE birth_location_key IS NOT NULL
    `);
    const totalLocations = Number(uniqueLocationsResult.rows[0]?.count || 0);

    // Count geocoded locations
    const geocodedResult = await db.select({ count: sql<number>`count(*)` }).from(locations);
    const geocodedLocations = Number(geocodedResult[0]?.count || 0);

    // Count persons with geocoded birth locations (using key-based join)
    const personsWithCoordsResult = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM persons p
      INNER JOIN locations l ON p.birth_location_key = l.location_key
      WHERE l.latitude IS NOT NULL
    `);
    const personsWithCoords = Number(personsWithCoordsResult.rows[0]?.count || 0);

    // Total persons with birth locations
    const totalPersonsResult = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM persons
      WHERE birth_location_key IS NOT NULL
    `);
    const totalPersonsWithLocation = Number(totalPersonsResult.rows[0]?.count || 0);

    return {
      totalLocations,
      geocodedLocations,
      percentComplete: totalLocations > 0 ? (geocodedLocations / totalLocations) * 100 : 0,
      personsWithCoords,
      totalPersonsWithLocation,
    };
  });
});

// Export genealogy router
export const genealogyRouter = {
  getPerson,
  getDescendants,
  getAncestors,
  searchPersons,
  getStats,
  getMapData,
  getGeocodingStatus,
};
