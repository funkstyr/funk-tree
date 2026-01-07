import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema",
  out: "./src/migrations",
  dialect: "postgresql",
  driver: "pglite",
  dbCredentials: {
    url: "../../data/pglite",
  },
});
