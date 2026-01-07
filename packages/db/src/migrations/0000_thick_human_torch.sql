CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crawl_metadata" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crawl_queue" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "crawl_queue_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"wiki_id" text NOT NULL,
	"status" text DEFAULT 'pending',
	"priority" integer DEFAULT 0,
	"source_person_id" integer,
	"created_at" timestamp DEFAULT now(),
	"processed_at" timestamp,
	"error_message" text,
	"retry_count" integer DEFAULT 0,
	CONSTRAINT "crawl_queue_wiki_id_unique" UNIQUE("wiki_id")
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "locations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"raw_location" text NOT NULL,
	"latitude" real,
	"longitude" real,
	"normalized_name" text,
	"country" text,
	"state" text,
	"city" text,
	"geocoded_at" timestamp,
	CONSTRAINT "locations_raw_location_unique" UNIQUE("raw_location")
);
--> statement-breakpoint
CREATE TABLE "persons" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "persons_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"wiki_id" text NOT NULL,
	"wiki_numeric_id" integer,
	"name" text,
	"first_name" text,
	"middle_name" text,
	"last_name_birth" text,
	"last_name_current" text,
	"suffix" text,
	"gender" text,
	"birth_date" text,
	"death_date" text,
	"birth_location" text,
	"death_location" text,
	"is_living" boolean DEFAULT false,
	"generation" integer,
	"father_wiki_id" text,
	"mother_wiki_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "persons_wiki_id_unique" UNIQUE("wiki_id")
);
--> statement-breakpoint
CREATE TABLE "relationships" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "relationships_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"person_id" integer NOT NULL,
	"related_person_id" integer NOT NULL,
	"relationship_type" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unique_relationship" UNIQUE("person_id","related_person_id","relationship_type")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_related_person_id_persons_id_fk" FOREIGN KEY ("related_person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "idx_queue_status" ON "crawl_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_queue_priority" ON "crawl_queue" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "idx_locations_raw" ON "locations" USING btree ("raw_location");--> statement-breakpoint
CREATE INDEX "idx_persons_wiki_id" ON "persons" USING btree ("wiki_id");--> statement-breakpoint
CREATE INDEX "idx_persons_birth_location" ON "persons" USING btree ("birth_location");--> statement-breakpoint
CREATE INDEX "idx_persons_last_name" ON "persons" USING btree ("last_name_birth");--> statement-breakpoint
CREATE INDEX "idx_relationships_person" ON "relationships" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_relationships_related" ON "relationships" USING btree ("related_person_id");