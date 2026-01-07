import { db } from "@funk-tree/db";
import { persons, relationships } from "@funk-tree/db/schema";
import { z } from "zod";
import { and, eq, ilike, or, sql } from "drizzle-orm";

import { publicProcedure } from "../index";

// Get a single person by wiki ID
export const getPerson = publicProcedure
  .input(z.object({ wikiId: z.string() }))
  .handler(async ({ input }) => {
    const person = await db.select().from(persons).where(eq(persons.wikiId, input.wikiId)).limit(1);

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
      .where(or(eq(persons.fatherWikiId, input.wikiId), eq(persons.motherWikiId, input.wikiId)));

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
  });

// Get descendants tree with depth limit
export const getDescendants = publicProcedure
  .input(
    z.object({
      wikiId: z.string(),
      depth: z.number().min(1).max(10).default(3),
    }),
  )
  .handler(async ({ input }) => {
    // Use recursive CTE to get descendants
    const result = await db.execute(sql`
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
      SELECT * FROM descendants ORDER BY tree_depth, name
    `);

    return result.rows;
  });

// Get ancestors tree with depth limit
export const getAncestors = publicProcedure
  .input(
    z.object({
      wikiId: z.string(),
      depth: z.number().min(1).max(10).default(3),
    }),
  )
  .handler(async ({ input }) => {
    const result = await db.execute(sql`
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
      SELECT * FROM ancestors ORDER BY tree_depth, name
    `);

    return result.rows;
  });

// Search persons with filters
export const searchPersons = publicProcedure
  .input(
    z.object({
      query: z.string().optional(),
      location: z.string().optional(),
      birthYearFrom: z.number().optional(),
      birthYearTo: z.number().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }),
  )
  .handler(async ({ input }) => {
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
        or(ilike(persons.birthLocation, locationTerm), ilike(persons.deathLocation, locationTerm)),
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

// Get statistics about the database
export const getStats = publicProcedure.handler(async () => {
  const [personCount, relationshipCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(persons),
    db.select({ count: sql<number>`count(*)` }).from(relationships),
  ]);

  return {
    totalPersons: Number(personCount[0]?.count || 0),
    totalRelationships: Number(relationshipCount[0]?.count || 0),
  };
});

// Export genealogy router
export const genealogyRouter = {
  getPerson,
  getDescendants,
  getAncestors,
  searchPersons,
  getStats,
};
