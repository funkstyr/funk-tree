import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  real,
  index,
  unique,
} from "drizzle-orm/pg-core";

// Core person data from WikiTree
export const persons = pgTable(
  "persons",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    wikiId: text("wiki_id").unique().notNull(),
    wikiNumericId: integer("wiki_numeric_id"),
    name: text("name"),
    firstName: text("first_name"),
    middleName: text("middle_name"),
    lastNameBirth: text("last_name_birth"),
    lastNameCurrent: text("last_name_current"),
    suffix: text("suffix"),
    gender: text("gender"),
    birthDate: text("birth_date"), // Keep as text for partial dates like "1750"
    deathDate: text("death_date"),
    birthLocation: text("birth_location"),
    deathLocation: text("death_location"),
    isLiving: boolean("is_living").default(false),
    generation: integer("generation"),
    fatherWikiId: text("father_wiki_id"),
    motherWikiId: text("mother_wiki_id"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_persons_wiki_id").on(table.wikiId),
    index("idx_persons_birth_location").on(table.birthLocation),
    index("idx_persons_last_name").on(table.lastNameBirth),
  ]
);

// Relationships between persons (parent-child, spouse)
export const relationships = pgTable(
  "relationships",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    personId: integer("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    relatedPersonId: integer("related_person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    relationshipType: text("relationship_type").notNull(), // 'parent', 'child', 'spouse'
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_relationships_person").on(table.personId),
    index("idx_relationships_related").on(table.relatedPersonId),
    unique("unique_relationship").on(
      table.personId,
      table.relatedPersonId,
      table.relationshipType
    ),
  ]
);

// Crawl queue for WikiTree profiles to fetch
export const crawlQueue = pgTable(
  "crawl_queue",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    wikiId: text("wiki_id").unique().notNull(),
    status: text("status").default("pending"), // 'pending', 'processing', 'completed', 'error'
    priority: integer("priority").default(0),
    sourcePersonId: integer("source_person_id"),
    createdAt: timestamp("created_at").defaultNow(),
    processedAt: timestamp("processed_at"),
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").default(0),
  },
  (table) => [
    index("idx_queue_status").on(table.status),
    index("idx_queue_priority").on(table.priority),
  ]
);

// Geocoded locations cache
export const locations = pgTable(
  "locations",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    rawLocation: text("raw_location").unique().notNull(),
    latitude: real("latitude"),
    longitude: real("longitude"),
    normalizedName: text("normalized_name"),
    country: text("country"),
    state: text("state"),
    city: text("city"),
    geocodedAt: timestamp("geocoded_at"),
  },
  (table) => [index("idx_locations_raw").on(table.rawLocation)]
);

// Crawl metadata for tracking progress
export const crawlMetadata = pgTable("crawl_metadata", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Type exports
export type Person = typeof persons.$inferSelect;
export type NewPerson = typeof persons.$inferInsert;

export type Relationship = typeof relationships.$inferSelect;
export type NewRelationship = typeof relationships.$inferInsert;

export type QueueItem = typeof crawlQueue.$inferSelect;
export type NewQueueItem = typeof crawlQueue.$inferInsert;

export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;

export type CrawlMetadata = typeof crawlMetadata.$inferSelect;
