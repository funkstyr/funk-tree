ALTER TABLE "locations" ADD COLUMN "location_key" text;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "birth_location_key" text;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "death_location_key" text;--> statement-breakpoint
CREATE INDEX "idx_locations_key" ON "locations" USING btree ("location_key");--> statement-breakpoint
CREATE INDEX "idx_locations_coords" ON "locations" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "idx_persons_birth_location_key" ON "persons" USING btree ("birth_location_key");--> statement-breakpoint
CREATE INDEX "idx_persons_death_location" ON "persons" USING btree ("death_location");--> statement-breakpoint
CREATE INDEX "idx_persons_death_location_key" ON "persons" USING btree ("death_location_key");--> statement-breakpoint
CREATE INDEX "idx_persons_father_wiki_id" ON "persons" USING btree ("father_wiki_id");--> statement-breakpoint
CREATE INDEX "idx_persons_mother_wiki_id" ON "persons" USING btree ("mother_wiki_id");--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_location_key_unique" UNIQUE("location_key");