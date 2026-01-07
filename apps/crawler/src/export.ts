import "dotenv/config";
import { PGlite } from "@electric-sql/pglite";
import { writeFile, mkdir } from "fs/promises";
import { dirname } from "path";

/**
 * Export the PGLite database to a gzipped tarball for browser loading.
 */
export async function exportDatabase(dataDir: string, outputPath: string): Promise<void> {
  console.log("\n--- Exporting Database ---\n");
  console.log(`Source: ${dataDir}`);
  console.log(`Output: ${outputPath}`);

  // Open existing database
  console.log("\nOpening database...");
  const client = new PGlite(dataDir);
  await client.waitReady;

  // Get some stats
  const personCount = await client.query<{ count: string }>(
    "SELECT COUNT(*) as count FROM persons",
  );
  const locationCount = await client.query<{ count: string }>(
    "SELECT COUNT(*) as count FROM locations",
  );
  console.log(`\nDatabase contains:`);
  console.log(`  - ${personCount.rows[0]?.count || 0} persons`);
  console.log(`  - ${locationCount.rows[0]?.count || 0} geocoded locations`);

  // Dump to gzipped tarball
  console.log("\nDumping database to gzipped tarball...");
  const dump = await client.dumpDataDir("gzip");

  // Ensure output directory exists
  await mkdir(dirname(outputPath), { recursive: true });

  // Write to file
  const buffer = Buffer.from(await dump.arrayBuffer());
  await writeFile(outputPath, buffer);

  const sizeMB = (dump.size / 1024 / 1024).toFixed(2);
  console.log(`\nExport complete!`);
  console.log(`  Size: ${sizeMB} MB`);
  console.log(`  Path: ${outputPath}`);

  await client.close();
}
